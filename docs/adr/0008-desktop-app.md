# ADR 0008: Windows desktop app with Tauri

- Status: accepted
- Date: 2026-11-20

## Context

Phase 6 ships Nosilence as a Windows app next to the web app, from the same React client.
A macOS app may follow later.

## Decision

**Tauri, not Electron.** Tauri uses the system WebView (WebView2, Chromium-based, on
Windows) and a small Rust core: the installer is about 2.3 MB instead of about 100 MB,
memory use is lower, and the engine is kept up to date by Windows. Electron would give the
same Chromium on every OS, which matters most for macOS, where Tauri uses WebKit. To keep
that door open, everything desktop-specific lives in `client/src/platform` and `desktop/`;
the rest of the client does not know which shell it runs in. Before a macOS release,
microphone access and LiveKit E2EE must be checked in WKWebView; if they fail, a macOS
shell in Electron reuses the same client.

**The client is built into the app (option 1A).** The app loads `client/dist-desktop` from
its own origin (`http://tauri.localhost`), never pages from the server. On the web the
server delivers the code that handles E2EE keys on every visit, so a compromised server
could ship code that leaks them; in the app that code is fixed at install time and can be
checked against the published source. The API and gateway allow the desktop origin
(CORS without credentials, gateway Origin check); its address is set at build time in
`client/.env.desktop`.

**Session token in the OS credential store.** A browser cookie does not work across the
app's origin and the API, so the app signs in like this: from a desktop origin,
`POST /api/session` returns the session token in JSON (never to web pages, which keep the
HttpOnly cookie). The app keeps it in Windows Credential Manager (`keyring`) and sends it
as `Authorization: Bearer`; signing out deletes it there too.

**Google sign-in in the system browser** (RFC 8252). The app listens on a random loopback
port and opens `/api/auth/google?desktop_port=…&desktop_challenge=…` (PKCE S256). After
Google, the server redirects only to `http://127.0.0.1:<port>/callback` with a one-time
code (2 minutes, stored hashed, bound to the challenge). The app redeems it with its
verifier at `POST /api/auth/desktop/exchange`; a wrong verifier uses the code up. A
first-time Google user finishes signing up in the browser and then signs in again in the
app.

**Installer: NSIS, per user (option 3A).** No administrator rights. System tray: closing
the window hides it, so a call continues; the tray menu shows the window or quits.

**Push-to-talk is deferred** (Burak, 2026-11-20). Tauri's global shortcut takes the key away
from other apps; a listening keyboard hook does not, also allows mouse buttons, but may be
flagged by antivirus software. The method is decided later.

## Consequences

- Checked with the release build: the app signs in, stores the token in Credential Manager
  (no session cookie), joins an encrypted call with a Chrome user (same verification code,
  both hear each other), and removes the token on sign-out.
- CI compiles, lints and tests the desktop shell on Windows.
- Deferred: code signing (SmartScreen warns until then) and automatic updates (both need
  phase 8 hosting), push-to-talk, first Google sign-up inside the app, the macOS check.
- The development server address in `client/.env.desktop` and the CSP in
  `desktop/tauri.conf.json` change to the production addresses in phase 8.
