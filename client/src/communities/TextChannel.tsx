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

  // Scrolling: follow new messages while the reader is at the bottom; leave the
  // view alone while they read older ones; keep the place when older ones load.
  const list = useRef<HTMLOListElement>(null)
  const atBottom = useRef(true)
  const heightBeforeOlder = useRef<number>(undefined)
  // Messages from others that arrived while the reader was further up.
  const [unseen, setUnseen] = useState(0)
  const firstId = messages?.[0]?.id
  const lastId = messages?.[messages.length - 1]?.id

  function onScroll() {
    const el = list.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    if (atBottom.current) setUnseen(0)
  }

  function jumpToLatest() {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
    atBottom.current = true
    setUnseen(0)
  }

  useLayoutEffect(() => {
    const el = list.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
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
          if (!atBottom.current && event.message.author?.id !== currentUserId)
            setUnseen((n) => n + 1)
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
    const error = messageError(text)
    if (error) return setMessage(error)
    setSending(true)
    setMessage(undefined)
    try {
      const sent = await sendMessage(channel.id, text.trim())
      // Your own message always brings you to the bottom.
      atBottom.current = true
      update((ms) => merge(ms, [sent]))
      setText('')
    } catch (e) {
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
          <ol className="messages" aria-label="Messages" ref={list} onScroll={onScroll}>
            {messages.map((m) => (
              <li key={m.id}>
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
          {unseen > 0 && (
            <button type="button" className="new-messages" onClick={jumpToLatest}>
              {unseen === 1 ? '1 new message' : `${unseen} new messages`} ↓
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
        <button type="submit" disabled={sending}>
          Send
        </button>
      </form>
      <FormMessage text={message} />
    </section>
  )
}
