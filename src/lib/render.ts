import type { Animation, FrameTransform } from './animations'
import { checkFit, type FitReport } from '../../supabase/functions/_shared/fit'
import { DEFAULT_STRENGTH, removeBackground, suggestCutout, type CutoutOptions } from './cutout'

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
  const width = Math.max(1, Math.round(w))
  const height = Math.max(1, Math.round(h))
  // Inside the export worker there is no document. An OffscreenCanvas does
  // everything drawing here needs (2D context, drawImage, getImageData).
  if (typeof document === 'undefined') return new OffscreenCanvas(width, height) as unknown as Canvas2D
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
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

export interface CutoutReport {
  /** Background-colored spots inside the subject (the inside of an O). */
  holes: number
  holesCleared: boolean
}

const reports = new WeakMap<Canvas2D, CutoutReport>()

/** What the background removal found in a prepared source, if it ran. */
export function cutoutReport(source: Canvas2D | null): CutoutReport | null {
  return (source && reports.get(source)) ?? null
}

/** Pixel art upscales in whole steps with hard edges. Only small sources with few colors count. */
export function isPixelArt(d: Uint8ClampedArray, width: number, height: number): boolean {
  if (Math.max(width, height) > 128) return false
  const colors = new Set<number>()
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue
    // Anti-aliased edges leave in-between alpha; pixel art has none.
    if (d[i + 3] !== 255) return false
    colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])
    if (colors.size > 48) return false
  }
  return colors.size > 1
}

/**
 * Loads an image into a working canvas: downscaled in halving steps (which
 * keeps small emoji sharp) and optionally trimmed to its visible pixels so the
 * emoji fills the frame. Pixel art is blown up in whole steps with hard edges
 * instead, so it stays crisp at any export size.
 */
export function prepareSource(
  img: CanvasImageSource & { width: number; height: number },
  trim: boolean,
  /** Background removal strength (or strength and how to treat enclosed spots), or null to keep the full image. */
  cutout: number | { strength: number; holes?: CutoutOptions['holes'] } | null = null,
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
  const pixelArt = isPixelArt(octx.getImageData(0, 0, out.width, out.height).data, out.width, out.height)
  let report: CutoutReport | null = null
  if (cutout !== null) {
    const { strength, holes } = typeof cutout === 'number' ? { strength: cutout, holes: undefined } : cutout
    const data = octx.getImageData(0, 0, out.width, out.height)
    report = { holes: 0, holesCleared: false }
    removeBackground(data.data, out.width, out.height, strength, { holes, crisp: pixelArt, report })
    octx.putImageData(data, 0, 0)
  }
  snapAlpha(octx, out.width, out.height)
  let result = out
  if (trim) {
    const bounds = opaqueBounds(octx.getImageData(0, 0, out.width, out.height).data, out.width, out.height)
    if (bounds && (bounds.w !== out.width || bounds.h !== out.height)) {
      result = makeCanvas(bounds.w, bounds.h)
      ctx2d(result).drawImage(out, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h)
    }
  }
  if (pixelArt) {
    const k = Math.floor(maxSize / Math.max(result.width, result.height))
    if (k >= 2) {
      const big = makeCanvas(result.width * k, result.height * k)
      const bctx = ctx2d(big)
      bctx.imageSmoothingEnabled = false
      bctx.drawImage(result, 0, 0, big.width, big.height)
      result = big
    }
  }
  if (report) reports.set(result, report)
  return result
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

const edgeCache = new WeakMap<Canvas2D, [number, number][]>()

/**
 * The corners of the convex hull around every visible pixel, centered on
 * the image. However the emoji moves, turns or stretches, its farthest point
 * is always one of these, so testing them is exact: a small detail beside the
 * subject (a sparkle, a dot) or a faint soft edge can't slip between samples.
 */
function visibleEdges(source: Canvas2D): [number, number][] {
  const cached = edgeCache.get(source)
  if (cached) return cached
  const { width: w, height: h } = source
  const data = ctx2d(source).getImageData(0, 0, w, h).data
  const points: [number, number][] = []
  for (let y = 0; y < h; y++) {
    let left = -1
    let right = -1
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] >= 8) {
        if (left < 0) left = x
        right = x
      }
    // Each pixel's outer corners, so the hull wraps whole pixels.
    if (left >= 0)
      points.push(
        [left - w / 2, y - h / 2],
        [left - w / 2, y + 1 - h / 2],
        [right + 1 - w / 2, y - h / 2],
        [right + 1 - w / 2, y + 1 - h / 2],
      )
  }
  // A blank image still needs an answer; treat it as its full box.
  const hull = points.length
    ? convexHull(points)
    : ([
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ] as [number, number][])
  edgeCache.set(source, hull)
  return hull
}

