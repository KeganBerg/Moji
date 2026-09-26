import { describe, expect, it } from 'vitest'
import { ANIMATIONS, composeAnimations, getAnimation } from './animations'
import { encodeGif, frameTiming, gifLadder } from './export'
import { PLATFORMS, formatBytes, sanitizeName } from './platforms'
import { opaqueBounds } from './render'

describe('sanitizeName', () => {
  it('makes Slack-safe names', () => {
    expect(sanitizeName('Party Parrot!', 'slack')).toBe('party_parrot')
    expect(sanitizeName('thumbs-up', 'slack')).toBe('thumbs-up')
    expect(sanitizeName('taco sunrise ', 'slack')).toBe('taco_sunrise')
    expect(sanitizeName('_taco_', 'discord')).toBe('taco')
  })
  it('makes Discord-safe names (no hyphens, 32 max, 2 min)', () => {
    expect(sanitizeName('thumbs-up', 'discord')).toBe('thumbsup')
    expect(sanitizeName('a'.repeat(40), 'discord')).toHaveLength(32)
    expect(sanitizeName('x', 'discord').length).toBeGreaterThanOrEqual(2)
  })
})

describe('platform presets', () => {
  it('match the published limits', () => {
    expect(PLATFORMS.slack).toMatchObject({ size: 128, maxBytes: 131072, maxFrames: 50 })
    expect(PLATFORMS.discord).toMatchObject({ size: 128, maxBytes: 262144 })
  })
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(131072)).toBe('128 KB')
  })
})

describe('gif sizing', () => {
  it('tries full quality first and never grows the canvas', () => {
    const ladder = gifLadder(128)
    expect(ladder[0]).toEqual({ size: 128, frameStep: 1, colors: 256 })
    expect(Math.max(...ladder.map((a) => a.size))).toBe(128)
  })
  it('respects the frame cap and minimum delay', () => {
    for (const a of ANIMATIONS.filter((a) => a.frames > 1)) {
      const { count, delay } = frameTiming(a, PLATFORMS.slack.maxFrames, 1)
      expect(count).toBeLessThanOrEqual(50)
      expect(delay).toBeGreaterThanOrEqual(20)
    }
    expect(frameTiming(getAnimation('spin'), 10, 1).count).toBe(10)
  })
  it('encodes a valid looping GIF', () => {
    const size = 8
    const frames = [0, 1].map((i) => {
      const f = new Uint8ClampedArray(size * size * 4)
      for (let p = 0; p < size * size; p++) f.set([255 * i, 0, 255, p % 2 ? 255 : 0], p * 4)
      return f
    })
    const bytes = encodeGif(frames, size, 50, 64)
    expect(new TextDecoder().decode(bytes.slice(0, 6))).toBe('GIF89a')
    expect(bytes[bytes.length - 1]).toBe(0x3b)
  })
})

describe('opaqueBounds', () => {
  it('finds the visible area', () => {
    const w = 4,
      h = 4
    const data = new Uint8ClampedArray(w * h * 4)
    data[(1 * w + 2) * 4 + 3] = 255
    data[(2 * w + 1) * 4 + 3] = 255
    expect(opaqueBounds(data, w, h)).toEqual({ x: 1, y: 1, w: 2, h: 2 })
    expect(opaqueBounds(new Uint8ClampedArray(w * h * 4), w, h)).toBeNull()
  })
})

describe('composeAnimations', () => {
  it('returns static for nothing picked and the animation itself for one', () => {
    expect(composeAnimations([]).frames).toBe(1)
    expect(composeAnimations([getAnimation('spin')])).toBe(getAnimation('spin'))
  })
  it('combines party + bounce into one seamless loop', () => {
    const combo = composeAnimations([getAnimation('party'), getAnimation('bounce')])
    expect(combo.label).toBe('Party + Bounce')
    expect(combo.duration).toBe(1000)
    const start = combo.at(0)
    const mid = combo.at(0.5)
    expect(mid.hue).toBeCloseTo(180)
    expect(mid.y).not.toBeCloseTo(start.y!)
    expect(combo.inset).toBe(getAnimation('bounce').inset)
  })
  it('repeats faster motions a whole number of times', () => {
    const combo = composeAnimations([getAnimation('spin'), getAnimation('shake')])
    expect(combo.duration).toBe(1200)
    expect(combo.frames).toBe(24)
    expect(combo.at(0).x).toBeCloseTo(0)
  })
})
