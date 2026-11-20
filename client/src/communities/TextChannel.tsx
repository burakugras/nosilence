// SPDX-License-Identifier: AGPL-3.0-only
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { ApiError } from '../api/http'
import { deleteMessage, listMessages, sendMessage, type Message } from '../api/messages'
import { FormMessage } from '../components/Field'
import { formatWait, useCountdown, withoutWait } from '../components/useCountdown'
import type { CommunityLive } from '../gateway/useCommunityLive'
import { merge, reconcile, type History } from './messageHistory'
import { MAX_MESSAGE, messageError } from '../validation'

/** Within this many pixels of the bottom counts as "reading the latest". */
const NEAR_BOTTOM_PX = 80

type Props = {
  channel: { id: string; name: string }
  currentUserId: string
  /** Owners may delete anyone's messages. */
  canDeleteAny: boolean
  live: Pick<CommunityLive, 'generation' | 'subscribe'>
}

export function TextChannel({ channel, currentUserId, canDeleteAny, live }: Props) {
  const [history, setHistory] = useState<History>()
  const [text, setText] = useState('')
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
  const scrollToEnd = useRef(true)
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
  const [waitReason, setWaitReason] = useState<string>()
  const firstId = messages?.[0]?.id
  const lastId = messages?.[messages.length - 1]?.id

  const item = (el: HTMLElement, id: string) =>
    el.querySelector<HTMLElement>(`[data-message-id="${id}"]`)

  /** True if any part of the message is inside the visible part of the list. */
  function inSight(el: HTMLElement, id: string) {
    const li = item(el, id)
    if (!li) return false
    const top = li.offsetTop - el.offsetTop
    return top < el.scrollTop + el.clientHeight && top + li.offsetHeight > el.scrollTop
  }

  /** Messages that have now been on screen are no longer unseen. */
  function markSeen() {
    const el = list.current
    if (!el) return
    setUnseenIds((ids) => {
      const left = ids.filter((id) => !inSight(el, id))
      return left.length === ids.length ? ids : left
    })
    if (el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX) {
      setUnseenIds([])
      setFirstUnseenId(undefined)
    }
  }

  /** Scrolls so the first message the reader has not seen is at the top. */
  function jumpToFirstUnseen() {
    const el = list.current
    const first = el && firstUnseenId ? item(el, firstUnseenId) : null
    if (el && first) el.scrollTop = first.offsetTop - el.offsetTop
    markSeen()
  }

  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    const arrived = incoming.current
    incoming.current = []
    if (scrollToEnd.current) {
      scrollToEnd.current = false
      el.scrollTop = el.scrollHeight
      return
    }
    // Only messages that landed out of sight count as unseen.
    const outOfSight = arrived.filter((id) => item(el, id) && !inSight(el, id))
    if (outOfSight.length > 0) {
      setUnseenIds((ids) => [...ids, ...outOfSight])
      setFirstUnseenId((id) => id ?? outOfSight[0])
    }
  }, [lastId])

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
    listMessages(channel.id)
      .then((page) => active && setHistory((current) => reconcile(current, page)))
      .catch(() => active && setMessage('Could not load messages.'))
    return () => {
      active = false
    }
  }, [channel.id, generation])

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'message_created' && event.message.channel_id === channel.id) {
          update((ms) => merge(ms, [event.message]))
          if (event.message.author?.id !== currentUserId) incoming.current.push(event.message.id)
        }
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

  async function loadOlder() {
    if (!messages?.length) return
    try {
      const page = await listMessages(channel.id, messages[0].id)
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
      const sent = await sendMessage(channel.id, text.trim())
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

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter starts a new line.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send()
    }
  }

  async function remove(m: Message) {
    if (!window.confirm('Delete this message?')) return
    try {
      await deleteMessage(m.id)
      update((ms) => ms.filter((c) => c.id !== m.id))
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not delete the message.')
    }
  }

  return (
    <section className="text-channel" aria-label={`#${channel.name}`}>
      <h3>#{channel.name}</h3>
      {history?.hasMore && (
        <button type="button" className="link-button" onClick={() => void loadOlder()}>
          Load older messages
        </button>
      )}
      {messages === undefined ? (
        <p role="status">Loading messages…</p>
      ) : messages.length === 0 ? (
        <p className="muted">No messages yet. Say hello!</p>
      ) : (
        <div className="messages-wrap">
          <ol className="messages" aria-label="Messages" ref={list} onScroll={markSeen}>
            {messages.map((m) => (
              <li
                key={m.id}
                data-message-id={m.id}
                className={
                  [m.id === firstUnseenId && 'first-unseen', unseenIds.includes(m.id) && 'unseen']
                    .filter(Boolean)
                    .join(' ') || undefined
                }
              >
                <div className="message-head">
                  <strong>{m.author?.display_name ?? 'Deleted user'}</strong>{' '}
                  <time className="muted" dateTime={m.inserted_at}>
                    {new Date(m.inserted_at).toLocaleString()}
                  </time>
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
                {/* Rendered as text, never as HTML. */}
                <p className="message-text">{m.text}</p>
              </li>
            ))}
          </ol>
          {unseenIds.length > 0 && (
            <button type="button" className="new-messages" onClick={jumpToFirstUnseen}>
              {unseenIds.length === 1 ? '1 new message' : `${unseenIds.length} new messages`} ↓
            </button>
          )}
        </div>
      )}
      <form className="composer" onSubmit={(e) => void send(e)} aria-label="Send a message">
        <textarea
          aria-label={`Message #${channel.name}`}
          value={text}
          maxLength={MAX_MESSAGE}
          rows={2}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" disabled={sending || wait.secondsLeft > 0}>
          Send
        </button>
      </form>
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