/** Andrew's monotone chain. Exported for tests. */
export function convexHull(points: [number, number][]): [number, number][] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: [number, number][] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** How far inside the frame's edge everything stays, as a share of the frame. */
const EDGE_MARGIN = 0.01

/**
 * The biggest the emoji can be drawn so no frame of the motion pushes any
 * visible pixel past the edge of the canvas. Measured on this image's real
 * shape, so a round emoji can spin bigger than a square one.
 */
export function safeInset(source: Canvas2D, opts: RenderOptions, anim: Animation): number {
  // Fill framing crops to the frame on purpose; keep the motion's own room.
  if (opts.fit === 'cover' || anim.frames <= 1) return anim.inset
  return insetFor(visibleEdges(source), source.width, source.height, opts, anim)
}

/** safeInset's math, on points centered on a w × h image. Exported for tests. */
export function insetFor(
  points: [number, number][],
  width: number,
  height: number,
  opts: RenderOptions,
  anim: Animation,
): number {
  const box = rotatedSize(width, height, opts.rotation)
  // Size of one source pixel as a share of the frame, at inset 1.
  const unit = (1 - opts.padding * 2) * Math.min(1 / box.w, 1 / box.h)
  const rot = (opts.rotation * Math.PI) / 180
  const c0 = Math.cos(rot)
  const s0 = Math.sin(rot)
  const limit = 0.5 - EDGE_MARGIN
  let inset = 1
  const samples = Math.max(120, anim.frames * 4)
  for (let i = 0; i < samples; i++) {
    const f = anim.at(i / samples)
    const c = Math.cos(f.rotate ?? 0)
    const s = Math.sin(f.rotate ?? 0)
    const sx = f.scaleX ?? 1
    const sy = f.scaleY ?? 1
    const tx = f.x ?? 0
    const ty = f.y ?? 0
    for (const [px, py] of points) {
      // Same order as drawFrame: flip, the image's own rotation, then the motion.
      const u = opts.flip ? -px : px
      const x0 = (u * c0 - py * s0) * sx
      const y0 = (u * s0 + py * c0) * sy
      const ax = (x0 * c - y0 * s) * unit
      const ay = (x0 * s + y0 * c) * unit
      if (ax > 0) inset = Math.min(inset, (limit - tx) / ax)
      else if (ax < 0) inset = Math.min(inset, (limit + tx) / -ax)
      if (ay > 0) inset = Math.min(inset, (limit - ty) / ay)
      else if (ay < 0) inset = Math.min(inset, (limit + ty) / -ay)
    }
  }
  return Math.max(0.3, inset)
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
  // In front, twinkling around the emoji's edge.
  if (transform.burst !== undefined) drawSparkles(ctx, size, transform.burst)
}

const SPARKLE_COLORS = ['#ffc531', '#ff9f1c', '#ffd966']
// Angle around the emoji, distance from its center, size, and when it twinkles, all as fractions.
export const SPARKLES = [
  { angle: -2.2, reach: 0.36, size: 0.11, delay: 0 },
  { angle: -0.5, reach: 0.37, size: 0.09, delay: 0.12 },
  { angle: 0.55, reach: 0.36, size: 0.1, delay: 0.06 },
  { angle: 2.5, reach: 0.38, size: 0.08, delay: 0.18 },
  { angle: 1.6, reach: 0.4, size: 0.06, delay: 0.24 },
  { angle: -1.3, reach: 0.4, size: 0.06, delay: 0.3 },
]

