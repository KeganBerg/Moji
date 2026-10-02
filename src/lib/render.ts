import type { FrameTransform } from './animations'
import { DEFAULT_STRENGTH, removeBackground, suggestCutout } from './cutout'

export type Fit = 'contain' | 'cover'

export interface RenderOptions {
  fit: Fit
  /** Empty space around the emoji as a fraction of the canvas, 0 to 0.3. */
  padding: number
  /** CSS color, or null for a transparent background. */
  background: string | null
  /** Clockwise rotation of the image in degrees, -180 to 180. */
  rotation: number
  /** Mirror the image left to right. */
  flip: boolean
  /** Corner rounding as a share of half the shorter side, 0 (square) to 1 (fully round). */
  corners: number
}

export const DEFAULT_RENDER: RenderOptions = {
  fit: 'contain',
  padding: 0.04,
  background: null,
  rotation: 0,
  flip: false,
  corners: 0,
}

/** Adds a rounded rectangle path. ctx.roundRect is missing in older Safari and Firefox. */
export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Size of the box a w × h image occupies once rotated by the given degrees. */
export function rotatedSize(w: number, h: number, degrees: number): { w: number; h: number } {
  const r = (degrees * Math.PI) / 180
  const cos = Math.abs(Math.cos(r))
  const sin = Math.abs(Math.sin(r))
  return { w: w * cos + h * sin, h: w * sin + h * cos }
}

/** Largest side kept after loading, unless the export is bigger. Bigger sources only slow down per-frame drawing. */
export const WORKING_SIZE = 512

type Canvas2D = HTMLCanvasElement

function makeCanvas(w: number, h: number): Canvas2D {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

function ctx2d(c: Canvas2D): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D is not available in this browser')
  return ctx
}

/**
 * Bounding box of pixels with visible alpha. Returns null when the image is
 * fully transparent. Exported for tests.
 */
export function opaqueBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 8,
): { x: number; y: number; w: number; h: number } | null {
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/**
 * Loads an image into a working canvas: downscaled in halving steps (which
 * keeps small emoji sharp) and optionally trimmed to its visible pixels so the
 * emoji fills the frame.
 */
export function prepareSource(
  img: CanvasImageSource & { width: number; height: number },
  trim: boolean,
  /** Background removal strength, or null to keep the full image. */
  cutout: number | null = null,
  /** Largest side to keep; raise it for exports bigger than WORKING_SIZE so they aren't upscaled. */
  maxSize = WORKING_SIZE,
): Canvas2D {
  let w = img.width
  let h = img.height
  let current: CanvasImageSource = img
  while (Math.max(w, h) / 2 >= maxSize) {
    w = Math.round(w / 2)
    h = Math.round(h / 2)
    const step = makeCanvas(w, h)
    const sctx = ctx2d(step)
    sctx.imageSmoothingQuality = 'high'
    sctx.drawImage(current, 0, 0, w, h)
    current = step
  }
  const scale = Math.min(1, maxSize / Math.max(w, h))
  const out = makeCanvas(w * scale, h * scale)
  const octx = ctx2d(out)
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(current, 0, 0, out.width, out.height)
  if (cutout !== null) {
    const data = octx.getImageData(0, 0, out.width, out.height)
    removeBackground(data.data, out.width, out.height, cutout)
    octx.putImageData(data, 0, 0)
  }
  snapAlpha(octx, out.width, out.height)
  if (!trim) return out

  const bounds = opaqueBounds(octx.getImageData(0, 0, out.width, out.height).data, out.width, out.height)
  if (!bounds || (bounds.w === out.width && bounds.h === out.height)) return out
  const trimmed = makeCanvas(bounds.w, bounds.h)
  ctx2d(trimmed).drawImage(out, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h)
  return trimmed
}

/**
 * AI models often return "opaque" pixels at alpha 250-254 and faint haze at
 * 1-6, which shows up as see-through subjects and grey fringes once scaled.
 * Snap both ends so edges stay clean.
 */
function snapAlpha(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  let changed = false
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i]
    if (a >= 250 && a < 255) {
      d[i] = 255
      changed = true
    } else if (a > 0 && a <= 6) {
      d[i] = 0
      changed = true
    }
  }
  if (changed) ctx.putImageData(img, 0, 0)
}

/** Draws one frame of the emoji into ctx at size × size. */
/**
 * Share of a rendered frame that is see-through (GIPHY rejects stickers whose
 * first frame is under 20% clear). Measured on a small render; pixels under
 * half alpha count as clear, as they do in the exported GIF.
 */
