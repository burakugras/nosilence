# ADR 0015: Usernames, friends, blocking and direct and group conversations

- Status: accepted
- Date: 2026-11-26

## Context

Phase 11 lets people find each other and talk outside communities. It is split in
two (Burak, option 1A): 11a, friends and conversations, here; 11b, profile picture,
status, mentions, reactions and the notification work deferred from phase 10.

## Decision

**Unique usernames (option 2A).** Display names are not unique, so everyone picks a
username once after signing in (3-32 characters: letters, digits, `_` and `.`;
compared case-insensitively; a few official-looking names reserved). It can be
changed in Settings.

**Friends.** A request goes by username or from a shared community's member list. If
the other person had asked first, asking back accepts. The receiver chooses who may
send requests: everyone (default) or only people in their communities. A sender may
send 20 an hour. A request to an unknown username, to oneself, to someone who
blocked the sender or whose setting does not allow it all get the same answer, so a
block or a setting is never revealed.

**Blocking.** Ends any friendship or request between the two and refuses requests
and new direct messages both ways. The blocked person is not told.

**Who may message whom (option 4A).** A direct conversation is possible with friends
always, and with people in a shared community unless they turned that off. The rule
is checked again on every message: after a block, or when the conditions no longer
hold, nobody can write, but the history stays readable. Group conversations hold up
to ten people; members add their own friends; the creator can remove people; anyone
can rename or leave; the last one out deletes it.

**Not end-to-end encrypted yet (option 3A).** Conversation messages are stored like
channel messages: protected on the way, readable by the server. The conversation
view says so. End-to-end encrypted text (persistent device keys, several devices,
delivery to offline devices, history on a new device) needs its own phase; Burak
will consider doing it before more social features (option D). Messages keep the
`encryption` field ("none" today) so encrypted ones can follow without a new format.

**One chat view.** Conversations reuse the community text channel view (unread line,
scrolling, editing three times, deleting own messages, read position): it takes a
message API and a title. Conversation messages live in their own table
(`conversation_messages`) so community message code and permissions stay untouched.

**Live updates on the user's own topic.** `user:<id>` (ADR 0014) now also carries
`friends_changed`, `conversation_changed` and `dm_created / dm_updated / dm_deleted`
to every member, on the web as well as in the desktop app. The header shows unread
direct messages; the desktop app notifies about them like channel messages (no text
unless the user enables it).

Account data: the export holds the username, the privacy choices, friends and
conversation messages; "delete my messages" also deletes conversation messages.

## Consequences

- Until end-to-end encrypted text arrives, conversation messages could be handed
  over on a lawful request like channel messages.
- Each conversation message is sent to every member's topic; groups are small (ten).
- Existing accounts see the username page once.

## Amendment (2026-11-27): writing welcomes a reply

Messaging permission was checked against the recipient's privacy setting on every
message, so someone who took no messages from community members could write to a
member who could not answer. Burak's decision: once someone has written in a direct
conversation, the other person may reply, whatever the writer's own setting says; the
setting stops others from *starting* a conversation. A block always wins. The
conversation list carries `can_write`, and where it is false the app shows a note in
place of the composer (it does not say why, so a block is not revealed).

