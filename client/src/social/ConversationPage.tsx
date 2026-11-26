// SPDX-License-Identifier: AGPL-3.0-only
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  addMembers,
  asMessage,
  conversationApi,
  removeMember,
  renameGroup,
  type ConversationMessage,
  type ConversationSummary,
} from '../api/conversations'
import { ApiError } from '../api/http'
import { listFriends, type Person } from '../api/social'
import { TextChannel } from '../communities/TextChannel'
import { FormMessage } from '../components/Field'
import { Link } from '../components/Link'
import type { LiveEvent } from '../gateway/types'
import { useUserEvents } from '../gateway/userLive'
import { navigate } from '../router'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { conversationTitle, refreshSoon, useConversations } from './conversationsStore'

const MAX_GROUP = 10

/** One direct or group conversation (ADR 0015), in the same chat view as text channels. */
export function ConversationPage({
  id,
  currentUserId,
  menuButton,
}: {
  id: string
  currentUserId: string
  /** Narrow windows: opens the channel column. */
  menuButton?: ReactNode
}) {
  const conversations = useConversations()
  const conversation = conversations?.find((c) => c.id === id)
  const [generation, setGeneration] = useState(0)
  const handlers = useRef(new Set<(event: LiveEvent) => void>())

  // The user's topic, as the chat view's live events.
  useUserEvents((event, payload) => {
    if (event === 'joined') return setGeneration((g) => g + 1)
    const m = payload as ConversationMessage & { id: string }
    if (m?.conversation_id !== id) return
    const reaction = payload as {
      message_id: string
      emoji: string
      user_id: string
      added: boolean
    }
    const live: LiveEvent | undefined =
      event === 'dm_created'
        ? { type: 'message_created', message: asMessage(m) }
        : event === 'dm_updated'
          ? { type: 'message_updated', message: asMessage(m) }
          : event === 'dm_deleted'
            ? { type: 'message_deleted', id: m.id, channel_id: id }
            : event === 'dm_reaction_changed'
              ? { type: 'reaction_changed', ...reaction, channel_id: id }
              : undefined
    if (live) handlers.current.forEach((h) => h(live))
  })

  const subscribe = useCallback((handler: (event: LiveEvent) => void) => {
    handlers.current.add(handler)
    return () => {
      handlers.current.delete(handler)
    }
  }, [])
  const live = useMemo(() => ({ generation, subscribe }), [generation, subscribe])

  // Reading here lowers the unread badge.
  const api = useMemo(
    () => ({
      ...conversationApi,
      markRead: async (conversationId: string, messageId: string) => {
        await conversationApi.markRead(conversationId, messageId)
        refreshSoon()
      },
    }),
    [],
  )

  if (conversations === undefined)
    return (
      <p className="empty" role="status">
        Loading…
      </p>
    )
  if (!conversation) {
    return (
      <div className="empty">
        <h2>Conversation not found</h2>
        <Link to="/">Back home</Link>
      </div>
    )
  }

  const title = conversationTitle(conversation, currentUserId)
  const other = conversation.members.find((m) => m.id !== currentUserId)
  return (
    <TextChannel
      key={id}
      channel={{ id, name: title }}
      api={api}
      title={title}
      icon={
        conversation.kind === 'direct' && other ? (
          <Avatar id={other.id} name={other.display_name} size="small" avatar={other.avatar} />
        ) : (
          <Icon name="people" />
        )
      }
      subtitle={
        conversation.kind === 'direct'
          ? other?.username
            ? `@${other.username}`
            : undefined
          : conversation.members.map((m) => m.display_name).join(', ')
      }
      headerStart={menuButton}
      notice={
        <>
          <p className="not-e2ee">
            Messages here are not end-to-end encrypted yet: the Nosilence server can read them.
          </p>
          {conversation.kind === 'group' && (
            <GroupDetails conversation={conversation} currentUserId={currentUserId} />
          )}
        </>
      }
      currentUserId={currentUserId}
      canDeleteAny={false}
      people={conversation.members}
      live={live}
    />
  )
}

function GroupDetails({
  conversation,
  currentUserId,
}: {
  conversation: ConversationSummary
  currentUserId: string
}) {
  const [friends, setFriends] = useState<Person[]>([])
  const [pick, setPick] = useState('')
  const [name, setName] = useState(conversation.name ?? '')
  const [error, setError] = useState<string>()
  const isOwner = conversation.owner_id === currentUserId
  const inGroup = new Set(conversation.members.map((m) => m.id))
  const addable = friends.filter((f) => !inGroup.has(f.id))

  useEffect(() => {
    listFriends()
      .then((l) => setFriends(l.friends))
      .catch(() => setFriends([]))
  }, [])

  async function act(action: () => Promise<unknown>) {
    setError(undefined)
    try {
      await action()
      refreshSoon()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')
    }
  }

  function rename(event: FormEvent) {
    event.preventDefault()
    void act(() => renameGroup(conversation.id, name))
  }

  return (
    <details className="group-details">
      <summary>Group: {conversation.members.length} people</summary>
      <ul className="plain-list" aria-label="Group members">
        {conversation.members.map((m) => (
          <li key={m.id}>
            <span>
              {m.display_name}
              {m.id === conversation.owner_id && <span className="badge">creator</span>}
            </span>
            {isOwner && m.id !== currentUserId && (
              <button
                type="button"
                className="link-button"
                onClick={() => void act(() => removeMember(conversation.id, m.id))}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <form className="inline-form" onSubmit={rename} aria-label="Rename group">
        <input
          aria-label="Group name"
          maxLength={50}
          value={name}
          placeholder="Group name (optional)"
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit">Rename</button>
      </form>
      {conversation.members.length < MAX_GROUP && addable.length > 0 && (
        <p>
          <select aria-label="Friend to add" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Add a friend…</option>
            {addable.map((f) => (
              <option key={f.id} value={f.id}>
                {f.display_name}
              </option>
            ))}
          </select>{' '}
          <button
            type="button"
            disabled={!pick}
            onClick={() =>
              void act(() => addMembers(conversation.id, [pick])).then(() => setPick(''))
            }
          >
            Add
          </button>
        </p>
      )}
      <button
        type="button"
        className="link-button"
        onClick={() =>
          window.confirm('Leave this group?') &&
          void act(async () => {
            await removeMember(conversation.id, currentUserId)
            navigate('/messages')
          })
        }
      >
        Leave group
      </button>
      <FormMessage text={error} />
    </details>
  )
}
