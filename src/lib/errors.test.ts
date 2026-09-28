import { describe, expect, it } from 'vitest'
import { en } from '../locales/en'
import { errorText, toUiError } from './errors'
import { translator } from './i18n'
import sharedSrc from '../../supabase/functions/_shared/generate.ts?raw'
import websiteSrc from '../../supabase/functions/generate-emoji/index.ts?raw'

// Every message the generate-emoji function can return: `error: '...'`
// literals, the branches of `error: cond ? '...' : '...'`, and *_MESSAGE
// constants, with template values filled in.
const serverMessages = [sharedSrc, websiteSrc]
  .flatMap((src) => [...src.matchAll(/error:\s*(['"`])((?:(?!\1).)+)\1/g)].map((m) => m[2]))
  .map((text) => text.replace(/\$\{[^}]+\}/g, '15'))
  .concat([...sharedSrc.matchAll(/^\s+[?:] (['"])(.+?)\1,?$/gm)].map((m) => m[2]))
  .concat([...sharedSrc.matchAll(/_MESSAGE = (['"])(.+?)\1/g)].map((m) => m[2]))
// 'Not generated yet' answers a Slack link's cache-only request; it's never shown.
const REQUEST_ONLY = ['Method not allowed', 'Origin not allowed', 'Not generated yet']

describe('error messages', () => {
  it('finds the server messages', () => {
    expect(serverMessages.length).toBeGreaterThan(8)
  })

  it.each(serverMessages.filter((m) => !REQUEST_ONLY.includes(m)))('translates "%s"', (message) => {
    expect(toUiError(new Error(message))).toHaveProperty('key')
  })

  it('keeps the numbers', () => {
    const t = translator(en)
    expect(errorText(toUiError(new Error("You've used today's 15 AI generations. Uploads still work.")), t, 'en')).toBe(
      "You've used today's 15 AI generations. Uploads still work.",
    )
    expect(errorText(toUiError(new Error('Keep the description under 200 characters')), t, 'en')).toContain('200')
  })

  it('shows unknown errors in English only', () => {
    const t = translator(en)
    expect(errorText(toUiError(new Error('QuotaExceededError')), t, 'en')).toBe('QuotaExceededError')
    expect(errorText(toUiError(new Error('QuotaExceededError')), t, 'de')).toBe(en.errGeneric)
  })
})
