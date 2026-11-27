# ADR 0018: Notification levels, mentions on the rail, friends' status and desktop links

- Status: accepted
- Date: 2026-11-27

## Context

Phase 11b-2 finishes phase 11: the notification work deferred from phase 10 (browser
notifications, muting, `nosilence://` invite links) and what 11b-1 left (friends' status
outside communities, who reacted, a count of unread mentions). Burak chose 1A, 2B, 3B,
4A and 5A.

## Decision

**Levels on the server (1A).** For a community, a text channel or a conversation the user
chooses all messages, only mentions, or nothing, for 1, 8 or 24 hours or until they change
it (`notification_settings`, at most 30 days ahead). A channel's own level comes before its
community's ("Default" follows the community); without a setting everything notifies.
The settings follow the user to every device (`notification_settings_changed` on their
topic). The apps apply the levels; the server uses them only to leave out messages of
communities set to nothing from `notify`, except those that mention the user. "Nothing"
also silences mentions; do not disturb (ADR 0017) silences everything.

**The rail (2B).** A red count means "this concerns you": direct messages on Home, unread
mentions on a community (`mentions` next to `unread` in the community list and per
channel; the app adds live ones and clears a channel's when it is opened). Other unread
messages are a dot. Communities set to nothing show no dot and look dimmed. In the channel
list, mentions are red and other counts grey; each text channel has a bell.

**Browser notifications (3B).** The web app shows the same notifications as the desktop
app while its tab is in the background, if the browser allows them. The browser's question
is asked only after the user clicks: in Settings → Notifications (now on the web too) or in
a strip shown once until it is answered or dismissed. Clicking a notification brings the
tab forward and opens the channel or conversation. (The desktop notification plugin cannot
report clicks on Windows yet.)

**Friends' status (4A).** Each connection of a user is tracked on
`friend_presence:<user id>`, a topic only the user's friends' connections follow, so the
status reaches nobody else; invisible people are not tracked at all. The user topic sends
`friends_presence` (everyone, on join and when friends change) and `friend_presence` (one
friend's change); idle is reported there as on community topics. The friends page shows
each friend's status and text; the direct message list shows the dot when it is known.

**Who reacted.** Pointing at or focusing a reaction asks the server for the first 20 names
and the total (members only) and shows "Ayşe, Cem and 3 others reacted with 👍".

**`nosilence://` links (5A).** The desktop app uses Tauri's single-instance plugin (a second
start, or a link, goes to the running window) and deep-link plugin. The installer
registers the scheme (from `tauri.conf.json`); the app never registers it at run time, so a
development build leaves the registry alone. `nosilence://invite/<code>` opens the invite
page, which still shows the community and waits for "Join"; nothing is joined by a link.
The web invite page offers the link for people who have the app.

## Consequences

- New: `Nosilence.NotificationSettings`, `Messaging.mention_counts/2`, `reactors/3`
  (channel and conversation), the user topic's friends' presence; on the client
  `notifications/levels.ts`, `NotificationMenu`, `NotificationPrompt`,
  `presence/friendsPresence.ts`, `onDeepLink`.
- New dependencies: `tauri-plugin-single-instance`, `tauri-plugin-deep-link`,
  `@tauri-apps/plugin-deep-link` (all MIT OR Apache-2.0).
- Trying a `nosilence://` link needs the installed app (the installer registers the
  scheme).
