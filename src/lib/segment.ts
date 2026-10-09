/**
 * Finds the subject of a photo (a dog on grass, a person in front of a busy
 * wall) so its background can be removed when it isn't one plain color.
 * Uses U²-Net (Apache-2.0, github.com/xuebinqin/U-2-Net) in rembg's 44 MB
 * "silueta" build (public/models/silueta), run in the browser with ONNX
 * Runtime. Nothing is uploaded. The runtime and model load only the first
 * time a photo's background is removed, then come from the browser cache.
 *
 * They come from free public CDNs first (the owner chose this, 2026-10-09):
 * every GB this site serves costs Netlify credits. Each file is checked
 * against its SHA-256 before use, so a CDN can't swap in something else, and
 * the site's own copy is the last resort.
 */
import wasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url'
import mjsUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url'

import { MASK_SIZE as SIZE } from './mask'
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

type Session = import('onnxruntime-web').InferenceSession
let session: Promise<{ ort: typeof import('onnxruntime-web'); session: Session }> | null = null

export const MODEL_PARTS = ['silueta.onnx.part0', 'silueta.onnx.part1', 'silueta.onnx.part2']
export const MODEL_SHA256 = '75da6c8d2f8096ec743d071951be73b4a8bc7b3e51d9a6625d63644f90ffeedb'
/**
 * The commit in this repo that added public/models/silueta. A commit, not a
 * branch, so the files behind the link can never change.
 */
const MODEL_COMMIT = 'e032bb2d5fa657227eac48349e7c984432dd273c'
/** Folders holding MODEL_PARTS, tried in order. */
const MODEL_SOURCES = [
  `https://cdn.jsdelivr.net/gh/KeganBerg/Moji@${MODEL_COMMIT}/public/models/silueta/`,
  `https://raw.githubusercontent.com/KeganBerg/Moji/${MODEL_COMMIT}/public/models/silueta/`,
  '/models/silueta/',
]
/** Must match onnxruntime-web in package.json (a test checks both). */
export const ORT_VERSION = '1.22.0'
export const WASM_SHA256 = '71aef04959c5c1b6de461b6538e2058e306610034a85aad2742d0c7fd4533fe4'
const WASM_SOURCES = [
  `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort-wasm-simd-threaded.wasm`,
  `https://unpkg.com/onnxruntime-web@${ORT_VERSION}/dist/ort-wasm-simd-threaded.wasm`,
  wasmUrl,
]

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function fetchBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** The runtime's bytes from the first source that matches WASM_SHA256. */
async function fetchWasm(): Promise<Uint8Array<ArrayBuffer>> {
  let last: unknown
  for (const url of WASM_SOURCES) {
    try {
      const bytes = await fetchBytes(url)
      if ((await sha256(bytes)) === WASM_SHA256) return bytes
      last = new Error(`runtime checksum mismatch from ${url}`)
    } catch (e) {
      last = e
    }
  }
  throw last
}

/** The model's bytes from the first source whose parts join up to MODEL_SHA256. */
async function fetchModel(): Promise<Uint8Array<ArrayBuffer>> {
  let last: unknown
  for (const base of MODEL_SOURCES) {
    try {
      const parts = await Promise.all(MODEL_PARTS.map((p) => fetchBytes(base + p)))
      const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
      let at = 0
      for (const p of parts) {
        all.set(p, at)
        at += p.length
      }
      if ((await sha256(all)) === MODEL_SHA256) return all
      last = new Error(`model checksum mismatch from ${base}`)
    } catch (e) {
      last = e
    }
  }
  throw last
}

function load() {
  session ??= (async () => {
    const [ort, wasm, model] = await Promise.all([import('onnxruntime-web/wasm'), fetchWasm(), fetchModel()])
    ort.env.wasm.wasmBinary = wasm
    ort.env.wasm.wasmPaths = { mjs: mjsUrl }
    // Threads need cross-origin isolation, which AdSense rules out.
    ort.env.wasm.numThreads = 1
    const s = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] })
    return { ort, session: s }
  })().catch((e) => {
    // Let a later try load it again (a dropped connection, say).
    session = null
    throw e
  })
  return session
}

/**
 * How much each pixel belongs to the subject, 0 to 1, as a SIZE × SIZE map
 * stretched over the whole image. Feed it to applyMask (lib/mask).
 */
