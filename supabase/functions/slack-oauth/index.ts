// Supabase Edge Function: finishes "Add to Slack" installs from moji.locker/slack.
//
// Slack redirects here with a one-time code after someone approves the app.
// Exchanging it completes the install; the app only uses the `commands` scope
// and verifies commands with its signing secret, so the returned token isn't
// needed and isn't stored. Then the person is sent back to moji.locker/slack.
//
// Secrets (Dashboard > Edge Functions > Secrets):
//   SLACK_CLIENT_ID           from the Slack app's Basic Information
//   SLACK_CLIENT_SECRET       from the Slack app's Basic Information
//   SITE_URL                  default https://moji.locker

const SITE = Deno.env.get('SITE_URL') ?? 'https://moji.locker'

const back = (params: Record<string, string>) => Response.redirect(`${SITE}/slack?${new URLSearchParams(params)}`, 302)

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  if (url.searchParams.get('error') || !code) return back({ error: 'cancelled' })

  const clientId = Deno.env.get('SLACK_CLIENT_ID')
  const clientSecret = Deno.env.get('SLACK_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    console.error('SLACK_CLIENT_ID or SLACK_CLIENT_SECRET is not set')
    return back({ error: 'failed' })
  }

  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code }),
  })
  const body = await res.json().catch(() => ({ ok: false, error: `http ${res.status}` }))
  if (!body.ok) {
    console.error('oauth.v2.access failed', body.error)
    return back({ error: 'failed' })
  }
  return back({ installed: '1' })
})
