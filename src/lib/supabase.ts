import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Null until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set, so the app runs fully client-side without them. */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null

export const EMOJI_BUCKET = 'emojis'

/** Uploads a finished emoji to the public bucket and returns its public URL. */
export async function saveEmoji(blob: Blob, filename: string): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured')
  const path = `public/${crypto.randomUUID()}/${filename}`
  const { error } = await supabase.storage.from(EMOJI_BUCKET).upload(path, blob, {
    contentType: blob.type,
    upsert: false,
  })
  if (error) throw error
  return supabase.storage.from(EMOJI_BUCKET).getPublicUrl(path).data.publicUrl
}
