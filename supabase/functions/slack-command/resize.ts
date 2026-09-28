// Turns a generated 1024 px PNG into a Slack-ready emoji: transparent edges
// trimmed, centered on a square with the website's default 4% padding, and
// scaled to 128 x 128 (well under Slack's 128 KB limit).

import { Image } from 'jsr:@matmen/imagescript@1.3.1'

export const EMOJI_SIZE = 128
const PADDING = 0.04

export async function toSlackEmoji(png: Uint8Array): Promise<Uint8Array> {
  const image = await Image.decode(png)
  const { width, height, bitmap } = image

  // Bounding box of pixels that aren't (nearly) transparent.
  let top = height,
    left = width,
    bottom = -1,
    right = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bitmap[(y * width + x) * 4 + 3] > 8) {
        if (y < top) top = y
        if (y > bottom) bottom = y
        if (x < left) left = x
        if (x > right) right = x
      }
    }
  }
  if (bottom >= 0) image.crop(left, top, right - left + 1, bottom - top + 1)

  const side = Math.round(Math.max(image.width, image.height) / (1 - 2 * PADDING))
  const square = new Image(side, side)
  square.composite(image, Math.floor((side - image.width) / 2), Math.floor((side - image.height) / 2))
  const emoji = new Image(EMOJI_SIZE, EMOJI_SIZE)
  emoji.bitmap.set(boxDownscale(square.bitmap, side, EMOJI_SIZE))
  return await emoji.encode(1)
}

/**
 * Shrinks a square RGBA bitmap by averaging every source pixel under each
 * output pixel, weighted by alpha so transparent edges don't darken the
 * outline. (imagescript's resize samples one pixel per output pixel, which
 * turns an 8x reduction into jagged, speckled edges.)
 */
export function boxDownscale(src: Uint8ClampedArray, side: number, size: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4)
  const scale = side / size
  for (let ty = 0; ty < size; ty++) {
    const y0 = Math.floor(ty * scale)
    const y1 = Math.max(y0 + 1, Math.min(side, Math.floor((ty + 1) * scale)))
    for (let tx = 0; tx < size; tx++) {
      const x0 = Math.floor(tx * scale)
      const x1 = Math.max(x0 + 1, Math.min(side, Math.floor((tx + 1) * scale)))
      let r = 0,
        g = 0,
        b = 0,
        a = 0
      for (let y = y0; y < y1; y++) {
        let i = (y * side + x0) * 4
        for (let x = x0; x < x1; x++, i += 4) {
          const alpha = src[i + 3]
          r += src[i] * alpha
          g += src[i + 1] * alpha
          b += src[i + 2] * alpha
          a += alpha
        }
      }
      const o = (ty * size + tx) * 4
      if (a > 0) {
        out[o] = r / a
        out[o + 1] = g / a
        out[o + 2] = b / a
        out[o + 3] = a / ((y1 - y0) * (x1 - x0))
      }
    }
  }
  return out
}
