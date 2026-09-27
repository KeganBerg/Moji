// Writes static HTML for the FAQ, legal and guide pages so search engines and
// ad reviewers see real content without running JavaScript, plus a sitemap.
// Runs after `vite build` and `vite build --ssr src/prerender.tsx`.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SITE = 'https://moji.locker'
const dist = new URL('../dist/', import.meta.url).pathname
const ssr = new URL('../dist-ssr/prerender.js', import.meta.url)
const { pages, render, NOT_FOUND } = await import(ssr.href)
const template = await readFile(join(dist, 'index.html'), 'utf8')

const escape = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function fill(html, { description, url, body }) {
  const out = html
    .replace(/(<meta name="description" content=")[^"]*/, `$1${escape(description)}`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${url}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${url}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${escape(description)}`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
  if (!out.includes(body)) throw new Error(`Template is missing the root element for ${url}`)
  return out
}

for (const key of pages) {
  const { description, html } = render(key)
  const url = `${SITE}/${key}`
  await mkdir(join(dist, key), { recursive: true })
  await writeFile(join(dist, key, 'index.html'), fill(template, { description, url, body: html }))
}

// Netlify serves 404.html with a 404 status for any path that has no file.
{
  const { description, html } = render(NOT_FOUND)
  const page = fill(template, { description, url: SITE, body: html }).replace(
    '</head>',
    '  <meta name="robots" content="noindex" />\n  </head>',
  )
  if (!page.includes('noindex')) throw new Error('404 page is missing noindex')
  await writeFile(join(dist, '404.html'), page)
}

const urls = ['', ...pages].map((p) => `  <url><loc>${SITE}/${p}</loc></url>`).join('\n')
await writeFile(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
)
await rm(new URL('../dist-ssr/', import.meta.url), { recursive: true, force: true })
console.log(`prerendered ${pages.length} pages`)
