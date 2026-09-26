import type { FrameTransform } from './animations'

export type Fit = 'contain' | 'cover'

export interface RenderOptions {
  fit: Fit
  /** Empty space around the emoji as a fraction of the canvas, 0 to 0.3. */
  padding: number
  /** CSS color, or null for a transparent background. */
  background: string | null
}

export const DEFAULT_RENDER: RenderOptions = { fit: 'contain', padding: 0.04, background: null }

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
export function prepareSource(img: CanvasImageSource & { width: number; height: number }, trim: boolean): Canvas2D {
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
  if (!trim) return out

  const bounds = opaqueBounds(octx.getImageData(0, 0, out.width, out.height).data, out.width, out.height)
  if (!bounds || (bounds.w === out.width && bounds.h === out.height)) return out
  const trimmed = makeCanvas(bounds.w, bounds.h)
  ctx2d(trimmed).drawImage(out, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h)
  return trimmed
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
  const fitScale =
    opts.fit === 'cover'
      ? Math.max(avail / source.width, avail / source.height)
      : Math.min(avail / source.width, avail / source.height)
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
  if (transform.hue) ctx.filter = `hue-rotate(${Math.round(transform.hue)}deg) saturate(1.4)`
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, -dw / 2, -dh / 2, dw, dh)
  ctx.restore()
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
