/** Side of the square subject map the model (lib/segment) returns. */
export const MASK_SIZE = 320
const SIZE = MASK_SIZE

/**
 * Makes everything but the subject transparent in place. Strength (0 to 100)
 * sets how sure the model must be: higher trims more of the soft edge.
 */
export function applyMask(d: Uint8ClampedArray, width: number, height: number, mask: Float32Array, strength: number) {
  const lo = 0.02 + (strength / 100) * 0.33
  const hi = lo + 0.3
  mask = dropStrays(mask, lo)
  for (let y = 0; y < height; y++) {
    // Bilinear sample of the mask at this pixel's center.
    const my = Math.min(SIZE - 1, Math.max(0, ((y + 0.5) / height) * SIZE - 0.5))
    const y0 = Math.floor(my),
      y1 = Math.min(SIZE - 1, y0 + 1),
      fy = my - y0
    for (let x = 0; x < width; x++) {
      const mx = Math.min(SIZE - 1, Math.max(0, ((x + 0.5) / width) * SIZE - 0.5))
      const x0 = Math.floor(mx),
        x1 = Math.min(SIZE - 1, x0 + 1),
        fx = mx - x0
      const m =
        (mask[y0 * SIZE + x0] * (1 - fx) + mask[y0 * SIZE + x1] * fx) * (1 - fy) +
        (mask[y1 * SIZE + x0] * (1 - fx) + mask[y1 * SIZE + x1] * fx) * fy
      const t = Math.min(1, Math.max(0, (m - lo) / (hi - lo)))
      const i = (y * width + x) * 4 + 3
      d[i] = Math.round(d[i] * t * t * (3 - 2 * t))
    }
  }
}

/** Map cells this far (of 320) from the sure core keep their soft edge. */
const SOFT_REACH = 6

/**
 * Clears what the model half-saw in a busy background: sure regions under a
 * tenth the weight of the largest (two people both stay), and faint ghosts
 * that trail away from the subject instead of hugging its edge.
 */
function dropStrays(mask: Float32Array, lo: number): Float32Array {
  const sure = 0.5
  const n = mask.length
  const label = new Int32Array(n).fill(-1)
  const weights: number[] = []
  const stack: number[] = []
  const near = (p: number) => {
    const x = p % SIZE
    return [x > 0 ? p - 1 : -1, x < SIZE - 1 ? p + 1 : -1, p - SIZE, p + SIZE].filter((q) => q >= 0 && q < n)
  }
  for (let s = 0; s < n; s++) {
    if (label[s] !== -1 || mask[s] < sure) continue
    const id = weights.length
    let w = 0
    label[s] = id
    stack.push(s)
    while (stack.length) {
      const p = stack.pop()!
      w += mask[p]
      for (const q of near(p))
        if (label[q] === -1 && mask[q] >= sure) {
          label[q] = id
          stack.push(q)
        }
    }
    weights.push(w)
  }
  if (!weights.length) return mask
  const keep = Math.max(...weights) * 0.1
  // Breadth-first distance from the kept core, out to SOFT_REACH.
  const dist = new Uint8Array(n).fill(255)
  let ring: number[] = []
  for (let p = 0; p < n; p++)
    if (label[p] !== -1 && weights[label[p]] >= keep) {
      dist[p] = 0
      ring.push(p)
    }
  for (let r = 1; r <= SOFT_REACH && ring.length; r++) {
    const next: number[] = []
    for (const p of ring)
      for (const q of near(p))
        if (dist[q] === 255 && mask[q] > lo) {
          dist[q] = r
          next.push(q)
        }
    ring = next
  }
  const out = mask.slice()
  for (let p = 0; p < n; p++) if (dist[p] === 255) out[p] = 0
  return out
}
