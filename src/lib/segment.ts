/**
 * Finds the subject of a photo (a dog on grass, a mug on a table) so its
 * background can be removed when it isn't one plain color. Uses U²-Netp, a
 * small open salient-object model (Apache-2.0, github.com/xuebinqin/U-2-Net),
 * run in the browser with ONNX Runtime. Nothing is uploaded. The runtime and
 * model (about 3 MB compressed plus 4.5 MB) load only the first time a photo's
 * background is removed.
 */
import modelUrl from '../assets/models/u2netp.onnx?url'
import wasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url'
import mjsUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url'

import { MASK_SIZE as SIZE } from './mask'
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

type Session = import('onnxruntime-web').InferenceSession
let session: Promise<{ ort: typeof import('onnxruntime-web'); session: Session }> | null = null

function load() {
  session ??= (async () => {
    const ort = await import('onnxruntime-web/wasm')
    ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl }
    // Threads need cross-origin isolation, which AdSense rules out.
    ort.env.wasm.numThreads = 1
    const s = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] })
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
  // The small model's answer on dark, low-contrast subjects (a black dog on
  // grass) swings with tiny input changes, so it runs on the photo and its
  // mirror image and the two answers are averaged.
  const mask = new Float32Array(SIZE * SIZE)
  for (const flip of [false, true]) {
    const one = await runOnce(ort, s, img, flip)
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) mask[y * SIZE + x] += one[y * SIZE + (flip ? SIZE - 1 - x : x)] / 2
  }
  return mask
}

async function runOnce(
  ort: typeof import('onnxruntime-web'),
  s: Session,
  img: CanvasImageSource & { width: number; height: number },
  flip: boolean,
): Promise<Float32Array> {
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  if (flip) {
    ctx.translate(SIZE, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(img, 0, 0, SIZE, SIZE)
  const px = ctx.getImageData(0, 0, SIZE, SIZE).data
  let max = 0
  for (let i = 0; i < px.length; i += 4) max = Math.max(max, px[i], px[i + 1], px[i + 2])
  const n = SIZE * SIZE
  const input = new Float32Array(n * 3)
  for (let p = 0; p < n; p++)
    for (let ch = 0; ch < 3; ch++) input[ch * n + p] = (px[p * 4 + ch] / (max || 255) - MEAN[ch]) / STD[ch]
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
