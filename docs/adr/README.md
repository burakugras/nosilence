# Architecture decision records

One file per significant decision: `NNNN-short-title.md`, numbered in order.
A record is never rewritten after it is accepted; a later record supersedes it.

Template:

```markdown
# ADR NNNN: Title

- Status: proposed | accepted | superseded by NNNN
- Date: YYYY-MM-DD

## Context
What problem or constraint forces a decision.

## Decision
What we chose, and the main alternatives we rejected.

## Consequences
What becomes easier, what becomes harder, what we must do next.
```

| ADR | Title |
|---|---|
| [0001](0001-stack-and-principles.md) | Stack and guiding principles |
| [0002](0002-mls-in-the-browser.md) | MLS in the browser feeds LiveKit E2EE (phase 1.5 spike) |
| [0003](0003-accounts-and-sessions.md) | Accounts and sessions |
| [0004](0004-sign-in-with-google.md) | Sign in with Google |
| [0005](0005-communities-and-permissions.md) | Communities, invites and voice channel capacity |
| [0006](0006-presence-and-text-channels.md) | Real-time gateway, presence and text channels |
| [0007](0007-voice-e2ee.md) | Voice end-to-end encryption with MLS |
| [0008](0008-desktop-app.md) | Windows desktop app with Tauri |
| [0009](0009-limits-retention-and-account-rights.md) | Rate limits, retention and account rights |
| [0010](0010-read-positions.md) | Read positions and unread messages |
| [0011](0011-network-measurement-and-webhooks.md) | Network measurement, LiveKit webhooks and anonymous metrics |
| [0012](0012-community-management.md) | Roles, channel management, message editing and handing over ownership |
| [0013](0013-voice-quality-and-control.md) | Loss protection, faster reconnects, devices and push-to-talk |
| [0014](0014-desktop-maturity.md) | Google sign-up in the desktop app, signed updates, notifications |
| [0015](0015-friends-and-conversations.md) | Usernames, friends, blocking and direct and group conversations |
| [0016](0016-layout.md) | Layout, design tokens and themes |
| [0017](0017-profiles-mentions-reactions.md) | Profile pictures, status, mentions and reactions |
| [0018](0018-notification-levels-and-friends-status.md) | Notification levels, mentions on the rail, friends' status and desktop links |
| [0019](0019-polish-blocks-and-the-bell.md) | Blocks and mentions, the bell's list, the notification settings window |
