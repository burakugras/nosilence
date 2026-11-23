// SPDX-License-Identifier: AGPL-3.0-only
//! Push-to-talk while other apps are in front (ADR 0013).
//!
//! A registered Windows hotkey cannot be only modifiers (Ctrl + Shift) and
//! takes the key away from other apps; a keyboard hook sees every key and
//! antivirus may take it for a key logger. Instead a thread polls the state of
//! the chosen keys only, 50 times a second, and tells the client "held" or
//! "released". Nothing else about the keyboard leaves this module, and the keys
//! keep working in other apps.

use std::sync::{Mutex, Once};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const POLL: Duration = Duration::from_millis(20);
const IDLE: Duration = Duration::from_millis(250);
const MAX_KEYS: usize = 3;

/// Windows virtual-key codes of the keys being watched; empty: not watching.
static KEYS: Mutex<Vec<i32>> = Mutex::new(Vec::new());
static START: Once = Once::new();

/// Maps the client's key ids (client/src/voice/settings.ts) to virtual keys.
pub fn virtual_key(id: &str) -> Option<i32> {
    match id {
        "Ctrl" => Some(0x11),
        "Shift" => Some(0x10),
        "Alt" => Some(0x12),
        "Space" => Some(0x20),
        "Mouse4" => Some(0x05),
        "Mouse5" => Some(0x06),
        _ => {
            if let Some(letter) = id.strip_prefix("Key") {
                let c = single_char(letter)?;
                return c.is_ascii_uppercase().then_some(c as i32);
            }
            if let Some(digit) = id.strip_prefix("Digit") {
                let c = single_char(digit)?;
                return c.is_ascii_digit().then_some(c as i32);
            }
            let n: i32 = id.strip_prefix('F')?.parse().ok()?;
            (1..=12).contains(&n).then_some(0x70 + n - 1)
        }
    }
}

fn single_char(s: &str) -> Option<char> {
    let mut chars = s.chars();
    let c = chars.next()?;
    chars.next().is_none().then_some(c)
}

/// Watch these keys (all held = talking); an empty list stops watching.
#[tauri::command]
pub fn set_push_to_talk(app: AppHandle, keys: Vec<String>) -> Result<(), String> {
    if keys.len() > MAX_KEYS {
        return Err("at most three keys".into());
    }
    let codes = keys
        .iter()
        .map(|k| virtual_key(k))
        .collect::<Option<Vec<_>>>()
        .ok_or("unsupported key")?;
    *KEYS.lock().map_err(|_| "poisoned")? = codes;
    START.call_once(|| {
        std::thread::spawn(move || poll(app));
    });
    Ok(())
}

fn poll(app: AppHandle) {
    let mut held = false;
    loop {
        let keys = KEYS.lock().map(|k| k.clone()).unwrap_or_default();
        let now = !keys.is_empty() && keys.iter().all(|&vk| is_down(vk));
        if now != held {
            held = now;
            let _ = app.emit("push-to-talk", held);
        }
        std::thread::sleep(if keys.is_empty() { IDLE } else { POLL });
    }
}

#[cfg(windows)]
fn is_down(vk: i32) -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    // The high bit: the key is down right now.
    unsafe { (GetAsyncKeyState(vk) as u16) & 0x8000 != 0 }
}

#[cfg(not(windows))]
fn is_down(_vk: i32) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::virtual_key;

    #[test]
    fn maps_the_client_key_ids() {
        assert_eq!(virtual_key("Ctrl"), Some(0x11));
        assert_eq!(virtual_key("Shift"), Some(0x10));
        assert_eq!(virtual_key("KeyV"), Some(0x56));
        assert_eq!(virtual_key("Digit7"), Some(0x37));
        assert_eq!(virtual_key("F1"), Some(0x70));
        assert_eq!(virtual_key("F12"), Some(0x7B));
        assert_eq!(virtual_key("Mouse4"), Some(0x05));
    }

    #[test]
    fn refuses_anything_else() {
        for id in ["F13", "F0", "Keyv", "KeyAB", "Digit", "Enter", "Meta", ""] {
            assert_eq!(virtual_key(id), None, "{id}");
        }
    }
}
