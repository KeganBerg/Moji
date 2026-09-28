/**
 * Upload requirements for each target app.
 *
 * Slack (slack.com/help/articles/206870177): JPG, PNG or GIF; square images
 * under 128 KB work best; animated GIFs can have up to 50 frames.
 * Discord (support.discord.com/hc/en-us/articles/360036479811): JPEG, PNG,
 * GIF or WEBP under 256 KB; names are 2+ chars of letters, numbers and
 * underscores (32 max in the upload form). Both apps render emoji at 128 px or
 * smaller, so 128 × 128 is the target for both.
 * GIPHY stickers (support.giphy.com/hc/en-us/articles/360019683472): an
 * animated GIF that loops forever with a transparent background (20%+ of the
 * first frame clear), under 100 MB; static images are rejected. Instagram and
 * TikTok search GIPHY stickers from verified channels.
 * Instagram has no sticker upload: a transparent PNG pasted into a Story (or
 * turned into a Cutout) becomes a sticker, and pasted stickers don't animate,
 * so that preset always exports a large still PNG.
 */
export type PlatformId = 'slack' | 'discord' | 'giphy' | 'instagram' | 'custom'

export interface Platform {
  id: PlatformId
  label: string
  size: number
  maxBytes: number
  maxFrames: number
  /** Small sizes the app actually displays emoji at, used for the chat preview. */
  displaySizes: number[]
  notes: string[]
  /** Always exported as a still PNG, whatever motion is picked. */
  staticOnly?: boolean
  /** Needs motion and a transparent background to be accepted. */
  stickerRules?: boolean
}

export const PLATFORMS: Record<PlatformId, Platform> = {
  slack: {
    id: 'slack',
    label: 'Slack',
    size: 128,
    maxBytes: 128 * 1024,
    maxFrames: 50,
    displaySizes: [22, 32],
    notes: ['128 × 128 px', 'Under 128 KB', 'PNG, JPG or GIF', 'GIFs up to 50 frames'],
  },
  discord: {
    id: 'discord',
    label: 'Discord',
    size: 128,
    maxBytes: 256 * 1024,
    maxFrames: 200,
    displaySizes: [22, 48],
    notes: ['128 × 128 px', 'Under 256 KB', 'PNG, JPG, GIF or WEBP', 'Sending animated emoji needs Nitro'],
  },
  giphy: {
    id: 'giphy',
    label: 'GIPHY',
    size: 480,
    maxBytes: 8 * 1024 * 1024,
    maxFrames: 200,
    displaySizes: [48, 96],
    notes: ['480 × 480 px', 'Animated GIF', 'Transparent background'],
    stickerRules: true,
  },
  instagram: {
    id: 'instagram',
    label: 'Instagram',
    size: 1024,
    maxBytes: 8 * 1024 * 1024,
    maxFrames: 1,
    displaySizes: [48, 96],
    notes: ['1024 × 1024 px', 'Transparent PNG'],
    staticOnly: true,
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    size: 128,
    maxBytes: 256 * 1024,
    maxFrames: 200,
    displaySizes: [24, 48],
    notes: ['Pick your own size and file limit'],
  },
}

/** Turns free text into a name the platform will accept. */
export function sanitizeName(raw: string, platform: PlatformId): string {
  let name = raw.trim().toLowerCase().replace(/\s+/g, '_')
  if (platform === 'discord') {
    name = name.replace(/[^a-z0-9_]/g, '').slice(0, 32)
  } else {
    name = name.replace(/[^a-z0-9_-]/g, '').slice(0, 100)
  }
  name = name.replace(/^[-_]+|[-_]+$/g, '')
  if (name.length < 2) name = name ? `${name}_emoji` : 'emoji'
  return name
}

export function formatBytes(bytes: number): string {
  // A no-break space keeps the number and its unit on one line.
  if (bytes < 1024) return `${bytes}\u00a0B`
  if (bytes >= 1024 * 1024) return `${+(bytes / 1024 / 1024).toFixed(1)}\u00a0MB`
  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)}\u00a0KB`
}
