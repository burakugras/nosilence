# ADR 0005: Communities, invites and voice channel capacity

- Status: accepted
- Date: 2026-11-19

## Context

Phase 3 adds the place people gather (called a server elsewhere), its members and roles,
voice channels and invite links, and enforces the voice room limit (8 for now, adjustable)
in the backend, not only in LiveKit.

## Decision

**Naming: "community"** in code and API. "Server" already means our backend.

**Roles: owner and member**, checked in one module (`Nosilence.Communities.Policy`).
Owners create channels, manage invites, remove members and delete the community; members
view, join voice and leave. The owner cannot leave (they delete instead); a partial unique
index guarantees one owner per community. A new role means changing `Policy` only.

**Non-members get 404**, never 403, for communities, members and channels, so they cannot
learn what exists.

**Invites expire and can be limited**: default 7 days, at most 30 days, optionally 1 to
1000 uses, revocable. Only the SHA-256 of the 32-byte token is stored. The use counter is
increased in the same SQL statement that checks expiry, revocation and remaining uses, so
two people cannot both take the last use. Re-accepting as a member does not use up an
invite. Tokens travel in request bodies, never URL paths, and Phoenix filters parameters
named `token`, `code`, `state`, `password` and `secret` from logs.

**Voice capacity is enforced twice** (option A of the phase discussion). Before issuing a
token the backend calls LiveKit's `CreateRoom` with `max_participants` set to the channel
capacity and `ListParticipants` to count others in the room; a full room gets a clear
409. LiveKit's own limit stops the rare case of two people passing the check at once.
The user's own identity does not count (rejoining replaces the old connection). If
LiveKit cannot be reached, no token is issued (fail closed).
Rejected: tracking occupancy from LiveKit webhooks (more moving parts; may come with
presence in phase 4) and relying on LiveKit alone (users would see a connection error
instead of "full").

**LiveKit rooms are named after channel ids**, so channels in different communities never
share a room and users cannot pick arbitrary room names. Server API calls use a 60-second
admin token scoped to that one room.

**Channel capacity is configuration**: default 8, maximum 8, minimum 2
(`config :nosilence, Nosilence.Communities`).

## Consequences

- The free-form room endpoint (`POST /api/voice/token`) is gone; voice is reached only
  through `POST /api/channels/:id/voice-token`.
- Production needs `LIVEKIT_API_URL` (HTTP URL of the LiveKit server API).
- Still open: transferring ownership, a moderator role, and channel renaming or deletion.
