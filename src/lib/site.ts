export const CONTACT_EMAIL = 'hello@moji.locker'

export const FEEDBACK_URL = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Moji Locker feedback')}`

export const SUPPORT_EMAIL = 'support@moji.locker'

export const SUPPORT_URL = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Moji Locker support')}`

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

// The Slack app's public Client ID (Basic Information on api.slack.com). Not a
// secret: it appears in every install link. Empty hides the Add to Slack button.
export const SLACK_CLIENT_ID = '12157955018117.12166731138340'

export const SLACK_INSTALL_URL = `https://slack.com/oauth/v2/authorize?${new URLSearchParams({
  client_id: SLACK_CLIENT_ID,
  scope: 'commands',
})}`