export function transparentShare(
  source: Canvas2D,
  opts: RenderOptions,
  transform: FrameTransform,
  inset: number,
  size = 96,
): number {
  const canvas = makeCanvas(size, size)
  const ctx = ctx2d(canvas)
  drawFrame(ctx, source, size, opts, transform, inset)
  const data = ctx.getImageData(0, 0, size, size).data
  let clear = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] < 128) clear++
  return clear / (size * size)
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  source: Canvas2D,
  size: number,
  opts: RenderOptions,
  transform: FrameTransform,
  inset: number,
): void {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, size, size)
  const avail = size * (1 - opts.padding * 2) * inset
  const corners = Math.max(0, Math.min(1, opts.corners ?? 0))
  // With a fill color or Fill framing the emoji reads as a tile, so the tile
  // gets the rounded corners. Otherwise the image itself is rounded below.
  const roundTile = corners > 0 && (opts.background !== null || opts.fit === 'cover')
  if (roundTile) {
    const o = (size - avail) / 2
    ctx.beginPath()
    roundedRect(ctx, o, o, avail, avail, (corners * avail) / 2)
    ctx.clip()
  }
  if (opts.background) {
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, size, size)
  }
  // Behind the emoji, so the pieces look like they fly out from it.
  if (transform.burst !== undefined) drawConfetti(ctx, size, transform.burst)
  // Fit: the whole rotated image stays inside the frame, so turning it never
  // crops a corner. Fill: the rotated image still covers the whole frame, so
  // turning it never leaves empty corners.
  const box = rotatedSize(source.width, source.height, opts.rotation)
  const rad = (opts.rotation * Math.PI) / 180
  const fitScale =
    opts.fit === 'cover'
      ? (avail * (Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad)))) / Math.min(source.width, source.height)
      : Math.min(avail / box.w, avail / box.h)
  const dw = source.width * fitScale
  const dh = source.height * fitScale

  if (opts.fit === 'cover' && !roundTile) {
    ctx.beginPath()
    const o = (size - avail) / 2
    ctx.rect(o, o, avail, avail)
    ctx.clip()
  }
  ctx.translate(size / 2 + (transform.x ?? 0) * size, size / 2 + (transform.y ?? 0) * size)
  if (transform.rotate) ctx.rotate(transform.rotate)
  ctx.scale(transform.scaleX ?? 1, transform.scaleY ?? 1)
  if (opts.rotation) ctx.rotate((opts.rotation * Math.PI) / 180)
  if (opts.flip) ctx.scale(-1, 1)
  if (corners > 0 && !roundTile) {
    // Clip in the image's own space so the corners turn and move with it.
    ctx.beginPath()
    roundedRect(ctx, -dw / 2, -dh / 2, dw, dh, (corners * Math.min(dw, dh)) / 2)
    ctx.clip()
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (transform.hue !== undefined) {
    // Tint a copy only as big as it lands on screen: a 36 px thumbnail
    // shouldn't wash a full-size upload every frame. Each axis is measured on
    // its own, since Flip and Squash scale them differently.
    const m = ctx.getTransform()
    const w = Math.min(source.width, Math.max(1, Math.ceil(dw * Math.hypot(m.a, m.b))))
    const h = Math.min(source.height, Math.max(1, Math.ceil(dh * Math.hypot(m.c, m.d))))
    const tint = tinted(source, w, h, transform.hue, transform.tint ?? TINT_STRENGTH)
    if (tint) ctx.drawImage(tint, 0, 0, w, h, -dw / 2, -dh / 2, dw, dh)
    else ctx.drawImage(source, -dw / 2, -dh / 2, dw, dh)
  } else {
    ctx.drawImage(source, -dw / 2, -dh / 2, dw, dh)
  }
  ctx.restore()
}

const CONFETTI_COLORS = ['#ff5a5f', '#ffb400', '#00a699', '#3d7eff', '#ff8a3d', '#2ecc71']
const CONFETTI_PIECES = 24

/**
 * One frame of a confetti burst at progress p (0 to 1). Every piece's path
 * comes from its index, not a random number, so the preview and the exported
 * GIF draw the same confetti.
 */
