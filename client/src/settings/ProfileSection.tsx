// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { User } from '../api/accounts'
import { ApiError } from '../api/http'
import { removeAvatar, uploadAvatar } from '../api/profile'
import { FormMessage } from '../components/Field'
import { setMyProfile, useMyProfile } from '../presence/myProfile'
import { Avatar } from '../ui/Avatar'
import { drawCrop, placement, renderAvatar, type Crop } from '../ui/avatarImage'

const FRAME = 200
const MAX_FILE = 20 * 1024 * 1024

type Photo = { bitmap: ImageBitmap; crop: Crop }

/** Profile picture (ADR 0017): choose a photo, place it in the circle, save. */
export function ProfileSection({ user, onChange }: { user: User; onChange: (user: User) => void }) {
  const profile = useMyProfile()
  const [photo, setPhoto] = useState<Photo>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  function done(updated: User) {
    setMyProfile(updated)
    onChange(updated)
    setPhoto(undefined)
  }

  async function choose(f: File | undefined) {
    setError(undefined)
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('Choose a picture file.')
    if (f.size > MAX_FILE) return setError('This file is too large (at most 20 MB).')
    try {
      setPhoto({ bitmap: await createImageBitmap(f), crop: { zoom: 1, x: 0, y: 0 } })
    } catch {
      setError('This picture could not be opened.')
    }
  }

  async function save() {
    if (!photo) return
    setBusy(true)
    setError(undefined)
    try {
      done(await uploadAvatar(await renderAvatar(photo.bitmap, photo.crop, FRAME)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the picture.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(undefined)
    try {
      done(await removeAvatar())
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not remove the picture.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h2>Profile</h2>
      <p className="muted">
        Your picture is seen by your friends and by people in your communities and conversations. It
        is saved as a small 256×256 image; nothing else from the file (such as where a photo was
        taken) is kept.
      </p>
      {photo ? (
        <CropBox photo={photo} onCrop={(crop) => setPhoto({ ...photo, crop })} />
      ) : (
        <div className="profile-preview">
          <Avatar id={user.id} name={user.display_name} avatar={profile.avatar} size="large" />
          <strong>{user.display_name}</strong>
        </div>
      )}
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void choose(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <div className="row-buttons">
        {photo ? (
          <>
            <button type="button" disabled={busy} onClick={() => void save()}>
              Save picture
            </button>
            <button type="button" className="secondary" onClick={() => setPhoto(undefined)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => file.current?.click()}>
              {profile.avatar ? 'Change picture' : 'Choose a picture'}
            </button>
            {profile.avatar && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void remove()}
              >
                Remove picture
              </button>
            )}
          </>
        )}
      </div>
      <FormMessage text={error} />
    </>
  )
}

/** The photo in a round frame: drag or use the arrow keys to move it, the slider to zoom. */
function CropBox({ photo, onCrop }: { photo: Photo; onCrop: (crop: Crop) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null)
  const { bitmap, crop } = photo

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (ctx) drawCrop(ctx, bitmap, FRAME, crop)
  }, [bitmap, crop])

  // Keeps the photo covering the frame.
  const set = (next: Crop) => {
    const p = placement(bitmap.width, bitmap.height, FRAME, next)
    onCrop({ zoom: next.zoom, x: p.x, y: p.y })
  }

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, crop }
  }
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d) return
    set({ ...d.crop, x: d.crop.x + e.clientX - d.x, y: d.crop.y + e.clientY - d.y })
  }
  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const step = e.shiftKey ? 20 : 5
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    set({ ...crop, x: crop.x + move[0], y: crop.y + move[1] })
  }

  return (
    <div className="crop-box">
      <canvas
        ref={canvas}
        width={FRAME}
        height={FRAME}
        tabIndex={0}
        role="img"
        aria-label="Your new picture. Drag it, or use the arrow keys, to move it in the circle."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onKeyDown={onKeyDown}
      />
      <label>
        <span>Zoom</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={crop.zoom}
          onChange={(e) => set({ ...crop, zoom: Number(e.target.value) })}
        />
      </label>
    </div>
  )
}
