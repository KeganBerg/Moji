import type { MessageKey, Translate } from './i18n'

/**
 * An error to show in the toast. Known messages become a translation key so
 * they follow the chosen language (and switch with it); anything else keeps
 * its original text.
 */
export type UiError = { key: MessageKey; vars?: Record<string, string | number> } | { raw: string }

// The generate-emoji function (supabase/functions/_shared/generate.ts) and the
// editor's own code report these English messages; each maps to a key.
// errors.test.ts checks every server message is covered.
const KNOWN: [RegExp, MessageKey][] = [
  [/^AI generation is not set up yet/, 'errNotSetUp'],
  [/^Describe the emoji you want/, 'errDescribe'],
  [/^Keep the description under (\d+) characters/, 'errTooLong'],
  [/^That description can't be generated/, 'errBlocked'],
  [/^You've reached today's limit/, 'errLimit'],
  [/^You've used today's (\d+) AI generations/, 'errLimitN'],
  [/^AI generation is busy for today/, 'errBusy'],
  [/^AI generation is unavailable right now/, 'errUnavailable'],
  [/^Generation failed/, 'errFailed'],
  [/^Could not reach the generator/, 'errOffline'],
  [/^That file could not be read as an image/, 'errNotImage'],
  [/^Export failed/, 'errExport'],
  [/^Canvas 2D is not available/, 'errCanvas'],
]

export function toUiError(e: unknown): UiError {
  const message = e instanceof Error ? e.message : String(e)
  for (const [pattern, key] of KNOWN) {
    const m = message.match(pattern)
    if (m) return m[1] ? { key, vars: { n: Number(m[1]) } } : { key }
  }
  return { raw: message }
}

/** Unknown messages are English, so other languages get a generic line instead. */
export function errorText(error: UiError, t: Translate, lang: string): string {
  if ('key' in error) return t(error.key, error.vars)
  return lang === 'en' && error.raw ? error.raw : t('errGeneric')
}
