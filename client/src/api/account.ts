// SPDX-License-Identifier: AGPL-3.0-only
import { apiOrigin, clearSessionToken, isDesktop, sessionToken } from '../platform'
import { ApiError, request } from './http'

export type DeletionPreview = {
  owned_communities: { id: string; name: string; member_count: number }[]
  needs_password: boolean
}

export const deletionPreview = () => request<DeletionPreview>('/api/account/deletion')

export async function deleteAccount(body: {
  confirm_email: string
  password?: string
  delete_messages: boolean
}) {
  await request<void>('/api/account', { method: 'DELETE', body })
  if (isDesktop) await clearSessionToken()
}

/** Downloads everything the server holds about the user as a JSON file. */
export async function downloadMyData() {
  const token = await sessionToken()
  const response = await fetch(apiOrigin + '/api/account/export', {
    credentials: isDesktop ? 'omit' : 'same-origin',
    headers: {
      accept: 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  }).catch(() => {
    throw new ApiError('Cannot reach the server. Is it running?', 0)
  })
  if (!response.ok) throw new ApiError(`Server error ${response.status}.`, response.status)

  const name =
    /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ??
    'nosilence-data.json'
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
