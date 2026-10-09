import { describe, expect, it } from 'vitest'
import { ANIMATIONS, SPEED, composeAnimations, getAnimation, withIntensity, withSpeed } from './animations'
import { encodeGif, frameTiming, gifLadder, keepsMotion } from './export'
import { PLATFORMS, formatBytes, sanitizeName } from './platforms'
import {
  DEFAULT_RENDER,
  SPARKLES,
  convexHull,
  insetFor,
  isPixelArt,
  opaqueBounds,
  rotatedSize,
  svgAspect,
} from './render'
import { DEFAULT_TUNE, tunePixels } from './tune'
import { DEFAULT_STRENGTH, findFrame, looksPhotographic, removeBackground, suggestCutout } from './cutout'
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

describe('spring motions', () => {
  // The last frame must flow into the first, or the GIF visibly jumps each loop.
  const close = (id: string) => {
    const a = getAnimation(id)
    const start = a.at(0)
    const end = a.at(0.9999)
    for (const k of ['rotate', 'scaleX', 'scaleY', 'x', 'y'] as const)
      expect(
        Math.abs((end[k] ?? (k.startsWith('scale') ? 1 : 0)) - (start[k] ?? (k.startsWith('scale') ? 1 : 0))),
      ).toBeLessThan(0.02)
  }
  it('loops Bounce, Jiggle and Pop without a jump', () => {
    close('bounce')
    close('jiggle')
    close('pop')
  })
  it('starts Pop on the whole emoji, so its still frame is never empty', () => {
    expect(getAnimation('pop').at(0).scaleX).toBe(1)
  })
  it('keeps the sparkles through stacking and intensity', () => {
    const pop = getAnimation('pop')
    const t = 0.7
    expect(pop.at(t).burst).toBeGreaterThan(0)
    expect(composeAnimations([pop, getAnimation('party')]).at(t).burst).toBe(pop.at(t).burst)
    expect(withIntensity(pop, 1.5).at(t).burst).toBe(pop.at(t).burst)
  })
})

