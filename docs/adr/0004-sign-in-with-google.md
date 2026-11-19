# ADR 0004: Sign in with Google

- Status: accepted
- Date: 2026-11-19

## Context

Phase 2b adds Google as a second way to sign in, next to email and password (ADR 0003).
It must not weaken account security, must still require the 18+ confirmation, and must
work for the web client now and the desktop app later.

## Decision

**OpenID Connect authorization code flow with PKCE, state and nonce**, run by the server.
The browser goes to `/api/auth/google`; the server redirects to Google and keeps `state`,
`nonce` and the PKCE verifier in a signed, HttpOnly, `SameSite=Lax`, 10-minute cookie that
is deleted on the callback. Rejected: the implicit flow and client-side Google libraries
(tokens in page JavaScript, third-party script on every page).

**ID token validation.** The server exchanges the code with Google's token endpoint over
TLS using the client secret and verifier, then checks issuer, audience (our client id),
expiry, nonce and `email_verified`. Because the token comes directly from Google's token
endpoint, OpenID Connect Core 3.1.3.7 allows TLS server validation in place of checking
the token signature, so we do not fetch Google's signing keys. If ID tokens are ever
accepted from any other channel (for example from the desktop app), signature checking
becomes mandatory.

**Accounts are matched by Google's `sub`**, never by display name. If no account has that
`sub` but one has the same email, Google is linked to it: Google has verified the email.
If that account was **never confirmed**, its password is removed while linking. Otherwise
someone could register a victim's email first, wait for the victim to sign in with Google,
and then sign in with their own password (pre-account takeover).

**First-time Google users finish sign-up** on `/complete-signup`: display name and the 18+
confirmation. Until then the verified identity waits in a signed, HttpOnly, 15-minute
cookie; no account exists yet. Google accounts start confirmed and without a password.

**Configuration is optional.** Without `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` the button
is hidden and `/api/auth/google` returns 404. Credentials live in `infra/.env` locally and in
environment variables in production.

## Consequences

- Tests stub Google's token endpoint with `Req.Test`; no request leaves the machine.
- The Google OAuth client is in "Testing" mode: only listed test users can sign in. Before
  the public launch (phase 8) the consent screen needs a privacy policy URL, the production
  redirect URI, and verification by Google if required.
- Sending users to Google is a transfer of personal data abroad under KVKK; it is covered
  in the privacy policy work of phase 8.
- Phase 6 (desktop) will need its own flow, e.g. the system browser with a loopback
  redirect, ending in the same server-side checks.
