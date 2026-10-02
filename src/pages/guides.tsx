import type { ReactNode } from 'react'
import { Cta } from '../components/InfoLinks'
import type { Page } from './pages'

interface Guide {
  slug: string
  description: string
  heading: string
  lede: ReactNode
  body: ReactNode
}

export const GUIDES: Guide[] = [
  {
    slug: 'slack-emoji-size',
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
  {
    slug: 'halloween-emoji',
    description:
      'Halloween emoji ideas for Slack and Discord, with prompts you can paste, the animations that suit each one, and how to keep them small enough to upload.',
    heading: 'Halloween emoji for Slack and Discord',
    lede: (
      <>
        A spooky set of custom emoji for your team or server, with prompts ready to paste and the motion that suits each
        one.
      </>
    ),
    body: (
      <>
        <h2>Ideas and prompts</h2>
        <p>
          Type any of these into Moji Locker's describe box, or upload your own picture. Short prompts with one clear
          subject turn out best at emoji size.
        </p>
        <table className="info-table">
          <tbody>
            <tr>
              <th>Friendly ghost</th>
              <td>"cute white ghost with a big smile, thick outline" with Float</td>
            </tr>
            <tr>
              <th>Jack-o'-lantern</th>
              <td>"glowing carved pumpkin with a toothy grin" with Heartbeat</td>
            </tr>
            <tr>
              <th>Black cat</th>
              <td>"black cat arching its back, yellow eyes" with Shake</td>
            </tr>
            <tr>
              <th>Skull</th>
              <td>"cartoon skull laughing" with Jiggle</td>
            </tr>
            <tr>
              <th>Bat</th>
              <td>"small purple bat with open wings" with Bounce</td>
            </tr>
            <tr>
              <th>Candy</th>
              <td>"wrapped orange candy" with Spin</td>
            </tr>
            <tr>
              <th>Witch hat</th>
              <td>"pointy witch hat with a buckle" with Swing</td>
            </tr>
          </tbody>
        </table>
        <h2>Make your own mascot spooky</h2>
        <p>
          The emoji people use most are the ones about your group. Upload your team's logo, the server mascot or a pet
          photo, then describe a costume version too, like "our green frog mascot dressed as a vampire". Stack Party on
          top of any motion for a color-cycling version that works as a celebration reaction.
        </p>
        <h2>For the cursed ones</h2>
        <p>
          Turn the Chaos slider up to deep-fry an emoji. Around 30 gives a warped, slightly wrong look that suits
          zombies and haunted versions of your mascot. At 100 it's a full meme reaction.
        </p>
        <h2>Keep them uploadable</h2>
        <p>
          Dark Halloween art with glows and gradients makes heavier GIFs than flat colors. Moji Locker's export trims
          colors and frames until the file fits Slack's 128 KB or Discord's 256 KB, but a transparent background and a
          single motion keep more detail. The <a href="/guides/animated-slack-emoji">animated emoji guide</a> explains
          the tradeoffs.
        </p>
        <p>
          Name the set so it's easy to find in the picker, like <code>:spooky_ghost:</code>,{' '}
          <code>:spooky_pumpkin:</code> and <code>:spooky_cat:</code>. Typing <code>:spooky</code> then shows them all.
        </p>
        <Cta>Make a Halloween emoji →</Cta>
      </>
    ),
  },
  {
    slug: 'deep-fried-emoji-maker',
    description:
      'Make deep-fried and cursed meme emoji for Slack and Discord with the Chaos slider, which values to use, and how to keep the GIF small enough to upload.',
    heading: 'Deep-fried emoji maker',
    lede: <>Turn any image into a warped, crunchy meme emoji with one slider, and still get a file that uploads.</>,
    body: (
      <>
        <h2>What the Chaos slider does</h2>
        <p>
          Chaos lives in the <strong>Tune</strong> section and runs from 0 to 100. As it goes up, it layers on the
          classic deep-fried look:
        </p>
        <ul>
          <li>Fisheye warp and bulging eyes</li>
          <li>A wobble that makes the image feel unstable</li>
          <li>Fried, oversaturated colors</li>
          <li>Block smear, like a badly compressed JPEG</li>
          <li>Grain and heavy oversharpening</li>
        </ul>
        <h2>Pick a level</h2>
        <table className="info-table">
          <tbody>
            <tr>
              <th>Around 30</th>
              <td>Slightly wrong. Still recognizable, just a bit off.</td>
            </tr>
            <tr>
              <th>60 to 100</th>
              <td>Full meme. Loud, crunchy and barely holding together.</td>
            </tr>
          </tbody>
        </table>
        <p>
          The low end is often funnier, because people have to look twice. Try a version at 30 and one at 100 and keep
          whichever gets the better reaction.
        </p>
        <h2>Add motion</h2>
        <ol>
          <li>Upload an image or describe one in the describe box.</li>
          <li>Set Chaos in the Tune section.</li>
          <li>
            Pick <strong>Shake</strong> for panic energy or <strong>Party</strong> for a color-cycling fried look. You
            can stack both.
          </li>
          <li>Choose Slack or Discord and export.</li>
        </ol>
        <h2>Keep the file small</h2>
        <p>
          Grain and noise change pixels in every frame, so deep-fried GIFs get bigger than clean ones. Moji Locker's
          export trims colors first, then frames, until the file fits Slack's 128 KB or Discord's 256 KB. If it has to
          cut too much, lower Chaos a little or drop to a single motion. The{' '}
          <a href="/guides/animated-slack-emoji">animated emoji guide</a> explains the tradeoffs.
        </p>
        <Cta>Deep-fry an emoji →</Cta>
      </>
    ),
  },
  {
    slug: 'party-parrot-emoji-maker',
    description:
      'Make a party parrot style color-cycling emoji from any image for Slack or Discord, and stack it with other motions like Bounce or Spin.',
    heading: 'Party parrot style emoji maker',
    lede: <>Give any image the flashing, color-cycling party look, ready to upload to Slack or Discord.</>,
    body: (
      <>
        <h2>The party look</h2>
        <p>
          The party parrot style is simple: a subject that cycles through bright colors on a loop. It works as a
          celebration reaction on almost anything, from your team mascot to a coffee cup.
        </p>
        <h2>Make one</h2>
        <ol>
          <li>Upload an image or type a subject into the describe box, like "cartoon cat with a big grin".</li>
          <li>
            Pick the <strong>Party</strong> motion. It cycles the colors of your image.
          </li>
          <li>Choose Slack or Discord and export.</li>
        </ol>
        <h2>Stack motions</h2>
        <p>Motions can be combined, so Party can ride on top of another one:</p>
        <table className="info-table">
          <tbody>
            <tr>
              <th>Party + Bounce</th>
              <td>Hopping and flashing. The classic celebration.</td>
            </tr>
            <tr>
              <th>Party + Spin</th>
              <td>Spinning disco energy.</td>
            </tr>
            <tr>
              <th>Party + Wiggle</th>
              <td>A dancing feel for smaller subjects.</td>
            </tr>
          </tbody>
        </table>
        <h2>Tips</h2>
        <p>
          A subject with a clear outline and a transparent background reads best, because the colors change on the
          subject and not on a box around it. Simple shapes also keep the GIF smaller. The export trims colors and
          frames until it fits Slack's 128 KB or Discord's 256 KB.
        </p>
        <p>
          Name a set so it groups in the picker, like <code>:party_cat:</code> and <code>:party_coffee:</code>. Typing{' '}
          <code>:party</code> then shows them all.
        </p>
        <Cta>Make a party emoji →</Cta>
      </>
    ),
  },
  {
    slug: 'slack-emoji-ideas-for-work',
    description:
      'Custom Slack emoji ideas for work, with prompts you can paste, a motion for each one, and naming tips so your team actually uses them.',
    heading: 'Slack emoji ideas for work',
    lede: (
      <>A starter set of custom emoji for a work Slack, with prompts ready to paste and the motion that suits each.</>
    ),
    body: (
      <>
        <h2>Ideas and prompts</h2>
        <p>
          Type any of these into Moji Locker's describe box. Short prompts with one clear subject turn out best at emoji
          size.
        </p>
        <h2>Reactions</h2>
        <table className="info-table">
          <tbody>
            <tr>
              <th>Shipped it</th>
              <td>"small rocket launching with flames, thick outline" with Float</td>
            </tr>
            <tr>
              <th>On it</th>
              <td>"cartoon hand giving a salute" with Wiggle</td>
            </tr>
            <tr>
              <th>+1 but make it fancy</th>
              <td>"golden thumbs up with sparkles" with Party</td>
            </tr>
            <tr>
              <th>Big brain</th>
              <td>"glowing pink brain with lightning bolts" with Pulse</td>
            </tr>
            <tr>
              <th>This is fine</th>
              <td>"calm cartoon dog sipping coffee in a burning room" with Jiggle</td>
            </tr>
          </tbody>
        </table>
        <h2>Team culture</h2>
        <table className="info-table">
          <tbody>
            <tr>
              <th>Team mascot</th>
              <td>Upload your logo or mascot, or describe it, with Bounce</td>
            </tr>
            <tr>
              <th>Coffee</th>
              <td>"steaming coffee mug with a smiley face" with Heartbeat</td>
            </tr>
            <tr>
              <th>Standup</th>
              <td>"cartoon person standing and waving" with Swing</td>
            </tr>
          </tbody>
        </table>
        <h2>Status</h2>
        <table className="info-table">
          <tbody>
            <tr>
              <th>In a meeting</th>
              <td>"calendar with a clock" with Static</td>
            </tr>
            <tr>
              <th>Heads down</th>
              <td>"headphones" with Pulse</td>
            </tr>
            <tr>
              <th>Out sick</th>
              <td>"thermometer with a sad face" with Shake</td>
            </tr>
            <tr>
              <th>Back later</th>
              <td>"hourglass" with Flip</td>
            </tr>
          </tbody>
        </table>
        <p>
          The full set of motions is Static, Spin, Bounce, Shake, Pulse, Wiggle, Party, Float, Jiggle, Heartbeat, Flip
          and Swing. Status emoji often work best static, so they don't distract.
        </p>
        <h2>Name them well</h2>
        <p>
          Slack names use lowercase letters, numbers, hyphens and underscores. Pick names people will guess, like{' '}
          <code>:shipped_it:</code>, <code>:on_it:</code> and <code>:big_brain:</code>. A shared prefix groups a set in
          the picker. The <a href="/guides/slack-emoji-size">Slack emoji size guide</a> covers the size limit and how to
          upload.
        </p>
        <Cta>Make a work emoji →</Cta>
      </>
    ),
  },
  {
    slug: 'turn-a-photo-into-an-emoji',
    description:
      'Turn a photo of your pet, your face or an object into a custom emoji for Slack or Discord: remove the background, frame it tight and tune it to read at small sizes.',
    heading: 'Turn a photo into an emoji',
    lede: <>Photos make great emoji once the background is gone and the subject fills the square. Here's how.</>,
    body: (
      <>
        <h2>Pick a good photo</h2>
        <p>
          Choose one clear subject, well lit, facing the camera. A plain background makes the cutout much cleaner. Only
          use photos you have the right to use, and avoid other people's faces without their permission.
        </p>
        <h2>Step by step</h2>
        <ol>
          <li>Upload the photo. On a plain background, the subject is cut out automatically.</li>
          <li>
            If the cutout misses, open <strong>Adjust</strong> and set <strong>Background</strong> to Keep or Remove.
            With Remove on, raise or lower <strong>Strength</strong> until the edges look right.
          </li>
          <li>
            Set <strong>Framing</strong> to <strong>Fill</strong> and raise Scale so the subject fills the square. Crop
            tight to the face or object. A whole body or room is too small to see.
          </li>
          <li>
            In <strong>Tune</strong>, raise Contrast, Saturation and Sharpness a little, and adjust Brightness if the
            photo is dark.
          </li>
          <li>Add a motion if you like, then choose Slack or Discord and export.</li>
        </ol>
        <h2>Make it read at 22 px</h2>
        <p>
          Slack and Discord show emoji at about 22 px in messages. At that size, soft photos turn to mush. Tight
          framing, a bit of extra contrast and sharpness, and a transparent background do more than any other change.
        </p>
        <h2>Motions that suit photos</h2>
        <table className="info-table">
          <tbody>
            <tr>
              <th>Pets</th>
              <td>Bounce, Wiggle or Jiggle</td>
            </tr>
            <tr>
              <th>Faces</th>
              <td>Shake, Heartbeat or Party</td>
            </tr>
            <tr>
              <th>Objects</th>
              <td>Spin, Float or Swing</td>
            </tr>
          </tbody>
        </table>
        <p>
          Photos have more colors than cartoons, so animated versions are heavier. The export trims colors and frames
          until the file fits, and the <a href="/guides/animated-slack-emoji">animated emoji guide</a> explains how to
          keep more detail.
        </p>
        <Cta>Turn a photo into an emoji →</Cta>
      </>
    ),
  },
]

const GUIDES_INDEX: Page = {
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
