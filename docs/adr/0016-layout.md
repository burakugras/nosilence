# ADR 0016: Layout, design tokens and themes

- Status: accepted
- Date: 2026-11-26

## Context

Every page was one long column: the call's statistics and encryption details, forms
for channels, invites and ownership, and member management buttons sat between the
messages. Burak found it cluttered and drew the layout he wanted (four columns, the
user and Mute/Deafen at the bottom left). A clickable prototype
(`docs/design/layout-prototype.html`) was reviewed before building it; this was done
before phase 11b so its screens are built once.

## Decision

**Four columns.** The rail (Home, every community with its unread count, "+" to create
or join), a channel column (Home: friends and direct messages; a community: its text
and voice channels with the people in them), the page, and a community's members
online and offline. Narrow windows hide the members (a header button opens them),
then the channel column (a menu button). Addresses: `/c/<community>/<channel>`,
`/messages/<conversation>`, `/new`.

**Home on the rail (option 1B)** instead of a top bar: one place to move around, and
the height goes to the chat. Profile, settings and sign-out moved to the user panel
at the bottom left.

**Management out of the chat.** The community name opens a menu: Invite people,
Community settings (moderators and the owner), Leave or Delete. Community settings is
a window with sections by role: Overview (and the danger zone), Channels (owner),
Members and roles, Invites, Ownership (owner). Clicking a member opens a card:
Message, Add friend, and by role Make or remove moderator, Disconnect from voice,
Remove from community, Block. User settings (Voice, Notifications on the desktop,
Username and privacy, Appearance, Account, About on the desktop) are one window too.

**The call shows itself small.** The call has no page of its own: the voice panel
above the user panel says "Connecting…", "Voice connected" or why it ended, with
Leave. Hovering, focusing or clicking it shows a short bubble (Burak's choice instead
of a window): connection quality, round trip, packet loss, how many hold the key, and
the verification code. The people in a voice channel are listed under it, the ones
speaking highlighted. VoiceRoom has no UI; it reports to `voice/callState.ts`.

**Mute and Deafen** in the user panel, like a headset's switches: they outlive a call.
Deafen silences all incoming audio and also mutes; undeafening restores the mute
chosen before; unmuting while deafened undeafens. Mute wins over push-to-talk.

**Design tokens, two themes (options 2A, 3A).** Colours, spaces, radii and type sizes
are CSS variables in `index.css`; the dark theme is the default and
`[data-theme='light']` switches. The choice (follow the system, dark, light) is kept
on the device (`theme.ts`) and applied before the first paint. No new dependency:
plain CSS, our own small popover and settings window (focus kept inside, Escape
closes), keyboard focus visible everywhere.

The server's community list now carries each community's unread count for the rail;
new messages elsewhere arrive on the user's own topic.

## Consequences

- Tests and `tools/netlab` use the new names (for example "Join General", "Voice
  connected: …", "Leave call"); netlab gained `--mute`.
- The settings and account pages are no longer pages: their old addresses open the
  window.
- Profile pictures and statuses (phase 11b) fit into the avatars already in place.
