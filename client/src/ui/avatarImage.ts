// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Making a profile picture (ADR 0017): the chosen photo is cropped to a square
 * and redrawn as a 256×256 WebP here, in the app. Redrawing keeps only the
 * pixels: location, camera and other data in the file are left behind.
 */

export const AVATAR_PX = 256

/** Where the photo sits in the square frame: zoom (1 = just covers) and shift in frame pixels. */
export type Crop = { zoom: number; x: number; y: number }

/**
 * The photo's size and place in a frame of `frame` pixels for `crop`, with the
 * shift limited so the photo always covers the whole frame.
 */
export function placement(width: number, height: number, frame: number, crop: Crop) {
  const scale = (frame / Math.min(width, height)) * crop.zoom
  const w = width * scale
  const h = height * scale
  const maxX = (w - frame) / 2
  const maxY = (h - frame) / 2
  const x = Math.max(-maxX, Math.min(maxX, crop.x))
  const y = Math.max(-maxY, Math.min(maxY, crop.y))
  return { w, h, left: (frame - w) / 2 + x, top: (frame - h) / 2 + y, x, y }
}

/** Draws the photo into a frame-sized canvas context as `crop` places it. */
export function drawCrop(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  frame: number,
  crop: Crop,
) {
  const p = placement(image.width, image.height, frame, crop)
  ctx.clearRect(0, 0, frame, frame)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, p.left, p.top, p.w, p.h)
}

/**
 * The picture to upload, as Base64 WebP. `previewFrame` is the size of the frame
 * the crop was chosen in. Fails if this browser cannot write WebP.
 */
export async function renderAvatar(
  image: CanvasImageSource & { width: number; height: number },
  crop: Crop,
  previewFrame: number,
): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_PX
  canvas.height = AVATAR_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot draw pictures.')
  const k = AVATAR_PX / previewFrame
  drawCrop(ctx, image, AVATAR_PX, { zoom: crop.zoom, x: crop.x * k, y: crop.y * k })

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.85),
  )
  if (!blob || blob.type !== 'image/webp')
    throw new Error('This browser cannot make WebP pictures. Try another browser.')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