function drawConfetti(ctx: CanvasRenderingContext2D, size: number, p: number) {
  const out = 1 - (1 - p) ** 3
  const fade = p < 0.7 ? 1 : (1 - p) / 0.3
  ctx.save()
  for (let i = 0; i < CONFETTI_PIECES; i++) {
    const spread = (i * 0.618034) % 1
    const angle = i * 2.399963 + 0.3
    const reach = (0.3 + spread * 0.16) * out
    const x = size / 2 + Math.cos(angle) * reach * size
    // A little gravity pulls the pieces down as they slow.
    const y = size / 2 + (Math.sin(angle) * reach + 0.18 * p * p) * size
    const w = size * (0.05 + spread * 0.03)
    ctx.globalAlpha = fade
    ctx.fillStyle = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
    ctx.translate(x, y)
    ctx.rotate(angle + p * (4 + spread * 6))
    // Pieces tumble, so their height flickers between edge-on and full.
    const h = w * 0.6 * Math.abs(Math.cos(p * 9 + i)) + 1
    ctx.fillRect(-w / 2, -h / 2, w, h)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }
  ctx.restore()
}

const OUTLINE_MAX = 0.08

/**
 * Adds a die-cut sticker border: the image's shape grown outward by
 * `amount` (0 to 1, up to 8% of its longer side) and filled with `color`.
 * The canvas grows to make room, so the border never gets cut off.
 */
export function addOutline(source: Canvas2D, amount: number, color: string): Canvas2D {
  const r = Math.round(amount * OUTLINE_MAX * Math.max(source.width, source.height))
  if (r < 1) return source
  const out = makeCanvas(source.width + r * 2, source.height + r * 2)
  const ctx = ctx2d(out)
  // Stamp the shape in rings around itself. Several radii fill the middle of
  // the border, so thin parts (a whisker, a thin letter) don't leave holes.
  for (const radius of [r, r * 0.66, r * 0.33]) {
    // About one stamp every 3 px around the ring.
    const steps = Math.max(12, Math.ceil((Math.PI * 2 * radius) / 3))
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2
      ctx.drawImage(source, r + Math.cos(a) * radius, r + Math.sin(a) * radius)
    }
  }
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.globalCompositeOperation = 'source-over'
  ctx.drawImage(source, r, r)
  return out
}

let tintCanvas: Canvas2D | null = null

/**
 * The source washed with a color, for Party. A tint (rather than a hue
 * rotation) also colors black, white and grey images, and it doesn't rely on
 * canvas filters, which some browsers ignore.
 */
function tinted(source: Canvas2D, width: number, height: number, hue: number, strength: number): Canvas2D | null {
  // One canvas serves every size drawn in a frame (preview, thumbnails, chat),
  // so it only ever grows; resizing it would reallocate it several times a frame.
  tintCanvas ??= makeCanvas(1, 1)
  const c = tintCanvas
  if (c.width < width || c.height < height) {
    c.width = Math.max(c.width, width)
    c.height = Math.max(c.height, height)
  }
  // A plain context: willReadFrequently would force slow software drawing every frame.
  const t = c.getContext('2d')
  if (!t) return null
  t.globalCompositeOperation = 'source-over'
  t.globalAlpha = 1
  t.clearRect(0, 0, width, height)
  t.imageSmoothingEnabled = true
  t.imageSmoothingQuality = 'high'
  t.drawImage(source, 0, 0, width, height)
  t.globalCompositeOperation = 'source-atop'
  t.globalAlpha = strength
  t.fillStyle = `hsl(${Math.round(((hue % 360) + 360) % 360)}, 100%, 55%)`
  t.fillRect(0, 0, width, height)
  t.globalCompositeOperation = 'source-over'
  t.globalAlpha = 1
  return c
}

const TINT_STRENGTH = 0.5

/** Whether an image looks like a subject on a plain background, checked on a small copy. */
export function looksCuttable(img: CanvasImageSource & { width: number; height: number }): boolean {
  const scale = Math.min(1, 96 / Math.max(img.width, img.height))
  const c = makeCanvas(img.width * scale, img.height * scale)
  const ctx = ctx2d(c)
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  if (!suggestCutout(d, c.width, c.height)) return false
  // Try it: a one-color image or a full-bleed tile would be erased entirely.
  removeBackground(d, c.width, c.height, DEFAULT_STRENGTH)
  let kept = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 128) kept++
  const share = kept / (c.width * c.height)
  return share >= 0.03 && share <= 0.9
}

export { makeCanvas, ctx2d }

export function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file could not be read as an image'))
    }
    img.src = url
  })
}
