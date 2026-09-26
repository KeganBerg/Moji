# Moji Locker

A quick, clean one-stop shop for custom emoji. Upload an image (or describe one), pick where it's going, add a preset animation, and download a file that already meets the app's upload rules.

## What it does

- **Start from an upload or a prompt.** Drag and drop, paste, or pick a file, or describe an emoji and pick a style. Transparent edges are trimmed so the emoji fills the square.
- **Auto-scale per app.** Presets for Slack and Discord, plus a custom size and file limit for anything else.
- **Preset animations.** Spin, bounce, shake, pulse, wiggle, party (hue cycle) and float, exported as looping transparent GIFs.
- **Always under the limit.** Export steps down colors, then frame count, then canvas size until the file fits, and shows what it did.
- **See it in context.** Live previews at real chat sizes on light and dark backgrounds.

Uploads never leave the browser. Only generation descriptions go to the server.

## Platform requirements

|           | Slack                                | Discord                                 |
| --------- | ------------------------------------ | --------------------------------------- |
| Size      | 128 × 128 px (square)                | 128 × 128 px (shown at up to 48 px)     |
| Max file  | 128 KB                               | 256 KB                                  |
| Formats   | PNG, JPG, GIF                        | PNG, JPG, GIF, WEBP                     |
| Animation | GIF, up to 50 frames                 | GIF; sending animated emoji needs Nitro |
| Names     | lowercase letters, numbers, `-`, `_` | 2 to 32 letters, numbers, `_`           |

Sources: [Slack help](https://slack.com/help/articles/206870177-Add-custom-emoji-and-aliases-to-your-workspace), [Discord support](https://support.discord.com/hc/en-us/articles/360036479811-Custom-Emojis). Presets live in `src/lib/platforms.ts`.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (vitest)
npm run lint
npm run build
```

## Deploy

**Netlify** hosts the web app. `netlify.toml` sets the build (`npm run build` → `dist`) and the SPA fallback. Add `moji.locker` as the production domain under Domain management.

**Supabase** (project "Moji") runs AI generation. `.env.production` holds the project URL and publishable key; both are public by design, so production builds need no Netlify env vars. For local development copy `.env.example` to `.env.local`.

## AI generation

The browser calls the `generate-emoji` Edge Function, which holds the OpenAI key and talks to the model. It uses **GPT Image 2 at low quality** (about $0.005 per image) with a native transparent background, falling back to GPT Image 1 Mini if transparency is refused. Emoji end up at 128 px, so higher quality tiers cost 10x more for detail nobody can see.

Cost controls in the function:

- **Cache**: the same description and style return the stored image for free.
- **Per-visitor limit**: 15 new images per visitor per day (visitors are a hashed IP plus date; raw IPs are never stored).
- **Global cap**: 300 paid images per day across everyone, so the worst case is about $1.50/day.
- **Origin check**: only moji.locker, the mojilocker Netlify site and its deploy previews, and localhost can call it.

The prompt template pins the model to one centered subject, no scenery and no invented text, which is what keeps it from adding things you didn't ask for.

Setup and tuning, in Supabase → Edge Functions → Secrets:

| Secret                    | Default                |
| ------------------------- | ---------------------- |
| `OPENAI_API_KEY`          | required               |
| `IMAGE_MODEL`             | `gpt-image-2`          |
| `IMAGE_QUALITY`           | `low`                  |
| `DAILY_LIMIT_PER_VISITOR` | `15`                   |
| `DAILY_LIMIT_GLOBAL`      | `300`                  |
| `ALLOWED_ORIGINS`         | moji.locker, localhost |

`supabase/migrations/` creates the private cache bucket and the `generation_log` table; `supabase functions deploy generate-emoji --no-verify-jwt` deploys the function.

## Ads

AdSense is set up for publisher `ca-pub-8080930241819022`: the loader script is in `index.html` and `public/ads.txt` authorizes the account. Ads go in 300×250 slots (`src/components/AdSlot.tsx`):

- **Editor**: under the settings panel on desktop, and after the Download button on phones, so it only appears once you've finished editing.
- **Guides**: one slot inside each guide.

Slots stay empty until an ad unit exists. Create a 300×250 display unit in AdSense and set its id as `VITE_ADSENSE_SLOT` in Netlify's environment variables, then redeploy. On desktop the editor slot always keeps its space so an ad loading never moves the controls; on phones and in guides an unused slot takes no space. `VITE_AD_SLOTS=show` draws placeholders for layout work. Keep AdSense Auto ads off, or at least turn off its anchor and vignette formats, so Google doesn't place extra ads over the editor.

## Guides, support pages and analytics

`/guides`, `/faq`, `/privacy` and `/terms` are defined in `src/pages/pages.tsx` and `src/pages/guides.tsx`. The build prerenders each one to static HTML with its own title and description (`scripts/prerender.mjs`) and writes `sitemap.xml`, so search engines and ad reviewers see the content without running JavaScript. Add a guide to `GUIDES` and it gets a page, a sitemap entry and a spot on the guides index.

The contact address is `CONTACT_EMAIL` in `src/lib/site.ts`. Set `VITE_CF_ANALYTICS_TOKEN` in Netlify's environment variables to turn on Cloudflare Web Analytics (cookieless); without it nothing loads.

## Code map

- `src/lib/platforms.ts` platform presets and name rules
- `src/lib/animations.ts` preset animations as per-frame transforms
- `src/lib/render.ts` image loading, trimming, frame drawing
- `src/lib/export.ts` PNG/GIF export with the size-fitting ladder
- `src/lib/generate.ts` generation client (Edge Function or offline placeholder)
- `supabase/functions/generate-emoji` generation backend
