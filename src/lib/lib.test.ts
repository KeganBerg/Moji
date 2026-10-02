import { describe, expect, it } from 'vitest'
import { ANIMATIONS, SPEED, composeAnimations, getAnimation, withSpeed } from './animations'
import { encodeGif, frameTiming, gifLadder, keepsMotion } from './export'
import { PLATFORMS, formatBytes, sanitizeName } from './platforms'
import { opaqueBounds, rotatedSize } from './render'
import { DEFAULT_TUNE, tunePixels } from './tune'
import { DEFAULT_STRENGTH, removeBackground, suggestCutout } from './cutout'
import { isHalloweenSeason } from './season'
import { NOT_FOUND, pageFor } from '../pages/pages'
import { checkFit, fitPenalty } from '../../supabase/functions/_shared/fit'

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
  it('exports GIPHY stickers as animated GIFs and Instagram stickers as large stills', () => {
    expect(PLATFORMS.giphy).toMatchObject({ size: 480, stickerRules: true })
    expect(PLATFORMS.giphy.size % 4).toBe(0)
    expect(PLATFORMS.instagram).toMatchObject({ size: 1024, staticOnly: true })
  })
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512\u00a0B')
    expect(formatBytes(131072)).toBe('128\u00a0KB')
    expect(formatBytes(8 * 1024 * 1024)).toBe('8\u00a0MB')
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
  it('loops at the preview speed with no leftover time', () => {
    for (const a of ANIMATIONS.filter((a) => a.frames > 1)) {
      for (const step of [1, 2, 3]) {
        const { count, delay } = frameTiming(a, PLATFORMS.slack.maxFrames, step)
        expect(delay % 10).toBe(0)
        expect(count * delay).toBe(a.duration)
      }
    }
  })
  it('keeps sped-up and slowed-down loops exact', () => {
    const combos = [
      ...ANIMATIONS.filter((a) => a.frames > 1),
      composeAnimations([getAnimation('party'), getAnimation('bounce')]),
    ]
    for (const base of combos) {
      for (let speed = SPEED.min; speed <= SPEED.max; speed += SPEED.step) {
        const a = withSpeed(base, speed)
        // Within 20% of the asked-for speed.
        expect(Math.abs(base.duration / speed / a.duration - 1)).toBeLessThan(0.2)
        for (const step of [1, 2]) {
          const { count, delay } = frameTiming(a, PLATFORMS.slack.maxFrames, step)
          expect(delay).toBeGreaterThanOrEqual(20)
          expect(count).toBeLessThanOrEqual(50)
          expect(count * delay).toBe(a.duration)
        }
      }
    }
    expect(withSpeed(getAnimation('spin'), 1)).toBe(getAnimation('spin'))
    expect(withSpeed(getAnimation('none'), 2)).toBe(getAnimation('none'))
    expect(withSpeed(getAnimation('spin'), 2).duration).toBe(600)
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

describe('halving frames', () => {
  it('never leaves Shake on its still points', () => {
    const shake = getAnimation('shake')
    for (const other of ANIMATIONS.filter((a) => a.frames > 1 && a !== shake)) {
      const without = composeAnimations([other])
      for (let speed = SPEED.min; speed <= SPEED.max; speed += SPEED.step) {
        const anim = withSpeed(composeAnimations([other, shake]), speed)
        if (!keepsMotion(anim, 2)) continue
        const { count } = frameTiming(anim, 50, 2)
        // The shake's own offset is what's left after taking the other motion away.
        const shakeX = Array.from({ length: count }, (_, i) =>
          Math.abs((anim.at(i / count).x ?? 0) - (without.at(i / count).x ?? 0)),
        )
        expect(Math.max(...shakeX), `${anim.id} at ${speed}x`).toBeGreaterThan(0.02)
      }
    }
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

describe('party color', () => {
  it('only sets hue when a color motion is picked', () => {
    expect(composeAnimations([getAnimation('spin'), getAnimation('bounce')]).at(0.3).hue).toBeUndefined()
    expect(composeAnimations([getAnimation('party'), getAnimation('spin')]).at(0).hue).toBe(0)
  })
})

describe('rotatedSize', () => {
  it('swaps sides at 90° and grows at 45°', () => {
    const r90 = rotatedSize(200, 100, 90)
    expect(r90.w).toBeCloseTo(100)
    expect(r90.h).toBeCloseTo(200)
    expect(rotatedSize(100, 100, 45).w).toBeCloseTo(141.42, 1)
    expect(rotatedSize(100, 100, -180).w).toBeCloseTo(100)
  })
})

describe('tunePixels', () => {
  const px = (...rgba: number[]) => new Uint8ClampedArray(rgba)

  it('leaves pixels alone at neutral', () => {
    const d = px(10, 120, 250, 255)
    tunePixels(d, 1, 1, DEFAULT_TUNE)
    expect([...d]).toEqual([10, 120, 250, 255])
  })
  it('turns grey at -100 saturation and keeps alpha', () => {
    const d = px(200, 40, 40, 180)
    tunePixels(d, 1, 1, { ...DEFAULT_TUNE, saturation: -100 })
    expect(d[0]).toBe(d[1])
    expect(d[1]).toBe(d[2])
    expect(d[3]).toBe(180)
  })
  it('brightens and adds contrast', () => {
    const bright = px(100, 100, 100, 255)
    tunePixels(bright, 1, 1, { ...DEFAULT_TUNE, brightness: 50 })
    expect(bright[0]).toBeGreaterThan(100)
    const contrast = px(100, 160, 128, 255)
    tunePixels(contrast, 1, 1, { ...DEFAULT_TUNE, contrast: 50 })
    expect(contrast[0]).toBeLessThan(100)
    expect(contrast[1]).toBeGreaterThan(160)
    expect(contrast[2]).toBe(128)
  })
  it('sharpens edges without darkening against transparency', () => {
    // A 3×1 strip: transparent, white, white. Sharpening must not pull the
    // white pixel toward the transparent pixel's black RGB.
    const d = px(0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255)
    tunePixels(d, 3, 1, { ...DEFAULT_TUNE, sharpness: 100 })
    expect(d[4]).toBe(255)
    // Real edges get stronger.
    const e = px(50, 50, 50, 255, 50, 50, 50, 255, 200, 200, 200, 255)
    tunePixels(e, 3, 1, { ...DEFAULT_TUNE, sharpness: 100 })
    expect(e[4]).toBeLessThan(50)
  })
})

describe('background cutout', () => {
  // A 40×40 "moon": a light grey disc with a dark crater, on slightly noisy black.
  function moon() {
    const w = 40,
      h = 40
    const d = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const inDisc = (x - 20) ** 2 + (y - 20) ** 2 < 14 ** 2
        const crater = (x - 22) ** 2 + (y - 18) ** 2 < 3 ** 2
        const v = crater ? 8 : inDisc ? 190 : (x * 7 + y * 13) % 9
        d.set([v, v, v, 255], i)
      }
    }
    return { d, w, h, at: (x: number, y: number) => d[(y * w + x) * 4 + 3] }
  }

  it('suggests a cutout for a subject on a plain background only', () => {
    const m = moon()
    expect(suggestCutout(m.d, m.w, m.h)).toBe(true)
    const clear = new Uint8ClampedArray(16 * 16 * 4)
    expect(suggestCutout(clear, 16, 16)).toBe(false)
    const busy = new Uint8ClampedArray(16 * 16 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 97) % 256))
    expect(suggestCutout(busy, 16, 16)).toBe(false)
  })

  it('removes the background but keeps dark details inside the subject', () => {
    const m = moon()
    removeBackground(m.d, m.w, m.h, DEFAULT_STRENGTH)
    expect(m.at(0, 0)).toBe(0)
    expect(m.at(39, 20)).toBe(0)
    expect(m.at(20, 20)).toBe(255)
    // The crater is as dark as the sky but isn't connected to it.
    expect(m.at(22, 18)).toBe(255)
  })
})

describe('chaos', () => {
  function disc(size = 32) {
    const d = new Uint8ClampedArray(size * size * 4)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        if ((x - 15.5) ** 2 + (y - 15.5) ** 2 < 12 ** 2) d.set([60, 140, 220, 255], i)
      }
    return d
  }
  const opaque = (d: Uint8ClampedArray) => d.filter((_, i) => i % 4 === 3 && d[i] > 0).length

  it('does nothing at 0', () => {
    const d = disc()
    const before = [...d]
    tunePixels(d, 32, 32, { ...DEFAULT_TUNE, chaos: 0 })
    expect([...d]).toEqual(before)
  })
  it('bulges the shape without breaking it apart, and fries the colors', () => {
    const d = disc()
    const area = opaque(d)
    tunePixels(d, 32, 32, { ...DEFAULT_TUNE, chaos: 100 })
    // The fisheye swells the subject toward the frame edge but never past it.
    expect(opaque(d)).toBeGreaterThan(area)
    expect(opaque(d)).toBeLessThan(32 * 32 * 0.8)
    expect(d[3]).toBe(0)
    const center = (15 * 32 + 15) * 4
    // Colors blow out: the blue gets bluer and the red drains away.
    expect(d[center]).toBeLessThan(60)
    expect(d[center + 2]).toBeGreaterThan(220)
    expect(d[center + 3]).toBe(255)
  })
})

describe('isHalloweenSeason', () => {
  it('runs from September 15 through October 31', () => {
    expect(isHalloweenSeason(new Date(2026, 8, 14))).toBe(false)
    expect(isHalloweenSeason(new Date(2026, 8, 15))).toBe(true)
    expect(isHalloweenSeason(new Date(2026, 9, 31, 23, 59))).toBe(true)
    expect(isHalloweenSeason(new Date(2026, 10, 1))).toBe(false)
  })
})

describe('pageFor', () => {
  it('routes the editor, info pages and unknown paths', () => {
    expect(pageFor('/')).toBeNull()
    expect(pageFor('/faq/')).toBe('faq')
    expect(pageFor('/index.html')).toBeNull()
    expect(pageFor('/faq/index.html')).toBe('faq')
    expect(pageFor('//faq')).toBe('faq')
    expect(pageFor('/guides/nope')).toBe(NOT_FOUND)
    expect(pageFor('/does-not-exist')).toBe(NOT_FOUND)
  })
})

describe('motion intensity', () => {
  it('scales the Party wash and motion size', async () => {
    const { withIntensity } = await import('./animations')
    expect(withIntensity(getAnimation('party'), 0.5).at(0).tint).toBe(0.25)
    expect(withIntensity(getAnimation('party'), 2).at(0).tint).toBe(0.8)
    const wiggle = getAnimation('wiggle')
    expect(withIntensity(wiggle, 2).at(0.25).rotate).toBeCloseTo(wiggle.at(0.25).rotate! * 2)
    expect(withIntensity(wiggle, 2).inset).toBeLessThan(wiggle.inset)
    // Spin keeps its full turn so the loop stays seamless.
    expect(withIntensity(getAnimation('spin'), 0.5).at(0.5).rotate).toBeCloseTo(Math.PI)
  })
})

describe('withSpeed', () => {
  it('keeps enough frames that a fast motion still moves', () => {
    for (const a of ANIMATIONS.filter((a) => a.frames > 1)) {
      for (const speed of [1.5, 2, 2.5, 3]) {
        const fast = withSpeed(a, speed)
        expect(fast.frames).toBeGreaterThanOrEqual(Math.min(a.frames, 8))
        const poses = new Set(Array.from({ length: fast.frames }, (_, i) => JSON.stringify(fast.at(i / fast.frames))))
        expect(poses.size).toBeGreaterThan(2)
      }
    }
  })
})

describe('checkFit', () => {
  // A w × h bitmap with a filled circle of radius r at (cx, cy).
  const disc = (w: number, h: number, cx: number, cy: number, r: number) => {
    const d = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < r * r) d[(y * w + x) * 4 + 3] = 255
    return d
  }

  it('passes a centered emoji with a margin', () => {
    expect(checkFit(disc(200, 200, 100, 100, 85), 200, 200).problem).toBeNull()
  })

  it('flags a subject sliced off at the edge, and which side', () => {
    const r = checkFit(disc(200, 200, 40, 100, 80), 200, 200)
    expect(r.problem).toBe('cropped')
    expect(r.sides).toEqual(['left'])
  })

  it('lets a round emoji touch the edge without counting it as cut off', () => {
    // As the model returns it: 1024 px, touching all four sides.
    expect(checkFit(disc(1024, 1024, 512, 512, 512), 1024, 1024).problem).toBeNull()
  })

  it('flags a small slice off one side', () => {
    expect(checkFit(disc(1024, 1024, 512, 470, 500), 1024, 1024).sides).toEqual(['top'])
  })

  it('flags a full tile and a blank canvas', () => {
    const tile = new Uint8ClampedArray(64 * 64 * 4).fill(255)
    expect(checkFit(tile, 64, 64).problem).toBe('no-background')
    expect(checkFit(new Uint8ClampedArray(64 * 64 * 4), 64, 64).problem).toBe('empty')
  })

  it('prefers a fitting result over a cut-off one over a full tile', () => {
    const ok = checkFit(disc(100, 100, 50, 50, 40), 100, 100)
    const cut = checkFit(disc(100, 100, 10, 50, 40), 100, 100)
    const tile = checkFit(new Uint8ClampedArray(100 * 100 * 4).fill(255), 100, 100)
    expect(fitPenalty(ok)).toBeLessThan(fitPenalty(cut))
    expect(fitPenalty(cut)).toBeLessThan(fitPenalty(tile))
  })
})
