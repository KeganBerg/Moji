import { Ghost } from 'lucide-react'
import type { ReactNode } from 'react'
import { useI18n } from '../lib/i18n'
import { setSeasonOff, useSeason } from '../lib/season'
import { FEEDBACK_URL, SUPPORT_URL } from '../lib/site'

/** The top bar. Children sit on the right, opposite the wordmark. */
export function SiteHeader({ children }: { children?: ReactNode }) {
  const season = useSeason()
  const { t } = useI18n()
  return (
    <header className="topbar">
      <a className="wordmark" href="/" aria-label={t('home')}>
        {season.on ? (
          <svg viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="9" />
            <path className="carve" d="M8.5 15.5 11.5 10l3 5.5zM17.5 15.5l3-5.5 3 5.5z" />
            <path className="carve" d="M8 18.5h16c-1 3.6-4 5.5-8 5.5s-7-1.9-8-5.5z" />
            <path className="tooth" d="M12 18.5l1.6 2.2 1.6-2.2zM16.8 18.5l1.6 2.2 1.6-2.2z" />
          </svg>
        ) : (
          <svg viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="9" />
            <circle cx="11.5" cy="13" r="2.2" />
            <circle cx="20.5" cy="13" r="2.2" />
            <path d="M10 19.5c1.6 2.6 3.8 3.9 6 3.9s4.4-1.3 6-3.9" />
          </svg>
        )}
        Moji Locker
      </a>
      <div className="topbar-actions">
        {season.inSeason && (
          <button
            type="button"
            className={`icon-button season-toggle${season.on ? ' is-on' : ''}`}
            onClick={() => setSeasonOff(season.on)}
            aria-pressed={season.on}
            aria-label={t('halloweenTheme')}
            title={season.on ? t('halloweenOff') : t('halloweenOn')}
          >
            <Ghost size={17} />
          </button>
        )}
        {children}
      </div>
    </header>
  )
}

export function SiteFooter() {
  const { t } = useI18n()
  return (
    <footer className="footer">
      <p>{t('footerNote')}</p>
      <nav className="footer-links" aria-label={t('siteLinks')}>
        <a href="/guides">{t('guides')}</a>
        <a href="/slack">{t('slackApp')}</a>
        <a href="/faq">{t('faq')}</a>
        <a href="/privacy">{t('privacy')}</a>
        <a href="/terms">{t('terms')}</a>
        <a href={FEEDBACK_URL}>{t('sendFeedback')}</a>
        <a href={SUPPORT_URL}>{t('support')}</a>
      </nav>
    </footer>
  )
}
