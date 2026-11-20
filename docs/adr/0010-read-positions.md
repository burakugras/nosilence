# ADR 0010: Read positions and unread messages

- Status: accepted
- Date: 2026-11-20

## Context

Burak asked that someone returning to a channel after a while finds the messages they
have not seen marked as new, the same way as messages that arrive while they are
scrolled up, and that the channel list shows how many are unread.

## Decision

**Kept on the server (option A).** One row per user and text channel
(`channel_read_states`): the last message they have read, moved forward only. No
history of reads is kept. It follows the user across the web and the desktop app. The
server thereby knows how far each user has read; it is deleted with the account and is
part of the data export. Writing a message marks the channel read up to it.

**Messages get a sequence number.** Ordering by time was not reliable: on some systems
the clock moves in coarse steps, so two messages sent one after the other could get the
same time and then be shown in random order (a test caught this). `messages.seq` comes
from a database sequence; pages, cursors, read positions and unread counts use it.

**Opening a channel** starts at the first message after the read position. From there
on, messages from others are new: marked with the "New" line, tinted until they have
been on screen (those visible at once keep the tint for 3 seconds; scroll events
caused by opening do not count), counted by the strip. The "New" line stays until
everything new has been seen, then 5 more seconds. If more than one page is unread, the strip shows "50+".
The position saved on the server is the newest message before the first one the
reader has not had on screen; messages visible now count as read even while their
tint still shows. It is saved a moment after it moves, and at once when the channel
is left or the page is hidden or closed (keepalive request). While the page is
hidden, nothing counts as seen. (A real-browser check found that tying the save to
the tint lost the position when someone read quickly and left.)

**Channel list.** Each text channel shows its unread count from the server on load
(counted up to 100, shown as "99+"), counted live for channels not on screen; the open
channel reports what it still has unseen. Other devices of the same user catch up on
their next load: read positions are not pushed live, because the community topic is
shared with all members and would reveal how far each one has read.
