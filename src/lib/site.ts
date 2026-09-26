export const CONTACT_EMAIL = 'hello@moji.locker'

export const FEEDBACK_URL = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Moji Locker feedback')}`

export const SITE_URL = 'https://moji.locker'

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
