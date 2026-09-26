import type { FrameTransform } from './animations'
import { removeBackground, suggestCutout } from './cutout'

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
}

export const DEFAULT_RENDER: RenderOptions = {
  fit: 'contain',
  padding: 0.04,
  background: null,
  rotation: 0,
  flip: false,
}

/** Size of the box a w × h image occupies once rotated by the given degrees. */
export function rotatedSize(w: number, h: number, degrees: number): { w: number; h: number } {
  const r = (degrees * Math.PI) / 180
  const cos = Math.abs(Math.cos(r))
  const sin = Math.abs(Math.sin(r))
  return { w: w * cos + h * sin, h: w * sin + h * cos }
}

/** Largest side kept after loading. Bigger sources only slow down per-frame drawing. */
const WORKING_SIZE = 512

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
): Canvas2D {
  let w = img.width
  let h = img.height
  let current: CanvasImageSource = img
  while (Math.max(w, h) / 2 >= WORKING_SIZE) {
    w = Math.round(w / 2)
    h = Math.round(h / 2)
    const step = makeCanvas(w, h)
    const sctx = ctx2d(step)
    sctx.imageSmoothingQuality = 'high'
    sctx.drawImage(current, 0, 0, w, h)
    current = step
  }
  const scale = Math.min(1, WORKING_SIZE / Math.max(w, h))
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
  if (opts.background) {
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, size, size)
  }
  const avail = size * (1 - opts.padding * 2) * inset
  // Fit the rotated image, so turning it never crops a corner.
  const box = rotatedSize(source.width, source.height, opts.rotation)
  const fitScale =
    opts.fit === 'cover' ? Math.max(avail / box.w, avail / box.h) : Math.min(avail / box.w, avail / box.h)
  const dw = source.width * fitScale
  const dh = source.height * fitScale

  if (opts.fit === 'cover') {
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
  const image = transform.hue === undefined ? source : tinted(source, transform.hue)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, -dw / 2, -dh / 2, dw, dh)
  ctx.restore()
}

let tintCanvas: Canvas2D | null = null

/**
 * The source washed with a color, for Party. A tint (rather than a hue
 * rotation) also colors black, white and grey images, and it doesn't rely on
 * canvas filters, which some browsers ignore.
 */
function tinted(source: Canvas2D, hue: number): Canvas2D {
  tintCanvas ??= makeCanvas(1, 1)
  const c = tintCanvas
  if (c.width !== source.width || c.height !== source.height) {
    c.width = source.width
    c.height = source.height
  }
  const t = ctx2d(c)
  t.globalCompositeOperation = 'source-over'
  t.globalAlpha = 1
  t.clearRect(0, 0, c.width, c.height)
  t.drawImage(source, 0, 0)
  t.globalCompositeOperation = 'source-atop'
  t.globalAlpha = TINT_STRENGTH
  t.fillStyle = `hsl(${Math.round(((hue % 360) + 360) % 360)}, 100%, 55%)`
  t.fillRect(0, 0, c.width, c.height)
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
  return suggestCutout(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height)
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