/**
 * One frame of a sparkle burst at progress p (0 to 1): a few four-point stars
 * that drift out from the emoji, twinkle and fade. Fixed positions rather than
 * random ones, so the preview and the exported GIF match.
 */
function drawSparkles(ctx: CanvasRenderingContext2D, size: number, p: number) {
  ctx.save()
  SPARKLES.forEach((s, i) => {
    const local = (p - s.delay) / (1 - 0.3)
    if (local <= 0 || local >= 1) return
    // Grows in, then shrinks away.
    const scale = Math.sin(local * Math.PI)
    const reach = s.reach * (0.85 + 0.15 * local)
    const r = s.size * size * scale
    if (r < 0.5) return
    ctx.setTransform(
      1,
      0,
      0,
      1,
      size / 2 + Math.cos(s.angle) * reach * size,
      size / 2 + Math.sin(s.angle) * reach * size,
    )
    ctx.rotate(local * 0.6)
    ctx.fillStyle = SPARKLE_COLORS[i % SPARKLE_COLORS.length]
    // Four points joined by curves pulled toward the center.
    const k = r * 0.18
    ctx.beginPath()
    ctx.moveTo(0, -r)
    ctx.quadraticCurveTo(k, -k, r, 0)
    ctx.quadraticCurveTo(k, k, 0, r)
    ctx.quadraticCurveTo(-k, k, -r, 0)
    ctx.quadraticCurveTo(-k, -k, 0, -r)
    ctx.fill()
  })
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

/** The server's fit check (cut off, background left in, blank), run on a small copy. */
export function fitOf(img: CanvasImageSource & { width: number; height: number }): FitReport {
  const scale = Math.min(1, 256 / Math.max(img.width, img.height))
  const c = makeCanvas(img.width * scale, img.height * scale)
  const ctx = ctx2d(c)
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return checkFit(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height)
}

/**
 * Whether the visible part of an emoji is mostly very dark or very light,
 * so the preview can sit it on a background it shows up against.
 */
export function subjectTone(source: Canvas2D): 'dark' | 'light' | null {
  const { width: w, height: h } = source
  const d = ctx2d(source).getImageData(0, 0, w, h).data
  const step = Math.max(1, Math.floor((w * h) / 20000)) * 4
  let sum = 0,
    n = 0
  for (let i = 0; i < d.length; i += step)
    if (d[i + 3] >= 128) {
      sum += d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722
      n++
    }
  if (!n) return null
  const mean = sum / n / 255
  return mean < 0.22 ? 'dark' : mean > 0.85 ? 'light' : null
}

export { makeCanvas, ctx2d }

/** Longest side an SVG is drawn at: enough for the biggest export (Instagram's 1024 px). */
const SVG_SIZE = 1024

/**
 * An SVG's shape from its width/height or viewBox. Its own size is often a
 * 24 px icon, or missing (browsers then guess 150 × 150, even for a wide
 * logo), so it's drawn at SVG_SIZE on the long side instead: vectors stay
 * sharp at any size. Exported for tests.
 */
export function svgAspect(text: string): number | null {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0]
  if (!tag) return null
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1]
  const num = (v?: string) => (v && !v.trim().endsWith('%') ? parseFloat(v) : NaN)
  const w = num(attr('width')),
    h = num(attr('height'))
  if (w > 0 && h > 0) return w / h
  const box = attr('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  if (box && box.length === 4 && box[2] > 0 && box[3] > 0) return box[2] / box[3]
  return null
}

export async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const img = await decodeImage(file)
  if (file.type === 'image/svg+xml') {
    const aspect =
      svgAspect(await file.text()) ?? (img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1)
    img.width = aspect >= 1 ? SVG_SIZE : Math.round(SVG_SIZE * aspect)
    img.height = aspect >= 1 ? Math.round(SVG_SIZE / aspect) : SVG_SIZE
  }
  return img
}

function decodeImage(file: Blob): Promise<HTMLImageElement> {
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
