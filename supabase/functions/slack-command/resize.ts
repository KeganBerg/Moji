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
  square.resize(EMOJI_SIZE, EMOJI_SIZE)
  return await square.encode(1)
}