describe('staying inside the frame', () => {
  // Corners and edge midpoints of a 100 × 60 image: the worst case, since a
  // square-cornered image reaches furthest when it turns.
  const w = 100
  const h = 60
  const points: [number, number][] = []
  for (const x of [-w / 2, 0, w / 2]) for (const y of [-h / 2, 0, h / 2]) points.push([x, y])

  it('keeps every motion and rotation inside the canvas at full scale', () => {
    for (const opts of [
      { ...DEFAULT_RENDER, padding: 0 },
      { ...DEFAULT_RENDER, padding: 0, rotation: 30, flip: true },
    ])
      for (const base of ANIMATIONS)
        for (const amount of [1, 2]) {
          const anim = withIntensity(base, amount)
          if (anim.frames <= 1) continue
          const inset = insetFor(points, w, h, opts, anim)
          const box = rotatedSize(w, h, opts.rotation)
          const unit = (inset * (1 - opts.padding * 2)) / Math.max(box.w, box.h)
          const rot = (opts.rotation * Math.PI) / 180
          for (let i = 0; i < 360; i++) {
            const f = anim.at(i / 360)
            for (const [px, py] of points) {
              const u = opts.flip ? -px : px
              const x0 = (u * Math.cos(rot) - py * Math.sin(rot)) * (f.scaleX ?? 1)
              const y0 = (u * Math.sin(rot) + py * Math.cos(rot)) * (f.scaleY ?? 1)
              const r = f.rotate ?? 0
              const x = (f.x ?? 0) + (x0 * Math.cos(r) - y0 * Math.sin(r)) * unit
              const y = (f.y ?? 0) + (x0 * Math.sin(r) + y0 * Math.cos(r)) * unit
              expect(Math.max(Math.abs(x), Math.abs(y)), `${anim.id} at ${i}`).toBeLessThanOrEqual(0.5)
            }
          }
        }
  })

  it('keeps every sparkle inside the canvas', () => {
    for (const s of SPARKLES) expect(s.reach + s.size).toBeLessThanOrEqual(0.48)
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

  // A size×size canvas filled by `paint(x, y)` → grey level, fully opaque.
  function canvas(size: number, paint: (x: number, y: number) => number | [number, number, number]) {
    const d = new Uint8ClampedArray(size * size * 4)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const v = paint(x, y)
        d.set([...(typeof v === 'number' ? [v, v, v] : v), 255], (y * size + x) * 4)
      }
    return { d, at: (x: number, y: number) => d[(y * size + x) * 4 + 3] }
  }
  const inDisc = (x: number, y: number, cx: number, cy: number, r: number) => (x - cx) ** 2 + (y - cy) ** 2 < r * r

  // A shaded "photo" (a dark-suited figure on a navy wall) in flat bars, the way a screenshot comes.
  const framedPhoto = (bar: number) =>
    canvas(96, (x, y) => {
      if (y < 12 || y >= 84) return bar
      const n = ((x * 7919 + y * 104729) % 23) - 11
      if (inDisc(x, y, 48, 60, 30)) return [20 + n, 20 + n, 24 + n]
      return [30 + ((x * 3) % 40) + n, 40 + ((y * 5) % 50) + n, 90 + n]
    })

  it('finds the photo inside a screenshot’s bars, even where the photo is as dark as them', () => {
    expect(findFrame(framedPhoto(0).d, 96, 96)).toEqual({ x: 0, y: 12, w: 96, h: 72 })
    expect(findFrame(framedPhoto(18).d, 96, 96)).toEqual({ x: 0, y: 12, w: 96, h: 72 })
    // A logo on white has no bars: the white around it doesn't box in a full rectangle.
    const logo = canvas(96, (x, y) => (inDisc(x, y, 48, 48, 30) ? [200, 40, 40] : 255))
    expect(findFrame(logo.d, 96, 96)).toBeNull()
  })

  it('tells a photo from flat artwork', () => {
    const p = framedPhoto(0)
    expect(looksPhotographic(p.d, 96, 96, { x: 0, y: 12, w: 96, h: 72 })).toBe(true)
    const logo = canvas(96, (x, y) => (inDisc(x, y, 48, 48, 30) ? (x < 48 ? [200, 40, 40] : [40, 40, 200]) : 255))
    expect(looksPhotographic(logo.d, 96, 96)).toBe(false)
  })

  it('removes a baked-in light checkerboard', () => {
    // Web "transparent" PNGs often have the white and light grey squares saved into the pixels.
    const c = canvas(64, (x, y) => (inDisc(x, y, 32, 32, 18) ? [200, 40, 40] : ((x >> 3) + (y >> 3)) % 2 ? 204 : 255))
    expect(suggestCutout(c.d, 64, 64)).toBe(true)
    removeBackground(c.d, 64, 64, DEFAULT_STRENGTH)
    expect(c.at(0, 0)).toBe(0)
    expect(c.at(12, 3)).toBe(0)
    expect(c.at(60, 60)).toBe(0)
    expect(c.at(32, 32)).toBe(255)
  })

  it("doesn't mistake a subject touching the edge for a second background color", () => {
    // A dark rounded tile filling most of a white canvas, touching all four edges.
    const c = canvas(64, (x, y) => (Math.abs(x - 32) + Math.abs(y - 32) < 44 ? 25 : 255))
    removeBackground(c.d, 64, 64, DEFAULT_STRENGTH)
    expect(c.at(0, 0)).toBe(0)
    expect(c.at(32, 0)).toBe(255)
    expect(c.at(32, 32)).toBe(255)
  })

  it('drops a streaky brushstroke behind the subject but keeps it whole', () => {
    // A badge on near-black, with a light grey brushstroke of thin diagonal
    // streaks running out from behind it, like a grunge logo.
    const c = canvas(128, (x, y) => {
      if (inDisc(x, y, 64, 76, 30)) return inDisc(x, y, 64, 76, 26) ? [30, 140, 70] : 240
      // The stroke runs down-left to up-right; its streaks run the same way.
      const inStroke = x > 16 && x < 112 && y > 10 && y < 60 && Math.abs(x + y - 100) < 30
      return inStroke && (x + y) % 5 < 3 ? 170 : 22
    })
    removeBackground(c.d, 128, 128, DEFAULT_STRENGTH)
    // At most a short stub can remain where a streak meets the rim.
    let left = 0
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) if (c.at(x, y) > 0 && !inDisc(x, y, 64, 76, 34)) left++
    expect(left).toBe(0)
    expect(c.at(64, 76)).toBe(255)
    expect(c.at(64, 49)).toBe(255) // the badge's light rim, right where the stroke meets it
  })

  it('keeps fine text-like detail and solid thin parts next to the subject', () => {
    const c = canvas(128, (x, y) => {
      if (inDisc(x, y, 64, 50, 30)) return 30
      // A "word" of upright letter stems right under it, 2px apart.
      if (y >= 84 && y < 92 && x >= 30 && x < 98 && x % 4 < 2) return 30
      // A lollipop stick.
      if (x >= 62 && x < 66 && y >= 92 && y < 124) return 30
      return 255
    })
    removeBackground(c.d, 128, 128, DEFAULT_STRENGTH)
    expect(c.at(32, 86)).toBe(255)
    expect(c.at(93, 86)).toBe(255)
    expect(c.at(63, 120)).toBe(255)
  })

  it('clears the inside of letters but keeps a white highlight in an eye', () => {
    // "O"s: dark rings on white, their insides as white as the background.
    const ring = (x: number, y: number, cx: number) => inDisc(x, y, cx, 64, 20) && !inDisc(x, y, cx, 64, 10)
    const text = canvas(128, (x, y) => (ring(x, y, 34) || ring(x, y, 94) ? 25 : 255))
    const report = { holes: 0, holesCleared: false }
    removeBackground(text.d, 128, 128, DEFAULT_STRENGTH, { report })
    expect(report).toEqual({ holes: 2, holesCleared: true })
    expect(text.at(34, 64)).toBe(0)
    expect(text.at(34, 48)).toBe(255)
    // A big face with a dark pupil and a white highlight deep inside it.
    const face = canvas(128, (x, y) =>
      inDisc(x, y, 64, 64, 6) ? 255 : inDisc(x, y, 64, 64, 14) ? 20 : inDisc(x, y, 64, 64, 56) ? [250, 200, 40] : 255,
    )
    removeBackground(face.d, 128, 128, DEFAULT_STRENGTH)
    expect(face.at(64, 64)).toBe(255)
    // ...unless asked.
    const cleared = canvas(128, (x, y) =>
      inDisc(x, y, 64, 64, 6) ? 255 : inDisc(x, y, 64, 64, 14) ? 20 : inDisc(x, y, 64, 64, 56) ? [250, 200, 40] : 255,
    )
    removeBackground(cleared.d, 128, 128, DEFAULT_STRENGTH, { holes: 'clear' })
    expect(cleared.at(64, 64)).toBe(0)
  })

  it('keeps a small dot drawn on purpose beside the subject', () => {
    const c = canvas(256, (x, y) =>
      inDisc(x, y, 120, 130, 90) ? [200, 50, 40] : inDisc(x, y, 236, 18, 7) ? [255, 190, 0] : 255,
    )
    removeBackground(c.d, 256, 256, DEFAULT_STRENGTH)
    expect(c.at(236, 18)).toBe(255)
  })

  it('drops a soft drop shadow on a light background', () => {
    const c = canvas(128, (x, y) => {
      if (inDisc(x, y, 64, 54, 30)) return [40, 90, 200]
      // A blurred oval shadow under it.
      const r = Math.hypot((x - 64) / 36, (y - 104) / 9)
      return r < 1.6 ? Math.round(255 - 90 * Math.max(0, 1 - r / 1.6) ** 1.5) : 255
    })
    removeBackground(c.d, 128, 128, DEFAULT_STRENGTH)
    expect(c.at(64, 104)).toBe(0)
    expect(c.at(64, 54)).toBe(255)
  })

  it('drops lone specks floating in the background', () => {
    const c = canvas(128, (x, y) =>
      inDisc(x, y, 64, 64, 36) || (x === 10 && y === 10) || (x >= 110 && x < 112 && y >= 20 && y < 22) ? 40 : 255,
    )
    removeBackground(c.d, 128, 128, DEFAULT_STRENGTH)
    expect(c.at(10, 10)).toBe(0)
    expect(c.at(110, 20)).toBe(0)
    expect(c.at(64, 64)).toBe(255)
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

describe('sources', () => {
  it("reads an SVG's shape from its size or viewBox", () => {
    expect(svgAspect('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80">')).toBe(2.5)
    expect(svgAspect('<svg width="24" height="48" viewBox="0 0 10 10">')).toBe(0.5)
    expect(svgAspect('<svg width="100%" height="100%" viewBox="0,0,30,10">')).toBe(3)
    expect(svgAspect('<svg>')).toBeNull()
  })

  it('spots pixel art but not small anti-aliased icons', () => {
    const art = new Uint8ClampedArray(16 * 16 * 4)
    for (let i = 0; i < 16 * 16; i++)
      art.set(i % 3 ? [220, 30, 60, 255] : i % 2 ? [255, 160, 170, 255] : [0, 0, 0, 0], i * 4)
    expect(isPixelArt(art, 16, 16)).toBe(true)
    const soft = art.slice()
    soft[7] = 120
    expect(isPixelArt(soft, 16, 16)).toBe(false)
    expect(isPixelArt(art, 200, 2)).toBe(false)
  })

  it('wraps every point in a convex hull', () => {
    const hull = convexHull([
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [2, 2],
      [1, 3],
    ])
    expect(hull).toHaveLength(4)
    expect(hull).toEqual(
      expect.arrayContaining([
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ]),
    )
  })
})
