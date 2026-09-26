# Moji

A quick, clean one-stop shop for custom emoji. Upload an image (or describe one), pick where it's going, add a preset animation, and download a file that already meets the app's upload rules.

## What it does

- **Start from an upload or a prompt.** Drag and drop, paste, or pick a file. Transparent edges are trimmed so the emoji fills the square. Prompt-to-emoji is wired through a generator interface; see [AI generation](#ai-generation).
- **Auto-scale per app.** Presets for Slack and Discord, plus a custom size and file limit for anything else.
- **Preset animations.** Spin, bounce, shake, pulse, wiggle, party (hue cycle) and float, exported as looping transparent GIFs.
- **Always under the limit.** Export steps down colors, then frame count, then canvas size until the file fits, and shows what it did.
- **See it in context.** Live previews at real chat sizes on light and dark backgrounds.

Everything runs in the browser. Nothing is uploaded unless Supabase is configured and the user asks for a share link.

## Platform requirements

|           | Slack                                | Discord                                                   |
| --------- | ------------------------------------ | --------------------------------------------------------- |
| Size      | 128 × 128 px (square)                | 128 × 128 px (shown at up to 48 px)                       |
| Max file  | 128 KB                               | 256 KB                                                    |
| Formats   | PNG, JPG, GIF                        | PNG, JPG, GIF, WEBP                                       |
| Animation | GIF, up to 50 frames                 | GIF; using animated emoji outside your server needs Nitro |
| Names     | lowercase letters, numbers, `-`, `_` | 2 to 32 letters, numbers, `_`                             |

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

**Netlify** hosts the web app. `netlify.toml` sets the build (`npm run build` → `dist`) and the SPA fallback. Connect the repo in Netlify and add the env vars below under Site configuration → Environment variables.

**Supabase** is the backend and is optional for v1:

| Variable                 | Purpose                               |
| ------------------------ | ------------------------------------- |
| `VITE_SUPABASE_URL`      | Project URL                           |
| `VITE_SUPABASE_ANON_KEY` | Public anon key (safe in the browser) |
| `VITE_EMOJI_GENERATOR`   | `placeholder` (default) or `supabase` |

Copy `.env.example` to `.env.local` for local development. Never commit keys.

- `supabase/migrations/…_emoji_bucket.sql` creates the public `emojis` storage bucket used by **Get a share link** (`supabase db push`).
- `supabase/functions/generate-emoji` is the Edge Function for prompt-to-emoji (`supabase functions deploy generate-emoji`).

## AI generation

No image model is connected yet. `src/lib/generate.ts` defines an `EmojiGenerator` interface; today it uses `PlaceholderGenerator`, which draws the prompt as a badge so the rest of the flow works end to end. To go live, pick a provider, call it from `supabase/functions/generate-emoji/index.ts` with its key stored via `supabase secrets set`, and set `VITE_EMOJI_GENERATOR=supabase`.

## Code map

- `src/lib/platforms.ts` platform presets and name rules
- `src/lib/animations.ts` preset animations as per-frame transforms
- `src/lib/render.ts` image loading, trimming, frame drawing
- `src/lib/export.ts` PNG/GIF export with the size-fitting ladder
- `src/lib/generate.ts` prompt-to-emoji interface
- `src/lib/supabase.ts` optional Supabase client and share upload
