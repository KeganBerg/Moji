import { useState } from 'react'
import { SLACK_CLIENT_ID, SLACK_INSTALL_URL } from '../lib/site'

type Result = 'installed' | 'cancelled' | 'failed' | null

// Slack's install flow sends people back to /slack?installed=1 or ?error=….
// The page is client-rendered (createRoot, not hydrated), so reading the URL
// during render is safe.
function installResult(): Result {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const error = params.get('error')
  return params.get('installed') ? 'installed' : error === 'cancelled' || error === 'failed' ? error : null
}

/** Add to Slack button, plus the outcome when Slack sends someone back here after installing. */
export function SlackInstall() {
  const [result] = useState(installResult)
  return (
    <>
      {result && (
        <p className={`slack-result is-${result === 'installed' ? 'ok' : 'error'}`} role="status">
          {result === 'installed'
            ? 'Moji Locker is installed. Type /moji in any channel to try it.'
            : result === 'cancelled'
              ? 'The install was cancelled. Nothing was added to your workspace.'
              : 'The install didn’t finish. Try again in a minute.'}
        </p>
      )}
      <p className="info-cta">
        {SLACK_CLIENT_ID ? (
          <a href={SLACK_INSTALL_URL}>Add to Slack</a>
        ) : (
          <span className="slack-soon">The Add to Slack button is coming soon.</span>
        )}
      </p>
    </>
  )
}
