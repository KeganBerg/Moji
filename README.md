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

The browser calls the `generate-emoji` Edge Function (the shared core is `supabase/functions/_shared/generate.ts`), which holds the OpenAI key and talks to the model. It uses **GPT Image 2 at low quality** (about $0.005 per image) with a native transparent background, falling back to GPT Image 1 Mini if transparency is refused. Emoji end up at 128 px, so higher quality tiers cost 10x more for detail nobody can see.

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

## Slack app

`/moji a taco wearing sunglasses` in any Slack channel makes the emoji with the same pipeline, cache and daily limits as the website (each Slack user counts as one visitor). A leading style word changes the look: `/moji pixel a happy ghost`. The reply is visible only to the person who asked and has the 128 × 128 PNG, a Download button, instructions to add it from the emoji picker's Add Emoji, and an Edit in Moji Locker link that reopens the same prompt on the site (a free cache hit).

Slack doesn't let apps add custom emoji to a workspace (`admin.emoji.add` is Enterprise Grid only), so people upload the downloaded file themselves.

- `supabase/functions/slack-command` answers the slash command. It verifies Slack's request signature, acknowledges within Slack's 3 second limit, then generates in the background and posts to the command's `response_url`. No bot token is used or stored.
- `supabase/functions/slack-oauth` completes installs from the Add to Slack button on `/slack`.
- `slack/manifest.json` creates the Slack app.

Setup:

1. At [api.slack.com/apps](https://api.slack.com/apps), choose **Create New App → From a manifest**, pick a workspace and paste `slack/manifest.json`.
2. From **Basic Information**, add `SLACK_SIGNING_SECRET`, `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` to Supabase → Edge Functions → Secrets.
3. Deploy: `supabase functions deploy slack-command --no-verify-jwt` and `supabase functions deploy slack-oauth --no-verify-jwt`.
4. **Install App** adds it to your own workspace. To let anyone install it from moji.locker/slack, turn on **Manage Distribution → Activate Public Distribution** and set `SLACK_CLIENT_ID` in `src/lib/site.ts`, which shows the Add to Slack button.

## Languages

The editor is available in 15 languages, picked from the globe button next to Gallery. English (`src/locales/en.ts`) is the source and ships with the page; the other languages load only when someone picks them, and the choice is remembered in the browser. Arabic switches the page to right to left. Guides, the FAQ and the legal pages stay in English.

To change wording, edit `en.ts` and the same key in every other file in `src/locales/`. `npm test` checks that every language has every key, keeps each `{placeholder}`, and leaves Moji Locker, moji.locker, /moji, Slack, Discord and file formats untranslated.

## Ads

AdSense (publisher `ca-pub-8080930241819022`) places ads with Auto ads: the loader script is in `index.html` and `public/ads.txt` authorizes the account. Placement is managed in AdSense, not in the code. If Auto ads ever cover the editor, exclude that area in AdSense's Auto ads settings.

## Guides, support pages and analytics

`/guides`, `/faq`, `/privacy` and `/terms` are defined in `src/pages/pages.tsx` and `src/pages/guides.tsx`. The build prerenders each one to static HTML with its own title and description (`scripts/prerender.mjs`) and writes `sitemap.xml`, so search engines and ad reviewers see the content without running JavaScript. Add a guide to `GUIDES` and it gets a page, a sitemap entry and a spot on the guides index.

The contact address is `CONTACT_EMAIL` in `src/lib/site.ts`. Set `VITE_CF_ANALYTICS_TOKEN` in Netlify's environment variables to turn on Cloudflare Web Analytics (cookieless); without it nothing loads.

## Code map

- `src/lib/platforms.ts` platform presets and name rules
- `src/lib/animations.ts` preset animations as per-frame transforms
- `src/lib/render.ts` image loading, trimming, frame drawing
- `src/lib/export.ts` PNG/GIF export with the size-fitting ladder
- `src/lib/generate.ts` generation client (Edge Function or offline placeholder)
- `supabase/functions/generate-emoji` generation backend for the site
- `supabase/functions/slack-command`, `slack-oauth` the Slack app
