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
