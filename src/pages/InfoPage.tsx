import type { ReactNode } from 'react'
import { SiteFooter, SiteHeader } from '../components/SiteChrome'
import { CONTACT_EMAIL, FEEDBACK_URL, type Route } from '../lib/site'

const UPDATED = 'September 26, 2026'

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>

interface Page {
  title: string
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
        name. Some workspaces only let admins add emoji.
      </>
    ),
  },
  {
    q: 'How do I add the emoji to Discord?',
    a: (
      <>
        Open <strong>Server Settings → Emoji</strong> and choose <strong>Upload Emoji</strong>. You need the Manage
        Expressions permission. Animated emoji work in any server, but using them outside it needs Nitro.
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

const PAGES: Record<Exclude<Route, 'app'>, Page> = {
  faq: {
    title: 'Questions',
    lede: (
      <>
        Something missing? <a href={FEEDBACK_URL}>Send feedback</a> and we'll add it.
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
    title: 'Privacy',
    lede: <>Moji Locker is built to need as little of your data as possible. Last updated {UPDATED}.</>,
    body: (
      <>
        <h2>Images you upload</h2>
        <p>
          Uploaded images are resized, animated and exported entirely in your browser. They are never sent to our
          servers.
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
  terms: {
    title: 'Terms',
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

export function InfoPage({ route }: { route: Exclude<Route, 'app'> }) {
  const page = PAGES[route]
  return (
    <div className="shell">
      <SiteHeader tagline={false} />
      <main className="info">
        <a className="info-back" href="/">
          ← Back to the editor
        </a>
        <h1>{page.title}</h1>
        <p className="info-lede">{page.lede}</p>
        {page.body}
      </main>
      <SiteFooter />
    </div>
  )
}
