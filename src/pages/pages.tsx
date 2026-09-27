import type { ReactNode } from 'react'
import { Mail } from '../components/InfoLinks'
import { SlackInstall } from '../components/SlackInstall'
import { FEEDBACK_URL, SUPPORT_EMAIL, SUPPORT_URL } from '../lib/site'
import { GUIDE_PAGES } from './guides'

const UPDATED = 'September 27, 2026'

export interface Page {
  /** Meta description, about 150 characters. */
  description: string
  heading: string
  lede: ReactNode
  body: ReactNode
}

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: 'What sizes do Slack and Discord want?',
    a: (
      <>
        Both want a square 128 × 128 image. Slack caps files at 128 KB and animated GIFs at 50 frames; Discord allows
        256 KB. Pick the app under Destination and Moji Locker handles the rest.
      </>
    ),
  },
  {
    q: 'My GIF says it was reduced. What changed?',
    a: (
      <>
        When an animation is over the app's file limit, export steps down the color count, then drops every other frame,
        then shrinks the canvas slightly, stopping as soon as the file fits. The export panel shows which steps it took.
      </>
    ),
  },
  {
    q: 'How do I add the emoji to Slack?',
    a: (
      <>
        In Slack, open the emoji picker, choose <strong>Add Emoji</strong>, upload the downloaded file and give it a
        name. Some workspaces only let admins add emoji. The <a href="/guides/slack-emoji-size">Slack guide</a> covers
        the details.
      </>
    ),
  },
  {
    q: 'How do I add the emoji to Discord?',
    a: (
      <>
        Open <strong>Server Settings → Emoji</strong> and choose <strong>Upload Emoji</strong>. You need the Manage
        Expressions permission. Sending animated emoji needs Nitro. The{' '}
        <a href="/guides/add-custom-emoji-to-discord">Discord guide</a> has the full steps.
      </>
    ),
  },
  {
    q: 'Can it remove the background from my photo?',
    a: (
      <>
        Yes. When an upload has a plain background, like a moon on black or a logo on white, Moji Locker cuts the
        subject out automatically. Switch Background between Remove and Keep, and raise Strength if some background is
        left behind. It runs in your browser, so the photo still never leaves your device.
      </>
    ),
  },
  {
    q: 'Can I combine motions?',
    a: <>Yes. Pick several under Motion, like Party and Bounce, and they play together. Static clears them.</>,
  },
  {
    q: 'Why did AI generation stop working?',
    a: (
      <>
        Each visitor gets a number of new AI images per day, and there's a daily cap across the whole site to keep it
        free. Repeating an earlier description doesn't count. Uploads always work, and limits reset at midnight UTC.
      </>
    ),
  },
  {
    q: 'Do you keep my images?',
    a: (
      <>
        Uploads never leave your browser. AI-generated images are cached so the same description returns instantly. See
        the <a href="/privacy">privacy policy</a> for details.
      </>
    ),
  },
  {
    q: 'Is it free?',
    a: <>Yes. Moji Locker may show ads in reserved spaces that stay out of the editor.</>,
  },
]