export async function subjectMask(img: CanvasImageSource & { width: number; height: number }): Promise<Float32Array> {
  const { ort, session: s } = await load()
  const px = modelInput(img)
  // The answer on dark, low-contrast subjects (a black dog on grass) swings
  // with small input changes, so it runs on the photo and its mirror image
  // and the two answers are averaged.
  const mask = new Float32Array(SIZE * SIZE)
  for (const flip of [false, true]) {
    const one = await runOnce(ort, s, px, flip)
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) mask[y * SIZE + x] += one[y * SIZE + (flip ? SIZE - 1 - x : x)] / 2
  }
  return mask
}

/** Largest side read from the photo before the careful resize below. */
const READ_SIZE = 1280

/**
 * The photo as SIZE × SIZE RGB. The model's answer shifts with how the photo
 * is shrunk (a browser's quick resize left a ghost of a busy background), so
 * this uses Lanczos, the filter the model was trained with.
 */
export function modelInput(img: CanvasImageSource & { width: number; height: number }): Float32Array {
  const k = Math.min(1, READ_SIZE / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * k))
  const h = Math.max(1, Math.round(img.height * k))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  const src = ctx.getImageData(0, 0, w, h).data
  return lanczos(src, w, h, SIZE, SIZE)
}

/** Separable Lanczos-3 resample of RGBA bytes to an RGB float image (0 to 255). */
export function lanczos(src: Uint8ClampedArray, w: number, h: number, ow: number, oh: number): Float32Array {
  const taps = (inSize: number, outSize: number) => {
    const scale = inSize / outSize
    const support = 3 * Math.max(1, scale)
    const out: { start: number; weights: Float32Array }[] = []
    for (let o = 0; o < outSize; o++) {
      const center = (o + 0.5) * scale
      const start = Math.max(0, Math.floor(center - support))
      const end = Math.min(inSize - 1, Math.ceil(center + support))
      const weights = new Float32Array(end - start + 1)
      let sum = 0
      for (let i = start; i <= end; i++) {
        const x = (i + 0.5 - center) / Math.max(1, scale)
        const v =
          x === 0
            ? 1
            : Math.abs(x) >= 3
              ? 0
              : (3 * Math.sin(Math.PI * x) * Math.sin((Math.PI * x) / 3)) / (Math.PI * Math.PI * x * x)
        weights[i - start] = v
        sum += v
      }
      for (let i = 0; i < weights.length; i++) weights[i] /= sum
      out.push({ start, weights })
    }
    return out
  }
  const tx = taps(w, ow)
  const ty = taps(h, oh)
  const mid = new Float32Array(ow * h * 3)
  for (let y = 0; y < h; y++)
    for (let o = 0; o < ow; o++) {
      const { start, weights } = tx[o]
      let r = 0,
        g = 0,
        b = 0
      for (let i = 0; i < weights.length; i++) {
        const j = (y * w + start + i) * 4
        r += src[j] * weights[i]
        g += src[j + 1] * weights[i]
        b += src[j + 2] * weights[i]
      }
      const m = (y * ow + o) * 3
      mid[m] = r
      mid[m + 1] = g
      mid[m + 2] = b
    }
  const out = new Float32Array(ow * oh * 3)
  for (let o = 0; o < oh; o++) {
    const { start, weights } = ty[o]
    for (let x = 0; x < ow; x++) {
      let r = 0,
        g = 0,
        b = 0
      for (let i = 0; i < weights.length; i++) {
        const m = ((start + i) * ow + x) * 3
        r += mid[m] * weights[i]
        g += mid[m + 1] * weights[i]
        b += mid[m + 2] * weights[i]
      }
      const q = (o * ow + x) * 3
      out[q] = Math.min(255, Math.max(0, r))
      out[q + 1] = Math.min(255, Math.max(0, g))
      out[q + 2] = Math.min(255, Math.max(0, b))
    }
  }
  return out
}

async function runOnce(
  ort: typeof import('onnxruntime-web'),
  s: Session,
  px: Float32Array,
  flip: boolean,
): Promise<Float32Array> {
  let max = 0
  for (const v of px) max = Math.max(max, v)
  const n = SIZE * SIZE
  const input = new Float32Array(n * 3)
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const from = (y * SIZE + (flip ? SIZE - 1 - x : x)) * 3
      for (let ch = 0; ch < 3; ch++) input[ch * n + y * SIZE + x] = (px[from + ch] / (max || 255) - MEAN[ch]) / STD[ch]
    }
  const feeds = { [s.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) }
  const out = (await s.run(feeds))[s.outputNames[0]].data as Float32Array
  let lo = Infinity,
    hi = -Infinity
  for (const v of out) {
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  const mask = new Float32Array(n)
  for (let p = 0; p < n; p++) mask[p] = hi > lo ? (out[p] - lo) / (hi - lo) : 0
  return mask
}
