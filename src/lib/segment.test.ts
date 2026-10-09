/// <reference types="node" />
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MODEL_PARTS, MODEL_SHA256, ORT_VERSION, WASM_SHA256, lanczos } from './segment'
import { applyMask, MASK_SIZE } from './mask'

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

describe('photo subject model files', () => {
  it('model parts join up to the checked hash', () => {
    const all = Buffer.concat(MODEL_PARTS.map((p) => readFileSync(`public/models/silueta/${p}`)))
    expect(sha(all)).toBe(MODEL_SHA256)
  })
  it('every part fits the CDN 20 MB file limit', () => {
    for (const p of MODEL_PARTS) expect(readFileSync(`public/models/silueta/${p}`).length).toBeLessThan(20_000_000)
  })
  it('runtime hash and version match the installed package', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.dependencies['onnxruntime-web']).toBe(ORT_VERSION)
    expect(JSON.parse(readFileSync('node_modules/onnxruntime-web/package.json', 'utf8')).version).toBe(ORT_VERSION)
    expect(sha(readFileSync('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm'))).toBe(WASM_SHA256)
  })
})

describe('lanczos', () => {
  it('keeps a flat color flat', () => {
    const src = new Uint8ClampedArray(40 * 30 * 4).map((_, i) => [200, 100, 50, 255][i % 4])
    const out = lanczos(src, 40, 30, 16, 16)
    for (let i = 0; i < out.length; i += 3)
      expect([out[i], out[i + 1], out[i + 2]].map(Math.round)).toEqual([200, 100, 50])
  })
})

describe('applyMask', () => {
  const W = 64
  // A subject square in the middle and a faint separate blob in a corner.
  const mask = new Float32Array(MASK_SIZE * MASK_SIZE)
  for (let y = 0; y < MASK_SIZE; y++)
    for (let x = 0; x < MASK_SIZE; x++) {
      if (x > 100 && x < 220 && y > 100 && y < 220) mask[y * MASK_SIZE + x] = 1
      if (x < 20 && y < 20) mask[y * MASK_SIZE + x] = 0.7
    }
  const pixels = () => {
    const d = new Uint8ClampedArray(W * W * 4)
    for (let p = 0; p < W * W; p++) d.set([120, 80, 40, 255], p * 4)
    return d
  }
  it('keeps the subject and clears the background and stray blobs', () => {
    const d = pixels()
    applyMask(d, W, W, mask, 30)
    expect(d[(32 * W + 32) * 4 + 3]).toBe(255)
    expect(d[(2 * W + 60) * 4 + 3]).toBe(0)
    expect(d[(1 * W + 1) * 4 + 3]).toBe(0)
  })
})
