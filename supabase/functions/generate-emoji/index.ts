// Supabase Edge Function: prompt -> emoji PNG.
//
// No image model is wired up yet. Pick a provider, store its key with
// `supabase secrets set IMAGE_API_KEY=...`, call it below, and return the PNG
// bytes with Content-Type: image/png. The web app handles scaling and export.
//
// Deploy: supabase functions deploy generate-emoji
// Enable in the web app: VITE_EMOJI_GENERATOR=supabase

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { prompt, style } = await req.json().catch(() => ({}))
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return Response.json({ error: 'prompt is required' }, { status: 400, headers: corsHeaders })
  }

  // Suggested prompt shape for most image models:
  //   `${prompt}, ${style} emoji icon, single centered subject, transparent background, bold outlines, no text`
  void style

  return Response.json(
    { error: 'No image generation provider is configured yet' },
    { status: 501, headers: corsHeaders },
  )
})
