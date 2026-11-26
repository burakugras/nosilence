# ADR 0017: Profile pictures, status, mentions and reactions

- Status: accepted
- Date: 2026-11-27

## Context

Phase 11b brings the social details people expect from a chat app: a picture, a status,
mentioning someone, and reacting to a message. Phase 11b was split in two (Burak,
2026-11-26): this part (11b-1), then the notification work deferred from phase 10
(11b-2), which builds on mentions and on "do not disturb". Text is not end-to-end
encrypted yet, but it will be; nothing here may need the server to read messages.

## Decision

**Profile pictures (option 2B).** The app crops the chosen photo to a square and
redraws it as a 256×256 WebP in the browser; redrawing keeps only pixels, so location
and camera data in the file are left behind. The server does not decode images: it
reads the WebP headers and accepts only a still WebP of 16–256 pixels a side and at most
256 KB, and stores it in its own table (`user_avatars`), so loading a user never loads
the bytes. Each new picture gets a version number; people, members, messages and
presence carry the version, and the app loads `/api/users/<id>/avatar?v=<version>` once
per version with the user's credentials (the desktop app cannot put its token on an
`<img>` address) and keeps it for the session. The newest version heard (presence, the
user's own changes) wins everywhere. Only the owner, friends and people who share a
community or a conversation may load a picture; anyone else gets 404, the same as for no
picture. It is served as `image/webp` with `nosniff`, a `sandbox` CSP and private
caching. Other options: redrawing on the server needs a native image library in Elixir;
object storage is a new piece of infrastructure before we need it.

**Status (option 3B).** A choice — online, do not disturb, invisible — and an optional
text of up to 60 characters with an optional end (1 hour, 4 hours, today, never; at most
30 days). "Idle" is not a choice: each app reports it on its live connection after ten
minutes without input, and someone is idle only if all their apps are. Do not disturb
silences the desktop notifications. Invisible is real, not only on screen: an invisible
person is not in the community's presence at all, so no client learns they are online;
in a voice channel, where everyone hears them anyway, they show as offline. Profile
changes reach the user's own connections through a server-only PubSub topic, so the user
struct is never broadcast; the user's apps get only the public fields
(`profile_changed`).

**Mentions (option 4B).** `@username` with suggestions while typing; `@everyone` and
`@here` for moderators and the owner (`Policy` action `:mention_everyone`). The app that
knows the text sends the ids it mentions (at most 20) with the message; the server keeps
the ids of members (others are dropped) and never parses the text, so mentions keep
working once text is end-to-end encrypted. Messages that mention the reader stand out
and the @names are highlighted; the `notify` push says `mentioned` for 11b-2.

**Reactions (option 5B).** A row of eight common reactions and a picker with every
emoji in Unicode 12.0 by group, with search by name, written here without a dependency
(the 47 KB list loads when the picker opens). 12.0 because Windows 10 draws emoji up to
that version. The server accepts exactly the picker's emoji (`priv/emoji.txt`, generated
with the client's list by `tools/emoji/generate.mjs`), each person once per emoji, and at
most 20 different emoji on a message (checked under a per-message lock). Reactions show at
once and are taken back if the server refuses. Live events carry no reactions, so the
ones on screen are kept when a message is edited. In a direct conversation that a block
closed, reacting is closed too.

Rate limits: 30 profile changes an hour, 30 reactions in 10 seconds. The data export
includes the picture (Base64), the status and the user's reactions; deleting a message
or an account deletes its reactions.

The desktop app's CORS rule now allows PUT and PATCH as well (editing a message already
used PATCH).

## Consequences

- New: `Nosilence.Profiles`, `Nosilence.Reactions`, `Nosilence.Emoji`, the migration
  `profiles_reactions_mentions`, `ProfileController`; on the client `ui/avatars.ts`,
  `presence/`, `ui/EmojiPicker.tsx`, `settings/ProfileSection.tsx` and the status menu in
  the user panel.
- Friends' status outside communities, who reacted, and a count of unread mentions are
  deferred to 11b-2; community emoji and newer emoji until after the MVP.
- When text becomes end-to-end encrypted, the mention ids stay visible to the server
  (who is mentioned, not what was said); that is the price of notifying them.
