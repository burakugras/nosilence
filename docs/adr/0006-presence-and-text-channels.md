# ADR 0006: Real-time gateway, presence and text channels

- Status: accepted
- Date: 2026-11-19

## Context

Phase 4 lets members see each other live (who is online, who is in which voice channel)
and adds text channels. Text is not end-to-end encrypted yet (ADR 0001), so the schema
must be ready for it, and nothing may leak content to logs or outsiders.

## Decision

**One WebSocket per client, one topic per community** (`community:<id>`), built with
Phoenix Channels in its own module group (`NosilenceWeb.Gateway`). Only members can join
a topic. Contexts publish events through `Nosilence.Events`; they do not know the gateway.

**Connection tickets (option A).** The client gets a 60-second signed ticket from
`POST /api/socket-token` (cookie-authenticated, JSON only) and sends it in the WebSocket
handshake header (`auth_token`), never in the URL. Another site cannot open a connection
with the user's cookie, because it cannot read a ticket. The Origin must also be the web
app's (defence in depth). The cost is one small extra request per (re)connect.
Rejected: authenticating the WebSocket with the session cookie and relying on the Origin
check alone.

**Presence from the server's own records (option A).** Phoenix Presence tracks each
connection; after joining a LiveKit room the client reports its voice channel, which the
server checks belongs to the community. Entries vanish when a connection closes.
Rejected for now: LiveKit webhooks as the source (deferred to phase 7 as a second source).

**Who is speaking stays inside the voice room (option A).** It comes from LiveKit to those
in the room; the server never learns who spoke when.

**E2EE-ready message envelope (option A).** `messages.content` is bytes with
`encryption` ("none" today, enforced by a check constraint) and a nullable `device_id`.
Moving to MLS changes the label and the bytes, not the table.

**Scope.** Text is a channel kind next to voice; new communities get `General` (voice)
and `general` (text). Send and delete (authors their own, owners any); no editing yet.
History pages of 50, newest first on the wire, oldest first on screen; at most 2000
characters, no control or bidirectional-override characters. Messages are kept until
deleted or until the community is deleted.

**Changes are live.** New members, new channels, new and deleted messages reach every
connected member as events (`member_joined`, `channel_created`, `message_created`,
`message_deleted`, `member_removed`); no page reload is needed.

**Losing access takes effect at once.** Removing a member or deleting a community pushes
`removed` and closes that topic for them, and removes them from LiveKit rooms. Signing out
or resetting a password closes all of the user's live connections.

**Content never reaches logs.** The `text` parameter is filtered, and the insert runs with
`log: false` because the query log prints parameters at debug level. A test checks this.

## Consequences

- Clients reload the latest page after every reconnect and reconcile it with what they
  have, so missed messages appear and messages deleted meanwhile disappear.
- Database and backup encryption at rest is deferred to phase 8; E2EE text comes after
  the MVP.
- The desktop app will need its origin allowed on the gateway (phase 6).
