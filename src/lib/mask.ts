/** Side of the square subject map the model (lib/segment) returns. */
export const MASK_SIZE = 320
const SIZE = MASK_SIZE

/**
 * Makes everything but the subject transparent in place. Strength (0 to 100)
 * sets how sure the model must be: higher trims more of the soft edge.
 */
export function applyMask(d: Uint8ClampedArray, width: number, height: number, mask: Float32Array, strength: number) {
  // The full model is near 1 on its subject; the grey it leaves around it
  // (a halo, a busy patch it half-noticed) is background.
  const lo = 0.25 + (strength / 100) * 0.4
  const hi = lo + 0.25
  const cleaned = dropStrays(mask, lo)
  const n = width * height
  const soft = new Float32Array(n)
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
      soft[y * width + x] =
        (cleaned[y0 * SIZE + x0] * (1 - fx) + cleaned[y0 * SIZE + x1] * fx) * (1 - fy) +
        (cleaned[y1 * SIZE + x0] * (1 - fx) + cleaned[y1 * SIZE + x1] * fx) * fy
    }
  }
  colorVote(d, soft)
  // The map is 320 cells wide whatever the photo, so its edge is blocky and
  // drifts off the real outline. A guided filter snaps it to the photo's own edges.
  const luma = new Float32Array(n)
  for (let p = 0; p < n; p++) luma[p] = (d[p * 4] * 0.299 + d[p * 4 + 1] * 0.587 + d[p * 4 + 2] * 0.114) / 255
  const r = Math.max(2, Math.round(Math.max(width, height) / 160))
  const fitted = guidedFilter(luma, soft, width, height, r, 1e-3)
  for (let p = 0; p < n; p++) {
    // Far from the model's edge, trust the model over the filter.
    const m = soft[p] < 0.05 || soft[p] > 0.95 ? soft[p] : fitted[p]
    const t = Math.min(1, Math.max(0, (m - lo) / (hi - lo)))
    d[p * 4 + 3] = Math.round(d[p * 4 + 3] * t * t * (3 - 2 * t))
  }
  dropSpecks(d, width, height)
  defringe(d, width, height)
}

/**
 * Where the model is unsure, asks the colors: a bit of a busy background the
 * model half-took for the subject (swirl around a head) has the background's
 * colors, so it is pulled toward background; a soft hair edge has the
 * subject's colors and stays.
 */
function colorVote(d: Uint8ClampedArray, soft: Float32Array) {
  const BINS = 16
  const fg = new Float32Array(BINS ** 3)
  const bg = new Float32Array(BINS ** 3)
  const bin = (p: number) => ((d[p * 4] >> 4) * BINS + (d[p * 4 + 1] >> 4)) * BINS + (d[p * 4 + 2] >> 4)
  let nf = 0,
    nb = 0
  for (let p = 0; p < soft.length; p++) {
    if (soft[p] > 0.97) {
      fg[bin(p)]++
      nf++
    } else if (soft[p] < 0.1) {
      bg[bin(p)]++
      nb++
    }
  }
  // When much of the photo is unsure (a close-up with a blurred background
  // in the same colors), the subject's colors aren't known well enough.
  if (nf < 50 || nb < 50 || soft.length - nf - nb > soft.length * 0.15) return
  for (let p = 0; p < soft.length; p++) {
    const m = soft[p]
    if (m <= 0.1) continue
    const b = bin(p)
    const f = (fg[b] + 0.5) / nf
    const g = (bg[b] + 0.5) / nb
    const vote = f / (f + g)
    // Only clear-cut colors count: a close-up cat on a blurred cat-colored
    // background shares its colors, and there the model knows better.
    // Where the model is sure, only a color it almost never saw on the subject
    // overrules it (a red swirl it merged with white hair).
    if (m >= 0.9 ? vote < 0.03 : vote < 0.15 || vote > 0.85) soft[p] = m * 0.25 + vote * 0.75
  }
}

/** Edge-preserving smoothing of `src` that follows the edges of `guide` (He et al., 2010). */
function guidedFilter(guide: Float32Array, src: Float32Array, w: number, h: number, r: number, eps: number) {
  const n = w * h
  const ip = new Float32Array(n)
  const ii = new Float32Array(n)
  for (let p = 0; p < n; p++) {
    ip[p] = guide[p] * src[p]
    ii[p] = guide[p] * guide[p]
  }
  const mI = boxBlur(guide, w, h, r)
  const mP = boxBlur(src, w, h, r)
  const mIP = boxBlur(ip, w, h, r)
  const mII = boxBlur(ii, w, h, r)
  const a = new Float32Array(n)
  const b = new Float32Array(n)
  for (let p = 0; p < n; p++) {
    a[p] = (mIP[p] - mI[p] * mP[p]) / (mII[p] - mI[p] * mI[p] + eps)
    b[p] = mP[p] - a[p] * mI[p]
  }
  const mA = boxBlur(a, w, h, r)
  const mB = boxBlur(b, w, h, r)
  const out = new Float32Array(n)
  for (let p = 0; p < n; p++) out[p] = mA[p] * guide[p] + mB[p]
  return out
}