const BASE_PAGES: Record<string, Page> = {
  faq: {
    description:
      'Answers about emoji sizes, file limits, adding emoji to Slack and Discord, AI generation limits and privacy.',
    heading: 'Questions',
    lede: (
      <>
        Something missing? <a href={FEEDBACK_URL}>Send feedback</a> and we'll add it. Need help?{' '}
        <a href={SUPPORT_URL}>Contact support</a>.
      </>
    ),
    body: (
      <div className="faq">
        {FAQ.map(({ q, a }) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    ),
  },
  privacy: {
    description:
      'What Moji Locker collects: uploads stay in your browser, and AI descriptions are sent to OpenAI but not stored.',
    heading: 'Privacy',
    lede: <>Moji Locker is built to need as little of your data as possible. Last updated {UPDATED}.</>,
    body: (
      <>
        <h2>Images you upload</h2>
        <p>
          Uploaded images are resized, animated and exported entirely in your browser. They are never sent to our
          servers.
        </p>
        <h2>Your gallery</h2>
        <p>
          Emoji you choose to save to the Gallery are stored in your browser's own storage on this device. They are
          never uploaded, and clearing your browser data deletes them. Nothing is saved unless you press Save or turn on
          saving every download.
        </p>
        <h2>AI generation</h2>
        <p>
          When you generate an emoji, your description and chosen style are sent to our server and on to OpenAI, which
          creates the image. OpenAI handles that request under its API terms and does not use API data to train its
          models by default. We don't store your description. We store the generated image in a private cache, keyed by
          a one-way hash of the description and style, so the same request can be answered without generating it again.
        </p>
        <h2>Usage limits</h2>
        <p>
          To enforce daily limits we log each generation with a one-way hash of your IP address combined with the date.
          The raw IP address is never stored, and the hash changes every day, so it can't be used to follow you over
          time.
        </p>
        <h2>Slack app</h2>
        <p>
          When you use /moji in Slack, Slack sends us your description plus your workspace and user IDs. The description
          is handled like any other generation. The IDs are combined with the date and hashed to enforce daily limits;
          the raw IDs are not stored. The finished emoji is kept in our private storage so the download link works for 7
          days. The app can't read your messages or channels.
        </p>
        <h2>Analytics</h2>
        <p>
          We may use Cloudflare Web Analytics to count visits. It uses no cookies, collects no personal data and doesn't
          track you across sites.
        </p>
        <h2>Ads</h2>
        <p>
          If we show ads, the ad provider (such as Google AdSense) may use cookies to show and measure ads, and in some
          regions you'll be asked for consent first. You can manage Google's ad personalization at{' '}
          <a href="https://adssettings.google.com" target="_blank" rel="noreferrer">
            adssettings.google.com
          </a>
          .
        </p>
        <h2>Service providers</h2>
        <p>
          Netlify hosts the site, Supabase runs the generation server and cache, and OpenAI generates images. Each only
          receives what it needs to do that job.
        </p>
        <h2>Your choices</h2>
        <p>
          You can use Moji Locker without generating anything, in which case nothing you make leaves your device. For
          questions or deletion requests, email <Mail />.
        </p>
      </>
    ),
  },
  slack: {
    description:
      'Add Moji Locker to Slack and make custom emoji with /moji, sized for Slack and ready to upload to your workspace.',
    heading: 'Moji Locker for Slack',
    lede: <>Make a custom emoji without leaving Slack. Type /moji, describe it, and it's ready in seconds.</>,
    body: (
      <>
        <SlackInstall />
        <h2>How it works</h2>
        <ol>
          <li>
            In any channel or DM, type <code>/moji a taco wearing sunglasses</code>.
          </li>
          <li>
            Moji Locker replies with the finished 128 × 128 emoji. Only you see the reply, so it doesn't clutter the
            channel.
          </li>
          <li>
            Choose <strong>Download</strong>, then open Slack's emoji picker, choose <strong>Add Emoji</strong>, upload
            the file and give it a name.
          </li>
        </ol>
        <p>
          Start with a style to change the look: <code>/moji pixel a happy ghost</code>. The styles are flat, 3d, pixel,
          sticker and hand-drawn. For motion, text and your own images, choose <strong>Edit in Moji Locker</strong> to
          open the emoji here.
        </p>
        <h2>Why the last step is yours</h2>
        <p>
          Slack only lets apps add custom emoji on Enterprise plans, so you upload the file yourself. Some workspaces
          also limit who can add emoji; if the upload option is missing, ask a workspace admin.
        </p>
        <h2>Limits and privacy</h2>
        <p>
          The Slack app shares the website's daily AI limits, counted per Slack user. It receives your description and
          your workspace and user IDs, which it hashes to enforce limits. It can't read your messages or channels. See
          the <a href="/privacy">privacy policy</a> for details.
        </p>
        <h2>Support</h2>
        <p>
          Questions or problems with the Slack app? Email <a href={SUPPORT_URL}>{SUPPORT_EMAIL}</a>.
        </p>
      </>
    ),
  },
  terms: {
    description: 'The terms for using Moji Locker, the free custom emoji maker for Slack and Discord.',
    heading: 'Terms',
    lede: <>The short version: make fun emoji, don't make harmful ones. Last updated {UPDATED}.</>,
    body: (
      <>
        <h2>Using Moji Locker</h2>
        <p>
          Moji Locker is a free tool for making custom emoji. By using it you agree to these terms. If you don't agree,
          please don't use the site.
        </p>
        <h2>Your content</h2>
        <p>
          You keep whatever rights you have in images you upload and emoji you make. Only upload images you have the
          right to use, and don't use Moji Locker to make anything illegal, hateful, harassing, sexually explicit or
          infringing. AI generation also follows OpenAI's usage policies, and requests that break them are refused.
        </p>
        <h2>AI-generated images</h2>
        <p>
          AI output can be unexpected or resemble existing work. Check an image before you use it, especially somewhere
          public. We don't claim ownership of generated emoji.
        </p>
        <h2>Limits and availability</h2>
        <p>
          We limit AI generation per visitor and per day to keep the service free, and may change those limits. The site
          is provided as is, without warranties, and may change or go offline at any time.
        </p>
        <h2>Liability</h2>
        <p>
          To the extent the law allows, we aren't liable for any indirect or consequential loss arising from using Moji
          Locker. Slack and Discord are trademarks of their owners, and Moji Locker isn't affiliated with either.
        </p>
        <h2>Changes and contact</h2>
        <p>
          We may update these terms and will change the date above when we do. Questions go to <Mail />.
        </p>
      </>
    ),
  },
}

export const PAGES: Record<string, Page> = { ...BASE_PAGES, ...GUIDE_PAGES }

/** Served by Netlify as 404.html for any path without a file; not in the sitemap. */
export const NOT_FOUND = '404'
export const NOT_FOUND_PAGE: Page = {
  description: 'This page does not exist.',
  heading: 'Page not found',
  lede: (
    <>
      That link may be mistyped or out of date. Try the <a href="/">editor</a> or the <a href="/guides">guides</a>.
    </>
  ),
  body: null,
}

export function getPage(key: string): Page {
  return key === NOT_FOUND ? NOT_FOUND_PAGE : PAGES[key]
}

/**
 * Page key for a pathname, e.g. "/guides/slack-emoji-size/" -> "guides/slack-emoji-size",
 * null for the editor, or NOT_FOUND for anything else.
 */
export function pageFor(pathname: string): string | null {
  const key = pathname.replace(/\/+$/, '').slice(1)
  if (key === '' || key === 'index.html') return null
  return Object.hasOwn(PAGES, key) ? key : NOT_FOUND
}
