import { describe, expect, it } from 'vitest'
import { en, type Messages } from '../locales/en'
import { LANGUAGES, RTL, getState, setLanguage, translator, type LangCode } from './i18n'

const files = import.meta.glob<{ default: Messages }>('../locales/*.ts', { eager: true })
const locales = Object.fromEntries(
  Object.entries(files)
    .map(([path, mod]) => [path.replace(/^.*\/(\w+)\.ts$/, '$1'), mod.default] as const)
    .filter(([code]) => code !== 'en'),
) as Record<string, Messages>
const codes = LANGUAGES.map((l) => l.code).filter((c) => c !== 'en')
const keys = Object.keys(en) as (keyof Messages)[]

// Names, commands, file formats and addresses that are never translated.
const PROTECTED = ['Moji Locker', 'moji.locker', '/moji', 'Slack', 'Discord', 'PNG', 'JPG', 'GIF', 'WebP', '@']
const count = (text: string, term: string) => text.split(term).length - 1
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

// Letters each language's own script uses, to catch English left in place.
const SCRIPTS: Partial<Record<LangCode, RegExp>> = {
  zh: /\p{Script=Han}/u,
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
  ko: /\p{Script=Hangul}/u,
  ar: /\p{Script=Arabic}/u,
  ru: /\p{Script=Cyrillic}/u,
  hi: /\p{Script=Devanagari}/u,
}

describe('language list', () => {
  it('has 15 unique languages with English first', () => {
    expect(LANGUAGES).toHaveLength(15)
    expect(new Set(LANGUAGES.map((l) => l.code)).size).toBe(15)
    expect(LANGUAGES[0].code).toBe('en')
  })
  it('has exactly one translation file per language', () => {
    expect(Object.keys(locales).sort()).toEqual([...codes].sort())
  })
  it('marks only Arabic as right to left', () => {
    expect([...RTL]).toEqual(['ar'])
  })
})

describe.each(codes)('%s translation', (code) => {
  const messages = locales[code]

  it('has every key and nothing extra', () => {
    expect(Object.keys(messages).sort()).toEqual([...keys].sort())
  })

  it('has no empty or padded strings', () => {
    for (const key of keys) {
      expect(messages[key].trim(), key).not.toBe('')
      expect(messages[key], key).toBe(messages[key].trim())
    }
  })

  it('keeps every {placeholder}', () => {
    for (const key of keys) expect(placeholders(messages[key]), key).toEqual(placeholders(en[key]))
  })

  it('keeps names, commands and formats exactly as written', () => {
    for (const key of keys) {
      for (const term of PROTECTED) {
        if (count(en[key], term) > 0) expect(count(messages[key], term), `${key}: ${term}`).toBe(count(en[key], term))
      }
    }
  })

  it('translates every sentence', () => {
    for (const key of keys) {
      if (en[key].split(' ').length >= 3) expect(messages[key], key).not.toBe(en[key])
    }
  })

  const script = SCRIPTS[code as LangCode]
  it.runIf(!!script)('writes words in its own script', () => {
    for (const key of keys) {
      let rest = messages[key].replace(/\{\w+\}/g, '')
      for (const term of PROTECTED) rest = rest.split(term).join('')
      if (/\p{L}/u.test(rest.replace(/3D/g, ''))) expect(rest, key).toMatch(script!)
    }
  })
})

describe('switching languages', () => {
  it('starts in English', () => {
    expect(getState().lang).toBe('en')
    expect(translator(getState().messages)('gallery')).toBe('Gallery')
  })

  it('switches to each language and back without leftovers', async () => {
    for (const code of codes) {
      await setLanguage(code)
      expect(getState().lang).toBe(code)
      expect(getState().messages).toBe(locales[code])
      expect(translator(getState().messages)('gallery')).toBe(locales[code].gallery)
    }
    await setLanguage('en')
    expect(getState().lang).toBe('en')
    expect(translator(getState().messages)('gallery')).toBe('Gallery')
  })

  it('keeps the last pick when loads finish out of order', async () => {
    const slow = setLanguage('ja')
    const fast = setLanguage('en')
    await Promise.all([slow, fast])
    expect(getState().lang).toBe('en')
    await Promise.all([setLanguage('fr'), setLanguage('de')])
    expect(getState().lang).toBe('de')
    await setLanguage('en')
  })
})

describe('translator', () => {
  it('fills placeholders and falls back to English for missing keys', () => {
    const t = translator({ useImage: 'Usar {name}' })
    expect(t('useImage', { name: 'taco' })).toBe('Usar taco')
    expect(t('gallery')).toBe('Gallery')
    expect(t('downloadFile', { file: 'cat.gif' })).toBe('Download cat.gif')
  })
})
