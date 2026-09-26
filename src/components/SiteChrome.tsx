import { FEEDBACK_URL } from '../lib/site'

export function SiteHeader({ tagline = true }: { tagline?: boolean }) {
  return (
    <header className="topbar">
      <a className="wordmark" href="/" aria-label="Moji Locker home">
        <svg viewBox="0 0 32 32" aria-hidden>
          <rect width="32" height="32" rx="9" />
          <circle cx="11.5" cy="13" r="2.2" />
          <circle cx="20.5" cy="13" r="2.2" />
          <path d="M10 19.5c1.6 2.6 3.8 3.9 6 3.9s4.4-1.3 6-3.9" />
        </svg>
        Moji Locker
      </a>
      {tagline && <p className="topbar-tag">Custom emoji, sized right for Slack and Discord.</p>}
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <p>
        Images you upload never leave your browser. Descriptions are sent to the image model only when you generate.
      </p>
      <nav className="footer-links" aria-label="Site">
        <a href="/faq">FAQ</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href={FEEDBACK_URL}>Send feedback</a>
      </nav>
    </footer>
  )
}
