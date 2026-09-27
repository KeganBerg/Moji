import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { I18nContext, RTL, getState, readStored, setLanguage, subscribe, translator, type I18n } from '../lib/i18n'

/** Gives the editor its chosen language and sets the page's lang and direction. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const current = useSyncExternalStore(subscribe, getState, getState)

  useEffect(() => {
    const stored = readStored()
    if (stored !== 'en') void setLanguage(stored)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.lang = current.lang
    root.dir = RTL.has(current.lang) ? 'rtl' : 'ltr'
  }, [current.lang])

  const value = useMemo<I18n>(() => {
    const t = translator(current.messages)
    const rules = new Intl.PluralRules(current.lang)
    return { lang: current.lang, t, plural: (n, one, other) => t(rules.select(n) === 'one' ? one : other, { n }) }
  }, [current])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
