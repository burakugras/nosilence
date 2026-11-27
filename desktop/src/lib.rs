// SPDX-License-Identifier: AGPL-3.0-only
//
// Nosilence desktop app (ADR 0008): a Tauri window that runs the client built
// into the app (client/dist-desktop), plus what a browser cannot do:
//
// * keep the session token in the OS credential store,
// * sign in with Google through the system browser (RFC 8252 loopback + PKCE),
// * live in the system tray, so closing the window does not end a call.

mod ptt;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const KEYRING_SERVICE: &str = "app.nosilence.desktop";
const KEYRING_USER: &str = "session";
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// Ends the Google sign-in that is waiting for the browser (the user closed it).
/// Starting another sign-in drops the previous sender, which ends that wait too.
static CANCEL_SIGN_IN: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>> =
    std::sync::Mutex::new(None);
/// How long the client may take to leave a call cleanly before the app quits anyway.
const QUIT_GRACE: Duration = Duration::from_millis(1500);

fn token_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_token() -> Result<Option<String>, String> {
    match token_entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn store_token(token: String) -> Result<(), String> {
    token_entry()?
        .set_password(&token)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_token() -> Result<(), String> {
    match token_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Serialize)]
#[serde(untagged)]
enum GoogleResult {
    /// The one-time code from the server and the verifier that redeems it.
    Code {
        code: String,
        verifier: String,
    },
    Error {
        error: String,
    },
}

/// Opens Google sign-in in the system browser and waits for the server to send
/// the browser back to our loopback listener with a one-time code.
#[tauri::command]
async fn google_sign_in(app: AppHandle, api_origin: String) -> Result<GoogleResult, String> {
    if !(api_origin.starts_with("http://") || api_origin.starts_with("https://")) {
        return Err("invalid server address".into());
    }

    let mut random = [0u8; 32];
    getrandom::fill(&mut random).map_err(|e| e.to_string())?;
    let verifier = URL_SAFE_NO_PAD.encode(random);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));

    // Loopback only, any free port, one sign-in at a time.
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let url =
        format!("{api_origin}/api/auth/google?desktop_port={port}&desktop_challenge={challenge}");
    open::that(&url).map_err(|e| e.to_string())?;

    let (cancel, cancelled) = tokio::sync::oneshot::channel();
    if let Ok(mut slot) = CANCEL_SIGN_IN.lock() {
        *slot = Some(cancel);
    }
    let result = tokio::select! {
        waited = tokio::time::timeout(SIGN_IN_TIMEOUT, wait_for_callback(&listener, &api_origin)) =>
            waited.unwrap_or_else(|_| Ok(Query::error("timeout")))?,
        _ = cancelled => return Ok(GoogleResult::Error { error: "cancelled".into() }),
    };

    // Bring the app back in front of the browser.
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }

    Ok(match result.code {
        Some(code) => GoogleResult::Code { code, verifier },
        None => GoogleResult::Error {
            error: result.error.unwrap_or_else(|| "google".into()),
        },
    })
}

/// The user gave up on the browser: stop waiting and close the loopback listener.
#[tauri::command]
fn cancel_google_sign_in() {
    if let Some(cancel) = CANCEL_SIGN_IN.lock().ok().and_then(|mut slot| slot.take()) {
        let _ = cancel.send(());
    }
}

#[derive(Default)]
struct Query {
    code: Option<String>,
    error: Option<String>,
    next: Option<String>,
}

impl Query {
    fn error(code: &str) -> Self {
        Query {
            error: Some(code.into()),
            ..Default::default()
        }
    }
}

/// Serves the browser's request to /callback; ignores anything else (e.g. favicon).
async fn wait_for_callback(listener: &TcpListener, api_origin: &str) -> Result<Query, String> {
    loop {
        let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
        let mut buffer = vec![0u8; 8192];
        let n = stream.read(&mut buffer).await.unwrap_or(0);
        let request = String::from_utf8_lossy(&buffer[..n]);
        let target = request
            .lines()
            .next()
            .and_then(|l| l.split_whitespace().nth(1))
            .unwrap_or("");

        let Some(query) = target.strip_prefix("/callback?") else {
            let _ = stream
                .write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n")
                .await;
            continue;
        };

        let mut parsed = Query::default();
        for (key, value) in form_urlencoded::parse(query.as_bytes()) {
            match key.as_ref() {
                "code" => parsed.code = Some(value.into_owned()),
                "error" => parsed.error = Some(value.into_owned()),
                "next" => parsed.next = Some(value.into_owned()),
                _ => {}
            }
        }

        let response = match parsed
            .next
            .as_deref()
            .filter(|next| same_host(next, api_origin))
        {
            // First-time Google user: finish creating the account in the browser.
            Some(next) => {
                format!("HTTP/1.1 302 Found\r\nLocation: {next}\r\nContent-Length: 0\r\n\r\n")
            }
            None => {
                let body = "<!doctype html><meta charset=utf-8><title>Nosilence</title>\
                    <p style=\"font:16px system-ui;margin:2rem\">You can close this tab and return to Nosilence.</p>";
                format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\r\n{body}",
                    body.len()
                )
            }
        };
        let _ = stream.write_all(response.as_bytes()).await;
        return Ok(parsed);
    }
}

/// Only follow `next` to the server's own host, never anywhere else.
fn same_host(url: &str, api_origin: &str) -> bool {
    fn host(u: &str) -> Option<&str> {
        let rest = u
            .strip_prefix("https://")
            .or_else(|| u.strip_prefix("http://"))?;
        rest.split(['/', ':', '?']).next()
    }
    !url.contains(['\r', '\n']) && host(url).is_some() && host(url) == host(api_origin)
}

/// Quit from the tray: let the client leave a call cleanly first (so the others
/// see us go at once instead of after LiveKit's timeout), then exit.
#[tauri::command]
fn request_quit(app: AppHandle) {
    let _ = app.emit("quit-requested", ());
    std::thread::spawn(move || {
        std::thread::sleep(QUIT_GRACE);
        app.exit(0);
    });
}

/// The client finished cleaning up.
#[tauri::command]
fn quit_now(app: AppHandle) {
    app.exit(0);
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // One app at a time (ADR 0018): starting it again, or opening a
        // nosilence:// link, brings the running window forward; the deep-link
        // plugin hands the link to it. Must be the first plugin.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main(app)
        }))
        // The nosilence:// scheme is registered by the installer (tauri.conf.json),
        // never at run time: development builds leave the registry alone.
        .plugin(tauri_plugin_deep_link::init())
        // Signed updates from GitHub Releases, and restarting into them (ADR 0014).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            load_token,
            store_token,
            clear_token,
            google_sign_in,
            cancel_google_sign_in,
            request_quit,
            quit_now,
            ptt::set_push_to_talk
        ])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show Nosilence", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().expect("app icon"))
                .tooltip("Nosilence")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => request_quit(app.clone()),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        // Closing the window hides it to the tray, so a call keeps going.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Nosilence");
}

#[cfg(test)]
mod tests {
    use super::same_host;

    #[test]
    fn next_must_stay_on_the_server_host() {
        let api = "http://127.0.0.1:4000";
        assert!(same_host("http://127.0.0.1:5173/complete-signup", api));
        assert!(!same_host("https://evil.test/complete-signup", api));
        assert!(!same_host("http://127.0.0.1.evil.test/x", api));
        assert!(!same_host("http://127.0.0.1:5173/\r\nSet-Cookie: x", api));
        assert!(!same_host("javascript:alert(1)", api));
    }
}
