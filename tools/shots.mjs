/**
 * Screenshots, with real device metrics.
 *
 *   node tools/preview.mjs 8098 &
 *   node tools/shots.mjs ./.shots 8098
 *
 * Emulation goes through the protocol (see cdp.mjs) rather than Chrome's
 * --window-size, which does not apply mobile emulation and produces phone
 * -width captures that are really desktop layouts, cropped.
 *
 * Output is .shots/, which .gitignore keeps out of the repository.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, goto } from './cdp.mjs';

const OUT = process.argv[2] || './.shots';
const PORT = Number(process.argv[3]) || 8098;
const BASE = `http://localhost:${PORT}`;

const SHOTS = [
  { name: 'home-mobile',    path: '/',         w: 390,  h: 844,  mobile: true,  full: true },
  { name: 'home-small',     path: '/',         w: 320,  h: 568,  mobile: true,  full: false },
  { name: 'home-tablet',    path: '/',         w: 768,  h: 1024, mobile: true,  full: true },
  { name: 'home-laptop',    path: '/',         w: 1280, h: 800,  mobile: false, full: true },
  { name: 'home-desktop',   path: '/',         w: 1680, h: 1050, mobile: false, full: false },
  { name: 'house-desktop',  path: '/#house',   w: 1280, h: 800,  mobile: false, full: false },
  { name: 'notfound',       path: '/404.html', w: 1280, h: 800,  mobile: false, full: false },
  { name: 'notfound-mobile',path: '/404.html', w: 390,  h: 844,  mobile: true,  full: false },
];

mkdirSync(OUT, { recursive: true });

const browser = await launch(9335);
const { call, close } = await browser.page();

try {
  for (const shot of SHOTS) {
    await call('Emulation.setDeviceMetricsOverride', {
      width: shot.w, height: shot.h, deviceScaleFactor: 1, mobile: shot.mobile,
    });
    await goto(call, BASE + shot.path, 1400);   // let the reveals finish

    // A full-page capture never scrolls, so the IntersectionObserver below
    // the fold never fires and those sections would photograph blank. Put
    // them in their settled state explicitly — this is the state a visitor
    // reaches by scrolling, not a state the page cannot otherwise reach.
    if (shot.full) {
      await call('Runtime.evaluate', {
        expression: `document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('is-in'); });`,
      });
      await new Promise((r) => setTimeout(r, 1300));
    }

    const png = await call('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: shot.full,
    });
    const file = join(OUT, shot.name + '.png');
    writeFileSync(file, Buffer.from(png.data, 'base64'));
    console.log(`${file.padEnd(34)} ${shot.w}×${shot.h}${shot.full ? ' (full page)' : ''}`);
  }
} finally {
  await close();
  browser.close();
}
