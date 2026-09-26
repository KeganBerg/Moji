import type { ReactNode } from 'react'
import { AdSlot } from '../components/AdSlot'
import { Cta } from '../components/InfoLinks'
import type { Page } from './pages'

interface Guide {
  slug: string
  title: string
  description: string
  heading: string
  lede: ReactNode
  body: ReactNode
}

export const GUIDES: Guide[] = [
  {
    slug: 'slack-emoji-size',
    title: 'Slack emoji size and limits · Moji Locker',
    description:
      'The exact size, file limit, formats and frame count Slack accepts for custom emoji, and how to add one to your workspace.',
    heading: 'Slack emoji size and limits',
    lede: (
      <>Everything Slack checks when you upload a custom emoji, and how to get an image that passes the first time.</>
    ),
    body: (
      <>
        <h2>The short answer</h2>
        <table className="info-table">
          <tbody>
            <tr>
              <th>Size</th>
              <td>Square, 128 × 128 px works best</td>
            </tr>
            <tr>
              <th>File size</th>
              <td>Under 128 KB</td>
            </tr>
            <tr>
              <th>Formats</th>
              <td>PNG, JPG or GIF</td>
            </tr>
            <tr>
              <th>Animation</th>
              <td>GIF, up to 50 frames</td>
            </tr>
            <tr>
              <th>Background</th>
              <td>Transparent is best</td>
            </tr>
          </tbody>
        </table>
        <p>
          Slack shows emoji at about 22 px in messages, a little larger when a message is only emoji, so fine detail
          disappears. Bold shapes, thick outlines and a subject that fills the square read far better than a photo with
          lots of background.
        </p>
        <AdSlot placement="article" />
        <h2>Why uploads get rejected</h2>
        <p>
          Almost every failed upload is a file over 128 KB. Still images rarely hit that at 128 px, but animated GIFs
          do, because every extra frame and color adds weight. The fixes, in the order that costs the least quality, are
          fewer colors, fewer frames, then a slightly smaller canvas. Moji Locker's export does exactly that and stops
          as soon as the file fits.
        </p>
        <p>
          Other causes: a GIF with more than 50 frames, a file type Slack doesn't take (WEBP and HEIC photos from phones
          are common), or a name that's already used in the workspace.
        </p>
        <h2>Naming your emoji</h2>
        <p>
          Names use lowercase letters, numbers, hyphens and underscores, and each one must be unique in the workspace.
          You type it between colons, like <code>:party_parrot:</code>, so short and obvious names get used the most.
        </p>
        <h2>How to add it to Slack</h2>
        <ol>
          <li>In any message field, open the emoji menu with the smiley face icon.</li>
          <li>
            Choose <strong>Add Emoji</strong>, then <strong>Upload Image</strong>, and pick your file.
          </li>
          <li>Give it a name and select Save.</li>
        </ol>
        <p>
          Members can add emoji by default, but workspace owners can limit it to admins. If you don't see Add Emoji, ask
          an admin.
        </p>
        <Cta>Make a Slack emoji that fits →</Cta>
      </>
    ),
  },
  {
    slug: 'add-custom-emoji-to-discord',
    title: 'How to add custom emoji to Discord · Moji Locker',
    description:
      'Step-by-step: upload custom and animated emoji to a Discord server, plus the size limit, name rules and permissions you need.',
    heading: 'How to add custom emoji to Discord',
    lede: <>Upload a custom emoji to your server in under a minute, and avoid the errors that stop most uploads.</>,
    body: (
      <>
        <h2>What Discord accepts</h2>
        <table className="info-table">
          <tbody>
            <tr>
              <th>File size</th>
              <td>Under 256 KB</td>
            </tr>
            <tr>
              <th>Formats</th>
              <td>PNG, JPG, GIF or WEBP</td>
            </tr>
            <tr>
              <th>Size</th>
              <td>Square, 128 × 128 px recommended</td>
            </tr>
            <tr>
              <th>Names</th>
              <td>At least 2 characters: letters, numbers and underscores</td>
            </tr>
          </tbody>
        </table>
        <p>
          Discord displays emoji at 22 px inline and 48 px when a message is only emoji, so a 128 px square gives it a
          sharp source for both. Transparent backgrounds look right in both light and dark mode.
        </p>
        <AdSlot placement="article" />
        <h2>Upload from Server Settings</h2>
        <ol>
          <li>Open the menu next to your server's name and choose Server Settings.</li>
          <li>
            Open the <strong>Emoji</strong> tab and select <strong>Upload Emoji</strong>.
          </li>
          <li>Pick your file, then rename it if you like. The name is what people type between colons.</li>
        </ol>
        <p>
          You need the Create Expressions or Manage Expressions permission. Server owners and admins have it; everyone
          else needs a role that grants it.
        </p>
        <h2>Upload from the emoji picker</h2>
        <p>
          On desktop and in the browser you can also open the emoji picker, choose <strong>Add Emoji</strong>, pick a
          file, adjust the crop and name, choose the server and upload.
        </p>
        <h2>Animated emoji and Nitro</h2>
        <p>
          Any server can hold animated GIF emoji, but they use separate slots from static ones, and sending animated
          emoji is a Nitro perk. So is using a server's custom emoji in other servers. Server boosts add more emoji
          slots.
        </p>
        <h2>Common errors</h2>
        <p>
          A file size error means the GIF has too many frames or colors, so shrink it before uploading rather than
          relying on Discord's cropper. If the Upload button is missing, you don't have the permission above. If uploads
          stop working, the server has run out of slots for that type.
        </p>
        <Cta>Make a Discord emoji that fits →</Cta>
      </>
    ),
  },
  {
    slug: 'animated-slack-emoji',
    title: "Animated emoji that fit Slack's 128 KB · Moji Locker",
    description:
      "How to make an animated GIF emoji small enough for Slack's 128 KB limit without making it look choppy or blotchy.",
    heading: "Animated emoji that fit Slack's 128 KB",
    lede: (
      <>Animated GIFs are the easiest way to blow past Slack's file limit. Here's how to keep them small and smooth.</>
    ),
    body: (
      <>
        <h2>Where the kilobytes go</h2>
        <p>
          A GIF stores every frame separately, each with up to 256 colors. File size grows with frames × pixels × how
          much changes between frames. A 128 px emoji with 30 frames of full-color gradient can easily pass 300 KB,
          while the same motion in flat colors might be 40 KB.
        </p>
        <AdSlot placement="article" />
        <h2>Trim in this order</h2>
        <ol>
          <li>
            <strong>Fewer colors.</strong> Dropping from 256 to 128 or 64 colors is barely visible on flat or cartoon
            art and often halves the file.
          </li>
          <li>
            <strong>Fewer frames.</strong> Emoji loop constantly, so 12 to 24 frames per loop looks smooth. Keeping
            every other frame and doubling each frame's delay keeps the timing the same.
          </li>
          <li>
            <strong>A slightly smaller canvas.</strong> Going from 128 to 112 px cuts pixels by about a quarter, and at
            chat size nobody can tell.
          </li>
        </ol>
        <p>
          Moji Locker's export runs this exact ladder automatically, checks the result against the limit after each step
          and tells you which steps it needed.
        </p>
        <h2>Design for small files</h2>
        <p>
          Motion that moves the whole image, like a spin or bounce, changes every pixel each frame and costs the most.
          Subtle motion such as a pulse compresses better. Flat colors beat gradients and photos, and a transparent
          background is cheaper than a busy one. Keep the loop under two seconds.
        </p>
        <h2>Also mind the frame count</h2>
        <p>
          Slack also caps GIF emoji at 50 frames. Combining several motions into one longer loop can cross it, so the
          frame-dropping step above helps here too.
        </p>
        <Cta>Make an animated emoji →</Cta>
      </>
    ),
  },
]

const GUIDES_INDEX: Page = {
  title: 'Custom emoji guides · Moji Locker',
  description: 'Guides to custom emoji sizes, file limits and uploading for Slack and Discord.',
  heading: 'Guides',
  lede: <>Short, practical answers to the questions people ask most about custom emoji.</>,
  body: (
    <ul className="guide-list">
      {GUIDES.map((g) => (
        <li key={g.slug}>
          <a href={`/guides/${g.slug}`}>
            <strong>{g.heading}</strong>
            <span>{g.description}</span>
          </a>
        </li>
      ))}
    </ul>
  ),
}

export const GUIDE_PAGES: Record<string, Page> = {
  guides: GUIDES_INDEX,
  ...Object.fromEntries(GUIDES.map(({ slug, ...page }) => [`guides/${slug}`, page])),
}
