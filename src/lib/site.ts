export const CONTACT_EMAIL = 'hello@moji.locker'

export const FEEDBACK_URL = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Moji Locker feedback')}`

export type Route = 'app' | 'faq' | 'privacy' | 'terms'

export const PAGE_TITLES: Record<Route, string> = {
  app: 'Moji Locker · custom emoji maker',
  faq: 'FAQ · Moji Locker',
  privacy: 'Privacy · Moji Locker',
  terms: 'Terms · Moji Locker',
}

export function routeFor(pathname: string): Route {
  const slug = pathname.replace(/\/+$/, '').slice(1)
  return slug === 'faq' || slug === 'privacy' || slug === 'terms' ? slug : 'app'
}

// Cloudflare Web Analytics: cookieless, no personal data. Only loads when a
// token is configured, so local and preview builds send nothing.
export function loadAnalytics() {
  const token = import.meta.env.VITE_CF_ANALYTICS_TOKEN as string | undefined
  if (!token || typeof document === 'undefined') return
  const script = document.createElement('script')
  script.defer = true
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js'
  script.dataset.cfBeacon = JSON.stringify({ token, spa: true })
  document.head.appendChild(script)
}
