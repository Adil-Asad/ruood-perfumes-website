/**
 * Rasterises the brand mark into the PNG sizes the site links to, and renders
 * the social card.
 *
 *   node tools/make-icons.mjs
 *
 * Sources:
 *   assets/icons/favicon.svg      →  favicon-32 (rounded, transparent corners)
 *   assets/icons/ruood-mark.svg   →  apple-touch-icon, icon-192, icon-512,
 *                                    ruood-mark-512 (JSON-LD logo)
 *   tools/og-card.html            →  assets/images/ruood-social-card.png
 *
 * The mark is a PLACEHOLDER drawn for this site, not an official brand asset.
 * When the real RUŌOD logo arrives, replace the SVG and run this again; no
 * other file needs to change, because everything references the PNG names.
 *
 * Rendering goes through headless Chrome rather than an image library, so the
 * project keeps its promise of having nothing to install.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { launch, goto } from './cdp.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const ICONS = join(ROOT, 'assets', 'icons');
const IMAGES = join(ROOT, 'assets', 'images');

const FAVICON = pathToFileURL(join(ICONS, 'favicon.svg')).href;
const MARK = pathToFileURL(join(ICONS, 'ruood-mark.svg')).href;
const CARD = pathToFileURL(join(ROOT, 'tools', 'og-card.html')).href;

// `transparent` keeps the favicon's rounded corners clear instead of letting
// Chrome's default white page show through them.
const JOBS = [
  { url: FAVICON, out: join(ICONS, 'favicon-32.png'), w: 32, h: 32, transparent: true },
  { url: MARK, out: join(ICONS, 'apple-touch-icon.png'), w: 180, h: 180 },
  { url: MARK, out: join(ICONS, 'icon-192.png'), w: 192, h: 192 },
  { url: MARK, out: join(ICONS, 'icon-512.png'), w: 512, h: 512 },
  { url: MARK, out: join(ICONS, 'ruood-mark-512.png'), w: 512, h: 512 },
  { url: CARD, out: join(IMAGES, 'ruood-social-card.png'), w: 1200, h: 630 },
];

mkdirSync(ICONS, { recursive: true });
mkdirSync(IMAGES, { recursive: true });

const browser = await launch(9331);
const { call, close } = await browser.page();

try {
  for (const job of JOBS) {
    await call('Emulation.setDeviceMetricsOverride', {
      width: job.w, height: job.h, deviceScaleFactor: 1, mobile: false,
    });
    await call('Emulation.setDefaultBackgroundColorOverride',
      job.transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
    await goto(call, job.url, 250);
    const shot = await call('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false, optimizeForSpeed: false,
    });
    const bytes = Buffer.from(shot.data, 'base64');
    writeFileSync(job.out, bytes);
    console.log(`${job.out.replace(ROOT, '.').padEnd(46)} ${job.w}×${job.h}  ${(bytes.length / 1024).toFixed(1)} kB`);
  }
} finally {
  await close();
  browser.close();
}
