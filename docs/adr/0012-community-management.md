# ADR 0012: Roles, channel management, message editing and handing over ownership

- Status: accepted
- Date: 2026-11-23

## Context

Until phase 8 only the owner could run a community, channels could only be created,
messages could not be corrected, and deleting an account deleted every community the
user owned, for everyone. Phase 8 lets a community be run without its owner doing
everything, and be handed over.

## Decision

**Three fixed roles (option 1A).** `owner`, `moderator` and `member`, checked in one
place (`Communities.Policy`). Custom roles and per-channel permissions are not needed
at this size and would make every check harder to reason about.

| Action | member | moderator | owner |
| --- | --- | --- | --- |
| Read, write, join voice, leave | yes | yes | yes (cannot leave) |
| Create and revoke invites | | yes | yes |
| Remove someone, disconnect them from voice | | lower roles only | everyone else |
| Delete anyone's message | | yes | yes |
| Make or unmake moderators | | | yes |
| Create, rename, delete and order channels | | | yes |
| Hand over or delete the community | | | yes |

Acting on another person also requires outranking them, so a moderator cannot remove
or disconnect another moderator or the owner. Role changes reach every open page at
once (`member_updated`).

**Channels.** Channels have a `position`; the owner moves them up and down and the
server only accepts an order that lists every channel exactly once. Deleting a voice
channel closes its LiveKit room. Every change is sent to the community
(`channels_changed`).

**Message editing keeps only an "(edited)" mark (option 3A).** Only the author can edit,
at most three times per message (Burak's choice); the limit is checked in the same
SQL statement that saves the edit. The old text is not kept anywhere, which matches
the retention rules of ADR 0009 (we keep as little as possible). The edit is not written to the debug log.

**Handing over ownership: only people the owner chose.** Burak's design:

- The owner picks one to three members, in order, and confirms by typing the
  community's name. The first is asked (by email and on the community page) and has
  72 hours to accept or decline; then the next is asked. Members who left meanwhile
  are skipped. Accepting makes the candidate the owner and the old owner a moderator.
- **Voluntary hand-over:** if nobody accepts, the owner simply stays. The owner can
  withdraw the offer at any time. Someone who has just taken over cannot hand the
  community over again for 7 days (Burak's choice), so it cannot be passed around
  quickly; their page shows when they can.
- **When deleting an account:** the 7-day wait does not apply (refusing would leave
  only deleting the community). The owner chooses, per owned community, either to
  delete it or to offer it the same way. The account is deleted at once; the community
  has no owner meanwhile, moderators keep their powers, and members see a notice. If
  nobody accepts, members see the deletion date for 7 days, then it is deleted.
- **Nobody else can claim ownership.** Burak rejected letting a moderator take over an
  ownerless community: it would invite abuse (a moderator pushing others out to take
  the community). Ownership only ever goes to someone the owner named.

In the choice lists, someone already picked is not offered again in the other
choices. When a transfer is accepted, both the old and the new owner's pages update at
once.

A transfer is a row in `ownership_transfers` (candidates, who is asked now, deadline,
kind, status); a unique index allows one open transfer per community. A worker checks
deadlines every minute (`Succession.tick/1`); the timings are configuration.

## Consequences

- If every chosen candidate declines after an account deletion, the community is lost
  even if a moderator would have kept it going. This is the price of the rule above,
  and the 7-day notice gives members time to save what they need.
- The owner's choice is fixed when the account is deleted: nobody can add candidates
  later.
- Fixed roles may later grow into more granular permissions; `Policy` is the single
  place to change.
