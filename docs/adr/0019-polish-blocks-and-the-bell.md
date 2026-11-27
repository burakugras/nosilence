# ADR 0019: Blocks and mentions, the bell's list, and the notification settings window

- Status: accepted
- Date: 2026-11-27

## Context

Burak's first list of fixes after phase 11. Four were bugs (fixed without a decision:
the "New" label crossed by its line, a hover highlight that trailed the pointer, sending
not always scrolling to the end, the members column jumping while a community loaded).
Three needed a decision: the look of the notification settings window (1A), mentions
and blocking (2B), and what the bell next to a community's name shows (3A).

## Decision

**Mentions and blocking (2B).** A block is never revealed (ADR 0015). Hiding the blocker
from the blocked person's @suggestions would tell them, since the blocker still shows in
the members list. So the blocked person can still type the name, but the server drops
the mention of anyone who blocked the author (channels and conversations), without an
error. The blocker gets nothing from the people they blocked: no `notify` push at all,
their @everyone/@here does not count or stand out, and they are not in the blocker's
own suggestions (`social/blockedStore.ts`; that reveals nothing, it is the user's own
choice).

**The bell's list (3A).** The bell next to a community's name lists the last ten messages
of that community that notify the user at their levels
(`GET /api/communities/:id/notifications`): from others they did not block, in channels
set to all messages, or mentioning them in channels set to only mentions. One line each
(author, channel, the start of the text, time), unread ones in bold, mentions marked;
clicking one opens its channel. The levels moved out of the bell: they are in the
community name's menu (and each channel's bell).

**The settings window (1A).** The same popover, redesigned: a title with the community,
channel or conversation; the levels as cards with an icon and a line saying what each
means; how long as one segmented control; Cancel and Save.

## Consequences

- `Social.blocked_ids/1`, `Social.blocking/2`, `Messaging.recent_notifications/2`;
  on the client `NotificationList`, `blockedStore`.
- Mentions of a blocker typed before the block keep counting until read; new ones are
  dropped.
