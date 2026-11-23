# ADR 0014: Google sign-up in the desktop app, signed updates, notifications

- Status: accepted
- Date: 2026-11-23

## Context

The desktop app (ADR 0008) sent first-time Google users to the browser to finish
signing up, had to be reinstalled by hand for every new version, and could not tell
the user about new messages while it was in the background.

## Decision

**Google sign-up inside the app (option A).** Google still runs in the system
browser (RFC 8252). For a first-time Google user the callback now sends the app a
sign-up code instead of the "finish in the browser" error: the verified identity and
the app's PKCE challenge, encrypted with `Phoenix.Token` and valid for 15 minutes, so
the email does not travel readable through the loopback URL. The app redeems it at
`/api/auth/desktop/exchange` with its verifier, which returns what the form shows
(email, Google name, no token), then shows the same form as the web
(`CompleteSignupForm`: display name and 18+). `POST /api/auth/desktop/complete-signup`
with the code, the verifier and the form creates the account and returns a session
token. Only the app holding the verifier can use the code; a second use fails because
the Google account is then registered. No server-side state is needed.

**Updates: signed, from GitHub Releases, the user chooses when to restart (option
A).** The Tauri updater checks `releases/latest/download/latest.json` when the app
starts, every six hours while it stays open, and when the user presses "Check for
updates" in the bottom right corner, which shows the version and is there whether
or not anyone is signed in (Burak's request). A new version is downloaded in the
background; a banner offers "Restart now" (leaving any call cleanly first) or
"Later", and the corner keeps offering the restart. A call is never cut off by an
update.

- Every update is signed with a key that Burak generates and keeps; GitHub Actions
  holds a copy as a secret (`TAURI_SIGNING_PRIVATE_KEY` and its password). The app
  contains only the public key and refuses an update without a valid signature, so
  whoever could change a release on GitHub still could not ship code to users.
- This is not Windows code signing (Microsoft's trust, SmartScreen), which stays in
  phase 12.
- `.github/workflows/desktop-release.yml` runs on a tag `desktop-v<version>` that must
  match `desktop/tauri.conf.json`: it builds the installer and the signed update,
  writes `latest.json` and publishes the release. Building the updater files needs
  the key, so they are enabled only there (`--config`), and local builds work without
  it.
- The update path was tested end to end with a throwaway key and a local server
  before the first real release.

**Notifications: author and channel, not the text, by default (option A).** A new
topic `user:<id>` (only that user can join) follows every community the user belongs
to and pushes `notify` for a message someone else wrote, with the community and
channel names. Joining a community adds it; being removed, or the community being
deleted, stops it at once. The desktop app shows a Windows notification only while
it is in the background: "Ayşe in #general", with the community name as the body.
"Show the message text" (off by default) adds a shortened text: Windows keeps
notifications in its history, where anyone at the computer can read them. Both
settings belong to the device. Muting single communities waits for phase 11.

**Small desktop gaps found while testing.** The app has no address bar and no back
button: a Back button (shown when there is a page of the app to go back to) sits
next to the title, and invite links are pasted on the communities page ("Join with
an invite"). Waiting for the browser during Google sign-in can be cancelled (the
user may close the browser), and starting again cancels a forgotten wait. While a
desktop sign-up is pending, the app shows only its form, not the sign-in page.

**A call belongs to the app, not to a page (fix after phase 10).** The call used to
live inside the community page, so the Back button or opening settings ended it.
The call is now app state (`voice/call.ts`) shown above every page, and the
community's live connection is shared (`gateway/sharedConnections.ts`) between the
page and the call: Phoenix allows a topic once per socket, and the call keeps the
user shown in the voice channel while the page is closed. Leaving, joining another
channel, being removed from the community or signing out ends it.

## Consequences

- Burak must keep the private update key safe: if it is lost, installed apps can no
  longer be updated (a new key needs a manual reinstall); if it leaks, someone with
  access to the releases could ship an update.
- Until the production server (phase 12), a published release still connects to the
  address in `client/.env.desktop`; releases before then are for testing.
- Each message is sent once more to every member who has the desktop app open (their
  own topic). Fine at the size of a community today; revisit for very large ones.
