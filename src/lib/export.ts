import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import type { Animation } from './animations'
import type { Platform } from './platforms'
import { ctx2d, drawFrame, makeCanvas, type RenderOptions } from './render'

export interface ExportResult {
  blob: Blob
  bytes: number
  size: number
  frames: number
  colors: number | null
  withinLimit: boolean
  extension: 'png' | 'gif'
}

export interface GifAttempt {
  size: number
  frameStep: number
  colors: number
}

/**
 * The order we try GIF settings in until the file fits the platform limit:
 * fewer colors first (hardly visible at emoji size), then fewer frames, then
 * a smaller canvas. Motion that needs every frame (keepFrames) tries every
 * canvas size before it drops frames. Exported for tests.
 */
export function gifLadder(size: number, keepFrames = false): GifAttempt[] {
  const sizes = [size, Math.round(size * 0.875), Math.round(size * 0.75)]
  const out: GifAttempt[] = []
  if (keepFrames) {
    for (const frameStep of [1, 2]) {
      for (const s of sizes) {
        for (const colors of [256, 128, 64]) out.push({ size: s, frameStep, colors })
      }
    }
    return out
  }
  for (const s of sizes) {
    for (const frameStep of [1, 2]) {
      for (const colors of [256, 128, 64]) out.push({ size: s, frameStep, colors })
    }
  }
  return out
}

/** Frame count and per-frame delay (ms) for an animation under a platform's frame cap. */
export function frameTiming(anim: Animation, maxFrames: number, frameStep: number): { count: number; delay: number } {
  let count = Math.ceil(anim.frames / frameStep)
  count = Math.max(2, Math.min(count, maxFrames))
  // GIF delays are whole centiseconds, and browsers treat delays under 20 ms
  // as 100 ms. Prefer a delay that divides the duration exactly so the GIF
  // loops at the same speed as the preview.
  let best: { count: number; delay: number } | null = null
  for (let delay = 20; delay <= anim.duration / 2; delay += 10) {
    const n = anim.duration / delay
    if (!Number.isInteger(n) || n > maxFrames) continue
    if (!best || Math.abs(n - count) < Math.abs(best.count - count)) best = { count: n, delay }
  }
  return best ?? { count, delay: Math.max(20, Math.round(anim.duration / count / 10) * 10) }
}

async function renderFrames(
  source: HTMLCanvasElement,
  size: number,
  opts: RenderOptions,
  anim: Animation,
  count: number,
  signal?: AbortSignal,
): Promise<Uint8ClampedArray[]> {
  const canvas = makeCanvas(size, size)
  const ctx = ctx2d(canvas)
  const frames: Uint8ClampedArray[] = []
  for (let i = 0; i < count; i++) {
    // Yield now and then so input stays responsive and a newer change can cancel this one.
    if (signal && i > 0 && i % 6 === 0) {
      await new Promise((r) => setTimeout(r, 0))
      signal.throwIfAborted()
    }
    drawFrame(ctx, source, size, opts, anim.at(i / count), anim.inset)
    frames.push(ctx.getImageData(0, 0, size, size).data)
  }
  return frames
}

export function encodeGif(frames: Uint8ClampedArray[], size: number, delay: number, colors: number): Uint8Array {
  // One palette for the whole loop keeps colors from flickering between frames.
  const all = new Uint8ClampedArray(frames.length * frames[0].length)
  frames.forEach((f, i) => all.set(f, i * f.length))
  const palette = quantize(all, colors, { format: 'rgba4444', oneBitAlpha: true })
  const transparentIndex = palette.findIndex((c) => c[3] === 0)
  const gif = GIFEncoder()
  frames.forEach((f, i) => {
    const index = applyPalette(f, palette, 'rgba4444')
    gif.writeFrame(index, size, size, {
      palette: i === 0 ? palette : undefined,
      delay,
      repeat: 0,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
      // Clear to background between frames, or transparent GIFs smear.
      dispose: 2,
    })
  })
  gif.finish()
  return gif.bytes()
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), type),
  )
}

export async function exportPng(
  source: HTMLCanvasElement,
  size: number,
  opts: RenderOptions,
  platform: Platform,
  signal?: AbortSignal,
): Promise<ExportResult> {
  let best: ExportResult | null = null
  for (const s of [size, Math.round(size * 0.875), Math.round(size * 0.75), Math.round(size * 0.5)]) {
    signal?.throwIfAborted()
    const canvas = makeCanvas(s, s)
    drawFrame(ctx2d(canvas), source, s, opts, {}, 1)
    const blob = await canvasToBlob(canvas, 'image/png')
    const result: ExportResult = {
      blob,
      bytes: blob.size,
      size: s,
      frames: 1,
      colors: null,
      withinLimit: blob.size <= platform.maxBytes,
      extension: 'png',
    }
    if (result.withinLimit) return result
    if (!best || result.bytes < best.bytes) best = result
  }
  return best!
}

export async function exportGif(
  source: HTMLCanvasElement,
  size: number,
  opts: RenderOptions,
  anim: Animation,
  platform: Platform,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const cache = new Map<string, Uint8ClampedArray[]>()
  let best: ExportResult | null = null
  for (const attempt of gifLadder(size, anim.keepFrames)) {
    // A newer change replaced this export; stop instead of finishing the ladder.
    signal?.throwIfAborted()
    const { count, delay } = frameTiming(anim, platform.maxFrames, attempt.frameStep)
    const key = `${attempt.size}:${count}`
    let frames = cache.get(key)
    if (!frames) {
      frames = await renderFrames(source, attempt.size, opts, anim, count, signal)
      cache.set(key, frames)
    }
    const bytes = encodeGif(frames, attempt.size, delay, attempt.colors)
    const blob = new Blob([bytes as BlobPart], { type: 'image/gif' })
    const result: ExportResult = {
      blob,
      bytes: blob.size,
      size: attempt.size,
      frames: count,
      colors: attempt.colors,
      withinLimit: blob.size <= platform.maxBytes,
      extension: 'gif',
    }
    if (result.withinLimit) return result
    if (!best || result.bytes < best.bytes) best = result
    // Let the UI breathe between attempts.
    await new Promise((r) => setTimeout(r, 0))
  }
  return best!
}
