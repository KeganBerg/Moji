import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { buildMotion, type Animation, type MotionSpec } from './animations'
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
 * a smaller canvas. Exported for tests.
 */
export function gifLadder(size: number): GifAttempt[] {
  const sizes = [size, Math.round(size * 0.875), Math.round(size * 0.75)]
  const out: GifAttempt[] = []
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

/** Halving a short loop can leave too few frames to show the motion; the ladder skips that step. */
export function keepsMotion(anim: Animation, frameStep: number): boolean {
  return frameStep === 1 || Math.ceil(anim.frames / frameStep) >= Math.max(6, anim.minFrames ?? 0)
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
  const steps = gifSteps(frames, size, delay, colors)
  let r = steps.next()
  while (!r.done) r = steps.next()
  return r.value
}

/** encodeGif that yields every few frames, so taps get through and a newer change can cancel it. */
async function encodeGifAsync(
  frames: Uint8ClampedArray[],
  size: number,
  delay: number,
  colors: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const steps = gifSteps(frames, size, delay, colors)
  let r = steps.next()
  while (!r.done) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    signal?.throwIfAborted()
    r = steps.next()
  }
  return r.value
}

const QUANTIZE_PIXELS = 1 << 20

function* gifSteps(
  frames: Uint8ClampedArray[],
  size: number,
  delay: number,
  colors: number,
): Generator<void, Uint8Array, void> {
  // One palette for the whole loop keeps colors from flickering between frames.
  // Big exports (GIPHY, Instagram) build it from every Nth pixel of every
  // frame, up to about a million pixels, so it doesn't block for long or use
  // lots of memory, and every frame's colors (Party's hues) still count.
  const pixels = size * size
  const stride = Math.max(1, Math.ceil((frames.length * pixels) / QUANTIZE_PIXELS))
  const perFrame = Math.ceil(pixels / stride)
  const all = new Uint32Array(frames.length * perFrame)
  frames.forEach((f, i) => {
    const px = new Uint32Array(f.buffer, f.byteOffset, pixels)
    for (let j = 0, k = i * perFrame; j < pixels; j += stride, k++) all[k] = px[j]
  })
  yield
  const palette = quantize(new Uint8Array(all.buffer), colors, { format: 'rgba4444', oneBitAlpha: true })
  const transparentIndex = palette.findIndex((c) => c[3] === 0)
  const gif = GIFEncoder()
  for (let i = 0; i < frames.length; i++) {
    if (i % 2 === 0) yield
    const index = applyPalette(frames[i], palette, 'rgba4444')
    gif.writeFrame(index, size, size, {
      palette: i === 0 ? palette : undefined,
      delay,
      repeat: 0,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
      // Clear to background between frames, or transparent GIFs smear.
      dispose: 2,
    })
  }
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
  for (const attempt of gifLadder(size)) {
    // A newer change replaced this export; stop instead of finishing the ladder.
    signal?.throwIfAborted()
    if (!keepsMotion(anim, attempt.frameStep)) continue
    const { count, delay } = frameTiming(anim, platform.maxFrames, attempt.frameStep)
    const key = `${attempt.size}:${count}`
    let frames = cache.get(key)
    if (!frames) {
      frames = await renderFrames(source, attempt.size, opts, anim, count, signal)
      cache.set(key, frames)
    }
    // Off the page's thread (no signal) nothing waits on input, so encode in one go.
    const bytes = signal
      ? await encodeGifAsync(frames, attempt.size, delay, attempt.colors, signal)
      : encodeGif(frames, attempt.size, delay, attempt.colors)
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
    if (signal) await new Promise((r) => setTimeout(r, 0))
  }
  return best!
}

/** What the page posts to the export worker. */
export interface GifJob {
  source: ImageBitmap
  size: number
  opts: RenderOptions
  motion: MotionSpec
  platform: Platform
}

export type GifJobReply = { ok: true; result: ExportResult } | { ok: false; error: string }

let offThread: boolean | null = null

/** Whether this browser can draw on a canvas inside a worker (Safari 16.4+, every current Chrome and Firefox). */
function canExportOffThread(): boolean {
  if (offThread === null) {
    try {
      offThread =
        typeof Worker !== 'undefined' &&
        typeof OffscreenCanvas !== 'undefined' &&
        typeof createImageBitmap !== 'undefined' &&
        !!new OffscreenCanvas(1, 1).getContext('2d')
    } catch {
      offThread = false
    }
  }
  return offThread
}

/**
 * exportGif in a Web Worker, so rendering, palette building and encoding
 * never freeze the page, however big the export. Aborting stops the worker
 * outright. Falls back to the page's thread where workers can't draw.
 */
export async function exportGifOffThread(
  source: HTMLCanvasElement,
  size: number,
  opts: RenderOptions,
  motion: MotionSpec,
  platform: Platform,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const onPage = () => exportGif(source, size, opts, buildMotion(motion), platform, signal)
  if (!canExportOffThread()) return onPage()
  const bitmap = await createImageBitmap(source)
  signal?.throwIfAborted()
  let worker: Worker
  try {
    worker = new Worker(new URL('./exportWorker.ts', import.meta.url), { type: 'module' })
  } catch {
    bitmap.close()
    offThread = false
    return onPage()
  }
  const reply = await new Promise<GifJobReply | 'failed'>((resolve, reject) => {
    const stop = () => {
      worker.terminate()
      reject(signal!.reason)
    }
    signal?.addEventListener('abort', stop, { once: true })
    worker.onmessage = (e: MessageEvent<GifJobReply>) => resolve(e.data)
    // The worker script itself failed to load or run: do it here instead.
    worker.onerror = (e) => {
      e.preventDefault()
      resolve('failed')
    }
    const job: GifJob = { source: bitmap, size, opts, motion, platform }
    worker.postMessage(job, [bitmap])
  }).finally(() => worker.terminate())
  if (reply === 'failed') {
    offThread = false
    return onPage()
  }
  if (!reply.ok) throw new Error(reply.error)
  return reply.result
}