/** Mean over a (2r+1)² window, clamped at the borders. */
function boxBlur(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    let sum = 0
    for (let x = -r; x <= r; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / (2 * r + 1)
      sum += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / (2 * r + 1)
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return out
}

/** Clears specks left floating apart from the subject (bits of the old background). */
function dropSpecks(d: Uint8ClampedArray, w: number, h: number) {
  const n = w * h
  const label = new Int32Array(n).fill(-1)
  const sizes: number[] = []
  for (let s = 0; s < n; s++) {
    if (label[s] !== -1 || d[s * 4 + 3] < 32) continue
    const id = sizes.length
    let size = 0
    const stack = [s]
    label[s] = id
    while (stack.length) {
      const p = stack.pop()!
      size++
      const x = p % w,
        y = (p - x) / w
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
          const q = yy * w + xx
          if (label[q] === -1 && d[q * 4 + 3] >= 32) {
            label[q] = id
            stack.push(q)
          }
        }
    }
    sizes.push(size)
  }
  if (sizes.length < 2) return
  const min = Math.max(...sizes) * 0.005
  for (let p = 0; p < n; p++) if (label[p] !== -1 && sizes[label[p]] < min) d[p * 4 + 3] = 0
}

/**
 * Half-transparent edge pixels still carry the old background's color (a red
 * rim from a red wall). Pulls their color in from the solid pixels next to them.
 */
function defringe(d: Uint8ClampedArray, w: number, h: number) {
  for (let pass = 0; pass < 3; pass++) {
    const src = d.slice()
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        if (src[i + 3] === 0 || src[i + 3] >= 250) continue
        let r = 0,
          g = 0,
          b = 0,
          sum = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx,
              yy = y + dy
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
            const j = (yy * w + xx) * 4
            const k = (src[j + 3] / 255) ** 4
            r += src[j] * k
            g += src[j + 1] * k
            b += src[j + 2] * k
            sum += k
          }
        if (sum > 0) {
          d[i] = r / sum
          d[i + 1] = g / sum
          d[i + 2] = b / sum
        }
      }
  }
}

/** Map cells this far (of 320) from the sure core keep their soft edge. */
const SOFT_REACH = 6
/** Necks thinner than about twice this (in map cells) can't carry a blob into the subject. */
const NECK = 3

/**
 * Clears what the model half-saw in a busy background: sure regions under a
 * tenth the weight of the largest (two people both stay), blobs hanging off
 * the subject by a thin neck (a swirl over someone's head), and faint ghosts
 * that trail away from the subject instead of hugging its edge.
 */
function dropStrays(mask: Float32Array, lo: number): Float32Array {
  const n = mask.length
  const sure = new Uint8Array(n)
  for (let p = 0; p < n; p++) sure[p] = mask[p] >= 0.5 ? 1 : 0
  const near = (p: number) => {
    const x = p % SIZE
    return [x > 0 ? p - 1 : -1, x < SIZE - 1 ? p + 1 : -1, p - SIZE, p + SIZE].filter((q) => q >= 0 && q < n)
  }
  /** Steps from each cell in `from` (up to `max`), moving only through cells `through` allows. */
  const spread = (from: number[], max: number, through: (q: number) => boolean) => {
    const dist = new Uint8Array(n).fill(255)
    for (const p of from) dist[p] = 0
    let ring = from
    for (let r = 1; r <= max && ring.length; r++) {
      const next: number[] = []
      for (const p of ring)
        for (const q of near(p))
          if (dist[q] === 255 && through(q)) {
            dist[q] = r
            next.push(q)
          }
      ring = next
    }
    return dist
  }
  // Opening: shrink the sure area by NECK and grow it back, which cuts thin necks.
  const outside: number[] = []
  for (let p = 0; p < n; p++) if (!sure[p] || near(p).length < 4) outside.push(p)
  const depth = spread(outside, NECK, (q) => sure[q] === 1)
  const inner: number[] = []
  for (let p = 0; p < n; p++) if (depth[p] === 255) inner.push(p)
  const grown = spread(inner, NECK, (q) => sure[q] === 1)
  const label = new Int32Array(n).fill(-1)
  const weights: number[] = []
  for (let s = 0; s < n; s++) {
    if (label[s] !== -1 || grown[s] === 255) continue
    const id = weights.length
    let w = 0
    const stack = [s]
    label[s] = id
    while (stack.length) {
      const p = stack.pop()!
      w += mask[p]
      for (const q of near(p))
        if (label[q] === -1 && grown[q] !== 255) {
          label[q] = id
          stack.push(q)
        }
    }
    weights.push(w)
  }
  if (!weights.length) return mask
  const keep = Math.max(...weights) * 0.1
  const kept = (p: number) => label[p] !== -1 && weights[label[p]] >= keep
  const dropped = (p: number) => label[p] !== -1 && !kept(p)
  // The subject is the kept cores plus thin sure parts (arms, legs) reached
  // from them without passing through a dropped blob.
  const cores: number[] = []
  for (let p = 0; p < n; p++) if (kept(p)) cores.push(p)
  const subject = spread(cores, 254, (q) => sure[q] === 1 && !dropped(q))
  const body: number[] = []
  for (let p = 0; p < n; p++) if (subject[p] !== 255) body.push(p)
  const reach = spread(body, SOFT_REACH, (q) => mask[q] > lo && !dropped(q))
  const out = mask.slice()
  for (let p = 0; p < n; p++) if (reach[p] === 255) out[p] = 0
  return out
}
