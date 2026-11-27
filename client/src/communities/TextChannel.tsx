// SPDX-License-Identifier: AGPL-3.0-only
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useId,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { ApiError } from '../api/http'
import {
  deleteMessage,
  editMessage,
  listMessages,
  listReactors,
  markRead,
  reactToMessage,
  sendMessage,
  type Message,
  type Reaction,
  type Reactors,
  type ReadPosition,
} from '../api/messages'
import { FormMessage } from '../components/Field'
import { formatWait, useCountdown, withoutWait } from '../components/useCountdown'
import type { CommunityLive } from '../gateway/useCommunityLive'
import { merge, reconcile, withReactions, type History } from './messageHistory'
import { MAX_MESSAGE, messageError } from '../validation'
import { Avatar } from '../ui/Avatar'
import { EmojiPicker } from '../ui/EmojiPicker'
import { Icon } from '../ui/Icon'
import { Popover } from '../ui/Popover'
import { mentionsIn, splitMentions, suggestions, typingMention, type Mentionable } from './mentions'
import { applyReaction, QUICK_REACTIONS, reactorsText } from './reactions'

/** Messages by the same person within this time are shown as one group. */
const GROUP_MS = 5 * 60 * 1000

/** "20:14" today, "Yesterday 20:14", or the date. */
function when(iso: string) {
  const date = new Date(iso)
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const days = Math.round(
    (new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000,
  )
  if (days === 0) return `Today ${time}`
  if (days === 1) return `Yesterday ${time}`
  return `${date.toLocaleDateString()} ${time}`
}

/** Unread messages already on screen when the channel opens stay tinted this long. */
const OPENING_TINT_MS = 3000
/** Once every new message has been seen, the "New" line stays this much longer. */
const NEW_LINE_LINGER_MS = 5000
/** Wait this long after reading before saving the position (fewer requests). */
const SAVE_READ_MS = 800

const item = (el: HTMLElement, id: string) =>
  el.querySelector<HTMLElement>(`[data-message-id="${id}"]`)

/** True if any part of the message is inside the visible part of the list. */
function inSight(el: HTMLElement, id: string) {
  const li = item(el, id)
  if (!li) return false
  const top = li.offsetTop - el.offsetTop
  return top < el.scrollTop + el.clientHeight && top + li.offsetHeight > el.scrollTop
}

/**
 * Where the messages come from. A community text channel by default; a
 * conversation (direct or group, ADR 0015) passes its own.
 */
export type MessageApi = {
  list: typeof listMessages
  send: typeof sendMessage
  edit: typeof editMessage
  remove: typeof deleteMessage
  markRead: typeof markRead
  react: typeof reactToMessage
  reactors: typeof listReactors
}

const CHANNEL_API: MessageApi = {
  list: listMessages,
  send: sendMessage,
  edit: editMessage,
  remove: deleteMessage,
  markRead,
  react: reactToMessage,
  reactors: listReactors,
}

type Props = {
  channel: { id: string; name: string }
  api?: MessageApi
  /** The heading and the composer's label; "#<channel name>" by default. */
  title?: string
  /** The composer's label when it differs from the title ("#general"). */
  composerName?: string
  /** Shown under the heading (for example "not end-to-end encrypted"). */
  notice?: ReactNode
  /** In front of the title in the header (an icon). */
  icon?: ReactNode
  /** Next to the title, smaller (the other person's @username). */
  subtitle?: string
  /** Buttons at the start and end of the header (menu, members). */
  headerStart?: ReactNode
  headerEnd?: ReactNode
  currentUserId: string
  /** Owners may delete anyone's messages. */
  canDeleteAny: boolean
  live: Pick<CommunityLive, 'generation' | 'subscribe'>
  /** How many messages here the user has not seen yet (for the channel list). */
  onUnreadChange?: (count: number) => void
  /** Who can be mentioned with @username here (ADR 0017). */
  people?: Mentionable[]
  /** Moderators and owners may mention @everyone and @here. */
  canMentionEveryone?: boolean
}

export function TextChannel({
  channel,
  api = CHANNEL_API,
  title = `#${channel.name}`,
  composerName = title,
  notice,
  icon,
  subtitle,
  headerStart,
  headerEnd,
  currentUserId,
  canDeleteAny,
  live,
  onUnreadChange,
  people = [],
  canMentionEveryone = false,
}: Props) {
  const [history, setHistory] = useState<History>()
  const [text, setText] = useState('')
  // The @word being typed and the highlighted suggestion (ADR 0017).
  const [typing, setTyping] = useState<{ start: number; query: string; index: number } | null>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  // Where the reaction picker is open: the message and the button it hangs on.
  const [picking, setPicking] = useState<{ id: string; anchor: HTMLElement } | null>(null)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string>()
  const { generation, subscribe } = live
  const messages = history?.messages

  const update = (change: (messages: Message[]) => Message[]) =>
    setHistory((h) => h && { ...h, messages: change(h.messages) })

  // Scrolling (Burak's choice): other people's messages never move the view.
  // New ones out of sight are announced by a strip that leads to the first of
  // them. The view moves only for the reader's own actions: opening the channel
  // and sending go to the end; loading older messages keeps the place.
  const list = useRef<HTMLOListElement>(null)
  const scrollToEnd = useRef(false)
  // Set by the first load: where the user had stopped reading (ADR 0010).
  const opening = useRef<{ read: ReadPosition } | null>(null)
  // More unread messages above the loaded page ("50+").
  const [moreUnreadAbove, setMoreUnreadAbove] = useState(false)
  // The read position last saved to the server.
  const savedSeq = useRef(-1)
  // Messages from others waiting to be checked: did they land in sight?
  const incoming = useRef<string[]>([])
  const heightBeforeOlder = useRef<number>(undefined)
  // Messages from others that arrived out of sight and have not been on screen
  // yet (tinted until they are), and the first of them (marked with a "New"
  // line; the strip takes the reader there).
  const [unseenIds, setUnseenIds] = useState<string[]>([])
  const [firstUnseenId, setFirstUnseenId] = useState<string>()
  // Sending too fast: a live countdown; sending stays off until it ends.
  const wait = useCountdown()
  // The user's own message being edited, if any.
  const [editingId, setEditingId] = useState<string>()
  const [waitReason, setWaitReason] = useState<string>()
  const firstId = messages?.[0]?.id
  const lastId = messages?.[messages.length - 1]?.id

  /**
   * Messages that have now been on screen are no longer unseen. Each one
   * counts only once it was actually visible; the "New" line stays where it is.
   */
  const markSeen = useCallback(() => {
    const el = list.current
    if (!el) return
    setUnseenIds((ids) => {
      const left = ids.filter((id) => !inSight(el, id))
      return left.length === ids.length ? ids : left
    })
  }, [])

  // Scrolling the list from code (when the channel opens) also fires scroll
  // events; until this time they are not the reader's and change nothing.
  const quietUntil = useRef(0)
  function onScroll() {
    if (performance.now() >= quietUntil.current) markSeen()
  }

  // When everything new has been seen, the "New" line goes after a while.
  const allSeen = unseenIds.length === 0
  useEffect(() => {
    if (!allSeen || !firstUnseenId) return
    const timer = window.setTimeout(() => setFirstUnseenId(undefined), NEW_LINE_LINGER_MS)
    return () => window.clearTimeout(timer)
  }, [allSeen, firstUnseenId])

  // "50+" only while something is still unseen.
  const moreAbove = moreUnreadAbove && unseenIds.length > 0

  /** Scrolls so the first message the reader has not seen is at the top. */
  function jumpToFirstUnseen() {
    const el = list.current
    const first = el && firstUnseenId ? item(el, firstUnseenId) : null
    if (el && first) el.scrollTop = first.offsetTop - el.offsetTop
    markSeen()
  }

  // Opening the channel: start at the first message after where the user
  // stopped reading; everything from there on counts as new.
  const hasMore = Boolean(history?.hasMore)
  useLayoutEffect(() => {
    const el = list.current
    if (!el || !opening.current || !messages) return
    {
      const readSeq = opening.current.read?.seq
      opening.current = null
      const unread = messages.filter(
        (m) => (readSeq === undefined || m.seq > readSeq) && m.author?.id !== currentUserId,
      )
      if (unread.length === 0) {
        el.scrollTop = el.scrollHeight
        return
      }
      const first = item(el, unread[0].id)
      el.scrollTop = first ? first.offsetTop - el.offsetTop : el.scrollHeight
      setUnseenIds(unread.map((m) => m.id))
      setFirstUnseenId(unread[0].id)
      setMoreUnreadAbove(hasMore && (readSeq === undefined || readSeq < messages[0].seq))
      // Those already on screen fade to normal after a moment, not at once.
      quietUntil.current = performance.now() + OPENING_TINT_MS
      window.setTimeout(markSeen, OPENING_TINT_MS)
    }
  }, [messages, hasMore, currentUserId, markSeen])

  const noneUnseen = unseenIds.length === 0
  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    const arrived = incoming.current
    incoming.current = []
    if (scrollToEnd.current) {
      // The reader sent a message: they are up to date.
      scrollToEnd.current = false
      el.scrollTop = el.scrollHeight
      setUnseenIds([])
      setFirstUnseenId(undefined)
      return
    }
    // Only messages that landed out of sight count as unseen (and all of them
    // while the page is in the background).
    const outOfSight = arrived.filter((id) => item(el, id) && (document.hidden || !inSight(el, id)))
    if (outOfSight.length > 0) {
      // A new batch after everything was seen moves the "New" line to it.
      if (noneUnseen) setFirstUnseenId(outOfSight[0])
      setUnseenIds((ids) => [...ids, ...outOfSight])
    }
  }, [lastId, noneUnseen])

  useLayoutEffect(() => {
    const el = list.current
    if (el && heightBeforeOlder.current !== undefined) {
      el.scrollTop += el.scrollHeight - heightBeforeOlder.current
      heightBeforeOlder.current = undefined
    }
  }, [firstId])

  // Latest page on open and after every reconnect.
  useEffect(() => {
    let active = true
    api
      .list(channel.id)
      .then((page) => {
        if (!active) return
        setHistory((current) => {
          // Only the first load sets the starting point; reconnects keep the view.
          if (!current) {
            opening.current = { read: page.read ?? null }
            savedSeq.current = page.read?.seq ?? -1
          }
          return reconcile(current, page)
        })
      })
      .catch(() => active && setMessage('Could not load messages.'))
    return () => {
      active = false
    }
  }, [api, channel.id, generation])

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'message_created' && event.message.channel_id === channel.id) {
          update((ms) => merge(ms, [event.message]))
          if (event.message.author?.id !== currentUserId) incoming.current.push(event.message.id)
        }
        if (event.type === 'message_updated' && event.message.channel_id === channel.id)
          update((ms) =>
            ms.map((m) => (m.id === event.message.id ? withReactions(event.message, m) : m)),
          )
        if (event.type === 'reaction_changed' && event.channel_id === channel.id)
          update((ms) =>
            ms.map((m) =>
              m.id === event.message_id
                ? {
                    ...m,
                    reactions: applyReaction(m.reactions ?? [], {
                      emoji: event.emoji,
                      added: event.added,
                      mine: event.user_id === currentUserId,
                    }),
                  }
                : m,
            ),
          )
        if (event.type === 'message_deleted' && event.channel_id === channel.id)
          update((ms) => ms.filter((m) => m.id !== event.id))
        // A deleted account: its messages go, or stay as from "Deleted user".
        if (event.type === 'account_deleted')
          update((ms) =>
            event.messages_deleted
              ? ms.filter((m) => m.author?.id !== event.user_id)
              : ms.map((m) => (m.author?.id === event.user_id ? { ...m, author: null } : m)),
          )
      }),
    [subscribe, channel.id, currentUserId],
  )

  // Save the read position: the newest message before the first one the reader
  // has not had on screen yet. Messages visible right now count as read even
  // while their tint still shows. Saved a moment after it was reached, and at
  // once when the channel is left or the page is hidden or closed.
  const pendingRead = useRef<Message>(undefined)
  const flushRead = useCallback(() => {
    const target = pendingRead.current
    pendingRead.current = undefined
    if (!target || target.seq <= savedSeq.current) return
    savedSeq.current = target.seq
    api.markRead(channel.id, target.id).catch(() => undefined)
  }, [api, channel.id])

  useEffect(() => {
    const el = list.current
    if (!messages?.length || opening.current) return
    const unseen = new Set(unseenIds)
    let target: Message | undefined
    for (const m of messages) {
      if (unseen.has(m.id) && !(el && !document.hidden && inSight(el, m.id))) break
      target = m
    }
    if (!target || target.seq <= savedSeq.current) return
    pendingRead.current = target
    const timer = window.setTimeout(flushRead, SAVE_READ_MS)
    return () => window.clearTimeout(timer)
  }, [messages, unseenIds, flushRead])

  useEffect(() => {
    const onHide = () => {
      if (document.hidden) flushRead()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flushRead)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flushRead)
      // Leaving the channel (or the page): save what was read.
      flushRead()
    }
  }, [flushRead])

  // The channel list shows how many are still unread here.
  const unreadCount = unseenIds.length
  useEffect(() => {
    onUnreadChange?.(unreadCount)
  }, [unreadCount, onUnreadChange])

  // Coming back to a hidden tab: what is on screen now has been seen.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) window.setTimeout(markSeen, OPENING_TINT_MS)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [markSeen])

  async function loadOlder() {
    if (!messages?.length) return
    try {
      const page = await api.list(channel.id, messages[0].id)
      heightBeforeOlder.current = list.current?.scrollHeight
      setHistory((h) => ({
        messages: merge(h?.messages ?? [], page.messages),
        hasMore: page.has_more,
      }))
    } catch {
      setMessage('Could not load older messages.')
    }
  }

  async function send(event?: FormEvent) {
    event?.preventDefault()
    if (wait.secondsLeft > 0) return
    const error = messageError(text)
    if (error) return setMessage(error)
    setSending(true)
    setMessage(undefined)
    try {
      const sent = await api.send(
        channel.id,
        text.trim(),
        mentionsIn(text, people, canMentionEveryone),
      )
      // Your own message always brings you to the end.
      scrollToEnd.current = true
      update((ms) => merge(ms, [sent]))
      setText('')
    } catch (e) {
      if (e instanceof ApiError && e.retryAfter) {
        // Keep the text; show a countdown instead of an error that goes stale.
        wait.start(e.retryAfter)
        setWaitReason(withoutWait(e.message))
        return
      }
      setMessage(
        e instanceof ApiError ? (e.field('text') ?? e.message) : 'Could not send the message.',
      )
    } finally {
      setSending(false)
    }
  }

  // Everyone but the writer.
  const suggested = typing
    ? suggestions(
        people.filter((p) => p.id !== currentUserId),
        typing.query,
        canMentionEveryone,
      )
    : []

  /** Follows the @word before the caret. */
  function onComposerChange(value: string, caret: number) {
    setText(value)
    const found = typingMention(value, caret)
    setTyping(found && { ...found, index: 0 })
  }

  /** Puts "@username " in place of the @word being typed. */
  function pickSuggestion(insert: string) {
    if (!typing) return
    const end = typing.start + 1 + typing.query.length
    const next = `${text.slice(0, typing.start)}@${insert} ${text.slice(end)}`
    setText(next)
    setTyping(null)
    const caret = typing.start + insert.length + 2
    requestAnimationFrame(() => composer.current?.setSelectionRange(caret, caret))
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (typing && suggested.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        setTyping({
          ...typing,
          index: (typing.index + step + suggested.length) % suggested.length,
        })
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        pickSuggestion(suggested[typing.index]?.insert ?? suggested[0].insert)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setTyping(null)
        return
      }
    }
    // Enter sends; Shift+Enter starts a new line.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send()
    }
  }

  /** Puts or takes back the user's reaction; shown at once, undone if the server refuses. */
  async function toggleReaction(m: Message, emoji: string) {
    const mine = m.reactions?.find((r) => r.emoji === emoji)?.me ?? false
    const change = (added: boolean) =>
      update((ms) =>
        ms.map((x) =>
          x.id === m.id
            ? { ...x, reactions: applyReaction(x.reactions ?? [], { emoji, added, mine: true }) }
            : x,
        ),
      )
    change(!mine)
    try {
      await api.react(m.id, emoji, !mine)
    } catch (e) {
      change(mine)
      setMessage(e instanceof ApiError ? e.message : 'Could not save the reaction.')
    }
  }

  // Usernames of the people each message mentions, for highlighting.
  const usernames = new Map(people.flatMap((p) => (p.username ? [[p.id, p.username]] : [])))

  async function remove(m: Message) {
    if (!window.confirm('Delete this message?')) return
    try {
      await api.remove(m.id)
      update((ms) => ms.filter((c) => c.id !== m.id))
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not delete the message.')
    }
  }

  return (
    <section className="text-channel" aria-label={title}>
      <header className="main-header">
        {headerStart}
        <h1>
          {icon}
          {title}
        </h1>
        <span className="topic">{subtitle}</span>
        {headerEnd}
      </header>
      {notice}
      {messages === undefined ? (
        <p role="status" className="empty">
          Loading messages…
        </p>
      ) : messages.length === 0 ? (
        <p className="empty">No messages yet. Say hello!</p>
      ) : (
        <div className="messages-wrap">
          <ol className="messages" aria-label="Messages" ref={list} onScroll={onScroll}>
            {history?.hasMore && (
              <li className="load-older">
                <button type="button" className="secondary" onClick={() => void loadOlder()}>
                  Load older messages
                </button>
              </li>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1]
              const grouped =
                !!prev &&
                prev.author?.id === m.author?.id &&
                m.id !== firstUnseenId &&
                new Date(m.inserted_at).getTime() - new Date(prev.inserted_at).getTime() < GROUP_MS
              const name = m.author?.display_name ?? 'Deleted user'
              const mentionsMe =
                m.author?.id !== currentUserId &&
                (!!m.mention || (m.mentions ?? []).includes(currentUserId))
              return (
                <li
                  key={m.id}
                  data-message-id={m.id}
                  className={
                    [
                      !grouped && 'grouped-start',
                      m.id === firstUnseenId && 'first-unseen',
                      unseenIds.includes(m.id) && 'unseen',
                      mentionsMe && 'mentions-me',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                >
                  <div className="gutter">
                    {grouped ? (
                      <time dateTime={m.inserted_at}>
                        {new Date(m.inserted_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    ) : (
                      <Avatar
                        id={m.author?.id ?? 'deleted'}
                        name={name}
                        size="large"
                        avatar={m.author?.avatar}
                      />
                    )}
                  </div>
                  <div className="body">
                    {!grouped && (
                      <div className="message-head">
                        <strong>{name}</strong>
                        <time dateTime={m.inserted_at}>{when(m.inserted_at)}</time>
                      </div>
                    )}
                    <div className="message-actions">
                      <button
                        type="button"
                        className="link-button"
                        aria-label="Add reaction"
                        aria-haspopup="dialog"
                        onClick={(e) => setPicking({ id: m.id, anchor: e.currentTarget })}
                      >
                        React
                      </button>
                      {m.author?.id === currentUserId &&
                        editingId !== m.id &&
                        (m.edits_left ?? 1) > 0 && (
                          <button
                            type="button"
                            className="link-button"
                            aria-label="Edit message"
                            onClick={() => setEditingId(m.id)}
                          >
                            Edit
                          </button>
                        )}
                      {(canDeleteAny || m.author?.id === currentUserId) && (
                        <button
                          type="button"
                          className="link-button"
                          aria-label="Delete message"
                          onClick={() => void remove(m)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    {editingId === m.id ? (
                      <EditBox
                        edit={(id, value) =>
                          api.edit(id, value, mentionsIn(value, people, canMentionEveryone))
                        }
                        message={m}
                        onDone={(edited) => {
                          if (edited)
                            update((ms) =>
                              ms.map((x) => (x.id === edited.id ? withReactions(edited, x) : x)),
                            )
                          setEditingId(undefined)
                        }}
                      />
                    ) : (
                      /* Rendered as text, never as HTML. */
                      <p className="message-text">
                        {splitMentions(
                          m.text,
                          (m.mentions ?? []).flatMap((id) => usernames.get(id) ?? []),
                          m.mention,
                        ).map((part, k) =>
                          part.mention ? (
                            <span key={k} className="mention">
                              {part.text}
                            </span>
                          ) : (
                            part.text
                          ),
                        )}
                        {m.edited_at && <span className="edited"> (edited)</span>}
                      </p>
                    )}
                    {(m.reactions?.length ?? 0) > 0 && (
                      <div className="reactions" aria-label="Reactions">
                        {m.reactions!.map((r) => (
                          <ReactionButton
                            key={r.emoji}
                            reaction={r}
                            load={() => api.reactors(m.id, r.emoji)}
                            onToggle={() => void toggleReaction(m, r.emoji)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
          {unseenIds.length > 0 && (
            <button type="button" className="new-messages" onClick={jumpToFirstUnseen}>
              {unseenIds.length === 1 && !moreAbove
                ? '1 new message'
                : `${unseenIds.length}${moreAbove ? '+' : ''} new messages`}{' '}
              ↓
            </button>
          )}
        </div>
      )}
      {picking && (
        <Popover
          anchor={picking.anchor}
          label="Add reaction"
          className="reaction-popover"
          onClose={() => setPicking(null)}
        >
          <ReactionChoices
            onPick={(emoji) => {
              const m = messages?.find((x) => x.id === picking.id)
              setPicking(null)
              // Picking one already there takes it back only from its own button.
              if (m && !m.reactions?.find((r) => r.emoji === emoji)?.me)
                void toggleReaction(m, emoji)
            }}
          />
        </Popover>
      )}
      <form className="composer" onSubmit={(e) => void send(e)} aria-label="Send a message">
        {typing && suggested.length > 0 && (
          <ul className="mention-suggestions" role="listbox" aria-label="Mention someone">
            {suggested.map((s, i) => (
              <li
                key={s.key}
                role="option"
                aria-selected={i === typing.index}
                // mousedown: keep the focus in the text box.
                onMouseDown={(e) => {
                  e.preventDefault()
                  pickSuggestion(s.insert)
                }}
              >
                <strong>{s.label}</strong>
                {s.detail && <span className="muted">{s.detail}</span>}
              </li>
            ))}
          </ul>
        )}
        <textarea
          ref={composer}
          aria-label={`Message ${composerName}`}
          placeholder={`Message ${composerName}`}
          value={text}
          maxLength={MAX_MESSAGE}
          rows={1}
          aria-autocomplete="list"
          aria-expanded={!!typing && suggested.length > 0}
          onChange={(e) => onComposerChange(e.target.value, e.target.selectionStart)}
          onKeyDown={onKeyDown}
          onBlur={() => setTyping(null)}
        />
        <button type="submit" disabled={sending || wait.secondsLeft > 0}>
          Send
        </button>
      </form>
      <p className="composer-hint">Enter to send, Shift+Enter for a new line</p>
      <FormMessage
        text={
          wait.secondsLeft > 0
            ? `${waitReason} You can send again in ${formatWait(wait.secondsLeft)}.`
            : message
        }
      />
    </section>
  )
}

/**
 * One reaction: clicking puts or takes back the user's; pointing at it or
 * focusing it shows who reacted (asked from the server the first time).
 */
function ReactionButton({
  reaction: r,
  load,
  onToggle,
}: {
  reaction: Reaction
  load: () => Promise<Reactors>
  onToggle: () => void
}) {
  const [who, setWho] = useState<{ count: number; text: string } | null>(null)
  const [open, setOpen] = useState(false)
  const tip = useId()

  const show = () => {
    setOpen(true)
    // Ask again when the count changed since.
    if (who?.count === r.count) return
    load()
      .then((reactors) => setWho({ count: r.count, text: reactorsText(reactors) }))
      .catch(() => undefined)
  }

  return (
    <span className="reaction-wrap">
      <button
        type="button"
        className={r.me ? 'reaction mine' : 'reaction'}
        aria-pressed={r.me}
        aria-label={`${r.emoji} ${r.count}${r.me ? ', including you' : ''}`}
        aria-describedby={open && who ? tip : undefined}
        onClick={onToggle}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
      >
        <span aria-hidden="true">{r.emoji}</span> {r.count}
      </button>
      {open && who && (
        <span id={tip} role="tooltip" className="reaction-tooltip">
          {who.text} reacted with {r.emoji}
        </span>
      )}
    </span>
  )
}

/** The quick reactions, and every emoji behind "More". */
function ReactionChoices({ onPick }: { onPick: (emoji: string) => void }) {
  const [all, setAll] = useState(false)
  return (
    <div className="reaction-choices">
      <div className="quick-reactions">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`React with ${emoji}`}
            onClick={() => onPick(emoji)}
          >
            {emoji}
          </button>
        ))}
        <button
          type="button"
          className="icon-button"
          aria-label="More emoji"
          aria-expanded={all}
          onClick={() => setAll((a) => !a)}
        >
          <Icon name="plus" />
        </button>
      </div>
      {all && <EmojiPicker onPick={onPick} />}
    </div>
  )
}

/** Edits the user's own message in place: Enter saves, Escape cancels. */
function EditBox({
  message,
  edit,
  onDone,
}: {
  message: Message
  edit: (id: string, text: string) => Promise<Message>
  onDone: (edited?: Message) => void
}) {
  const [text, setText] = useState(message.text)
  const [error, setError] = useState<string>()

  async function save() {
    const problem = messageError(text)
    if (problem) return setError(problem)
    if (text.trim() === message.text) return onDone()
    try {
      onDone(await edit(message.id, text.trim()))
    } catch (e) {
      setError(e instanceof ApiError ? (e.field('text') ?? e.message) : 'Could not save the edit.')
    }
  }

  return (
    <div className="edit-box">
      <textarea
        aria-label="Edit message"
        value={text}
        maxLength={MAX_MESSAGE}
        rows={2}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone()
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void save()
          }
        }}
      />
      <span className="muted">
        Enter to save, Escape to cancel.{' '}
        {message.edits_left === 1
          ? 'This is the last edit.'
          : `${message.edits_left ?? 3} edits left.`}
      </span>
      <FormMessage text={error} />
    </div>
  )
}
