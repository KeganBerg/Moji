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
