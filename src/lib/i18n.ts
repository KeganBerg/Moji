import { createContext, useContext } from 'react'
import { en, type Messages } from '../locales/en'

/**
 * The editor's interface language. English is the default and is bundled; the
 * others load on demand, so picking one costs a single small request. Info
 * pages (guides, FAQ, legal) stay in English and don't use the provider.
 */
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'zh', name: '中文（简体）' },
  { code: 'ar', name: 'العربية' },
  { code: 'pt', name: 'Português' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'fr', name: 'Français' },
  { code: 'ja', name: '日本語' },
  { code: 'ru', name: 'Русский' },
  { code: 'de', name: 'Deutsch' },
  { code: 'ko', name: '한국어' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'it', name: 'Italiano' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'hi', name: 'हिन्दी' },
] as const

export type LangCode = (typeof LANGUAGES)[number]['code']
export type MessageKey = keyof Messages
type Vars = Record<string, string | number>
export type Translate = (key: MessageKey, vars?: Vars) => string

const STORAGE_KEY = 'moji-language'
const loaders = import.meta.glob<{ default: Partial<Messages> }>(['../locales/*.ts', '!../locales/en.ts'])

let state: { lang: LangCode; messages: Partial<Messages> } = { lang: 'en', messages: en }
export const getState = () => state
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Languages written right to left. */
export const RTL: ReadonlySet<string> = new Set(['ar'])

const isLang = (code: string | null): code is LangCode => LANGUAGES.some((l) => l.code === code)

export function readStored(): LangCode {
  try {
    const code = localStorage.getItem(STORAGE_KEY)
    return isLang(code) ? code : 'en'
  } catch {
    return 'en'
  }
}

let latestRequest = 0

export async function setLanguage(lang: LangCode) {
  try {
    if (lang === 'en') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
  // A slower load must not overwrite a language picked after it.
  const request = ++latestRequest
  let messages: Partial<Messages> = en
  if (lang !== 'en') {
    const load = loaders[`../locales/${lang}.ts`]
    if (!load) return
    try {
      messages = (await load()).default
    } catch {
      // Offline or a failed request: stay in the current language.
      return
    }
  }
  if (request !== latestRequest) return
  state = { lang, messages }
  emit()
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function format(text: string, vars?: Vars) {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text
}

export function translator(messages: Partial<Messages>): Translate {
  return (key, vars) => format(messages[key] ?? en[key], vars)
}

export interface I18n {
  lang: LangCode
  t: Translate
  /** Picks the plural form for a count, e.g. "1 generation" vs "3 generations". */
  plural: (n: number, one: MessageKey, other: MessageKey) => string
}

const english: I18n = {
  lang: 'en',
  t: translator(en),
  plural: (n, one, other) => translator(en)(n === 1 ? one : other, { n }),
}

export const I18nContext = createContext<I18n>(english)

/** Outside the provider (info pages, prerendering) everything is English. */
export const useI18n = () => useContext(I18nContext)
