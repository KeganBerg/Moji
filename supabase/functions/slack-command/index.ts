// Supabase Edge Function: the Slack app's /moji slash command.
//
//   /moji a taco wearing sunglasses
//   /moji pixel a happy ghost          (a leading style word picks the style)
//
// Slack wants an answer within 3 seconds, so the command is acknowledged at
// once and the emoji is made in the background, then posted back through the
// command's response_url as a message only the requester sees: the 128 px
// emoji, a Download button, and a button to the workspace's Add Emoji page.
// Apps can't add custom emoji themselves outside Enterprise Grid
// (admin.emoji.add), so the final upload is the person's.
//
// Requests are verified with the app's signing secret, so no bot token is
// needed or stored. Each Slack user has the same daily limit as a website
// visitor, tracked by a hash of their workspace and user IDs.
//
// Secrets (Dashboard > Edge Functions > Secrets), besides those in _shared:
//   SLACK_SIGNING_SECRET      required, from the Slack app's Basic Information
//   SITE_URL                  default https://moji.locker

import { adminClient, BUCKET, cleanPrompt, generateEmoji, MAX_PROMPT, sha256, STYLES } from '../_shared/generate.ts'
import { toSlackEmoji } from './resize.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const SITE = Deno.env.get('SITE_URL') ?? 'https://moji.locker'
const LINK_DAYS = 7

type Blocks = Record<string, unknown>[]
interface Command {
  team_id: string
  team_domain: string
  user_id: string
  text: string
  response_url: string
}

const encoder = new TextEncoder()

/** Checks Slack's v0 request signature: HMAC-SHA256 of "v0:timestamp:body". */
async function verify(req: Request, body: string): Promise<boolean> {
  const secret = Deno.env.get('SLACK_SIGNING_SECRET')
  const timestamp = req.headers.get('x-slack-request-timestamp') ?? ''
  const signature = req.headers.get('x-slack-signature') ?? ''
  if (!secret || !timestamp || !signature) return false
  // Reject replays older than five minutes.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 60 * 5) return false
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`v0:${timestamp}:${body}`))
  const expected = 'v0=' + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

/** "pixel a happy ghost" -> style pixel, subject "a happy ghost". A lone word is always the subject. */
export function parseText(text: string): { style: string; subject: string } {
  const clean = cleanPrompt(text)
  const [first, ...rest] = clean.split(' ')
  const word = first?.toLowerCase().replace(/[:,]$/, '')
  if (rest.length && word && Object.hasOwn(STYLES, word)) return { style: word, subject: rest.join(' ') }
  return { style: 'flat', subject: clean }
}

/** A Slack-friendly emoji name from the description, e.g. "taco_wearing_sunglasses". */
export function emojiName(subject: string): string {
  const words = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w && !['a', 'an', 'the'].includes(w))
  let name = ''
  for (const w of words) {
    const next = name ? `${name}_${w}` : w
    if (next.length > 32) break
    name = next
  }
  return name || 'moji'
}

const STYLE_LIST = Object.keys(STYLES).join(', ')
const HELP =
  `Describe an emoji and Moji Locker makes it, sized for Slack.\n` +
  '• `/moji a taco wearing sunglasses`\n' +
  `• Start with a style to change the look: \`/moji pixel a happy ghost\` (${STYLE_LIST})\n` +
  `For motion, text and uploads, use <${SITE}|moji.locker>.`

/** Slack treats &, < and > as markup in message text. */
const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const ephemeral = (text: string, blocks?: Blocks) => ({ response_type: 'ephemeral', text, ...(blocks && { blocks }) })

async function respond(url: string, message: Record<string, unknown>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ replace_original: true, ...message }),
  })
  if (!res.ok) console.error('response_url failed', res.status, await res.text())
}

async function make(cmd: Command, style: string, subject: string) {
  try {
    const admin = adminClient()
    const day = new Date().toISOString().slice(0, 10)
    const visitor = await sha256(`slack|${cmd.team_id}|${cmd.user_id}|${day}`)
    const out = await generateEmoji(admin, visitor, subject, style)
    if (!out.ok) {
      const error =
        out.reason === 'visitor'
          ? `You've used today's AI generations. They reset at midnight UTC, and uploads still work at <${SITE}|moji.locker>.`
          : out.error
      return await respond(cmd.response_url, ephemeral(`:warning: ${error}`))
    }

    const name = emojiName(subject)
    const png = await toSlackEmoji(out.png)
    const path = `slack/${out.cacheKey}.png`
    await admin.storage.from(BUCKET).upload(path, png, { contentType: 'image/png', upsert: true })
    const files = admin.storage.from(BUCKET)
    const [view, download] = await Promise.all([
      files.createSignedUrl(path, 60 * 60 * 24 * LINK_DAYS),
      files.createSignedUrl(path, 60 * 60 * 24 * LINK_DAYS, { download: `${name}.png` }),
    ])
    if (!view.data || !download.data) throw new Error(view.error?.message ?? download.error?.message)

    const editUrl = `${SITE}/?${new URLSearchParams({ prompt: subject, style })}`
    const addUrl = `https://${cmd.team_domain}.slack.com/customize/emoji`
    await respond(
      cmd.response_url,
      ephemeral(`Your emoji for "${esc(subject)}" is ready.`, [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${esc(subject)}*\nDownload it, then choose *Add to Slack* and upload it as \`:${name}:\`.`,
          },
          accessory: { type: 'image', image_url: view.data.signedUrl, alt_text: subject },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Download' },
              url: download.data.signedUrl,
              style: 'primary',
            },
            { type: 'button', text: { type: 'plain_text', text: 'Add to Slack' }, url: addUrl },
            { type: 'button', text: { type: 'plain_text', text: 'Edit in Moji Locker' }, url: editUrl },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `The download link works for ${LINK_DAYS} days. Some workspaces only let admins add emoji.`,
            },
          ],
        },
      ]),
    )
  } catch (e) {
    console.error('slack-command failed', e)
    await respond(cmd.response_url, ephemeral(':warning: Something went wrong making that emoji. Try again.'))
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const raw = await req.text()
  if (!(await verify(req, raw))) return new Response('Invalid signature', { status: 401 })

  const form = new URLSearchParams(raw)
  if (form.get('ssl_check')) return new Response('ok')
  const cmd: Command = {
    team_id: form.get('team_id') ?? '',
    team_domain: form.get('team_domain') ?? '',
    user_id: form.get('user_id') ?? '',
    text: form.get('text') ?? '',
    response_url: form.get('response_url') ?? '',
  }

  const { style, subject } = parseText(cmd.text)
  if (!subject || subject.toLowerCase() === 'help') return Response.json(ephemeral(HELP))
  if (subject.length > MAX_PROMPT) {
    return Response.json(ephemeral(`Keep the description under ${MAX_PROMPT} characters.`))
  }
  if (!cmd.response_url.startsWith('https://hooks.slack.com/')) {
    return new Response('Missing response_url', { status: 400 })
  }

  EdgeRuntime.waitUntil(make(cmd, style, subject))
  return Response.json(ephemeral(`:hourglass_flowing_sand: Making *${esc(subject)}*…`))
})
