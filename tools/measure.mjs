/**
 * Measures the layout in a real browser, at nine widths.
 *
 *   node tools/preview.mjs 8098 &
 *   node tools/measure.mjs 8098
 *
 * Two classes of fault, both invisible until someone on a phone finds them:
 *
 *   overflow     anything wider than the viewport, which gives the page a
 *                horizontal scrollbar and pushes the layout sideways. The
 *                decorative layers here are deliberately larger than the
 *                screen, so this looks for *scrollable* overflow on the
 *                document, and then names the elements responsible.
 *   tap targets  any link or button whose box is smaller than 44×44 CSS
 *                pixels, which is the floor for a finger.
 *
 * It also reports the viewport-height behaviour of the hero, because a
 * "coming soon" page that needs scrolling to read its own headline on a small
 * phone has failed at the only job it has.
 *
 * `npm run verify` checks different things again; run both.
 */

import { launch, goto } from './cdp.mjs';

const PORT = Number(process.argv[2]) || 8098;
const BASE = `http://localhost:${PORT}`;

const PAGES = ['/', '/404.html'];

/** Real devices, not round numbers: the narrow end is an iPhone SE, the wide
 *  end a desktop. Anything that breaks tends to break at the edges. */
const WIDTHS = [
  { w: 320,  h: 568,  mobile: true,  label: 'iPhone SE (small)' },
  { w: 360,  h: 740,  mobile: true,  label: 'Android, common' },
  { w: 390,  h: 844,  mobile: true,  label: 'iPhone 14' },
  { w: 430,  h: 932,  mobile: true,  label: 'iPhone Pro Max' },
  { w: 600,  h: 960,  mobile: true,  label: 'small tablet, portrait' },
  { w: 768,  h: 1024, mobile: true,  label: 'iPad, portrait' },
  { w: 1024, h: 768,  mobile: false, label: 'iPad, landscape' },
  { w: 1280, h: 800,  mobile: false, label: 'laptop' },
  { w: 1680, h: 1050, mobile: false, label: 'desktop' },
];

const PROBE = `(() => {
  const doc = document.documentElement;
  const overflow = Math.max(0, doc.scrollWidth - doc.clientWidth);

  const wide = [];
  if (overflow > 0) {
    for (const el of document.querySelectorAll('body *')) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (box.right > doc.clientWidth + 1 || box.left < -1) {
        const style = getComputedStyle(el);
        if (style.position === 'fixed') continue;
        wide.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && el.className.baseVal !== undefined
                  ? el.className.baseVal : String(el.className || '')).slice(0, 40),
          left: Math.round(box.left),
          right: Math.round(box.right),
        });
      }
    }
  }

  const small = [];
  for (const el of document.querySelectorAll('a[href], button, [role="button"]')) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    if (el.classList.contains('skip-link')) continue;  // off-screen until focused
    if (box.width < 44 || box.height < 44) {
      small.push({
        text: (el.textContent || '').trim().slice(0, 28),
        cls: String(el.className || '').slice(0, 30),
        w: Math.round(box.width),
        h: Math.round(box.height),
      });
    }
  }

  const h1 = document.querySelector('h1');
  const hero = document.querySelector('.hero, .gone');
  return {
    overflow, wide, small,
    docHeight: doc.scrollHeight,
    heroHeight: hero ? Math.round(hero.getBoundingClientRect().height) : null,
    h1Bottom: h1 ? Math.round(h1.getBoundingClientRect().bottom) : null,
    fontSize: parseFloat(getComputedStyle(document.body).fontSize),
  };
})()`;

const failures = [];
const browser = await launch(9333);
const { call, close } = await browser.page();

/* Anything the browser itself complains about: a blocked inline style, a
   missing asset, a script error. A CSP violation shows up here and nowhere
   else, which is exactly the class of fault this project is most exposed to —
   the preview server sends the production policy so that it does. */
const console_errors = [];
browser.on((method, params) => {
  if (method === 'Log.entryAdded') {
    const entry = params.entry || {};
    if (entry.level === 'error' || entry.level === 'warning') {
      console_errors.push(`${entry.source}/${entry.level}: ${entry.text}${entry.url ? ' — ' + entry.url : ''}`);
    }
  }
  if (method === 'Runtime.exceptionThrown') {
    const details = params.exceptionDetails || {};
    console_errors.push(`exception: ${details.text} ${details.exception ? details.exception.description : ''}`);
  }
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    console_errors.push('console.error: ' + (params.args || []).map((a) => a.value).join(' '));
  }
});
await call('Log.enable');

try {
  for (const path of PAGES) {
    console.log(`\n${path}`);
    for (const size of WIDTHS) {
      await call('Emulation.setDeviceMetricsOverride', {
        width: size.w, height: size.h, deviceScaleFactor: 1, mobile: size.mobile,
      });
      await goto(call, BASE + path, 500);

      const { result } = await call('Runtime.evaluate', {
        expression: PROBE, returnByValue: true, awaitPromise: false,
      });
      const m = result.value;

      const label = `${String(size.w).padStart(4)}×${String(size.h).padEnd(4)} ${size.label}`;
      const bits = [`doc ${m.docHeight}px`];
      if (m.heroHeight !== null) bits.push(`hero ${m.heroHeight}px`);
      if (m.h1Bottom !== null) bits.push(`h1 ends at ${m.h1Bottom}px`);

      if (m.overflow > 0) {
        failures.push(`${path} @ ${size.w}px: ${m.overflow}px of horizontal overflow`);
        console.log(`  ✗ ${label}  overflow ${m.overflow}px`);
        for (const el of m.wide.slice(0, 5)) {
          console.log(`      ${el.tag}.${el.cls}  ${el.left}→${el.right}`);
        }
      } else if (m.small.length) {
        for (const t of m.small) {
          failures.push(`${path} @ ${size.w}px: tap target ${t.w}×${t.h} — "${t.text}" (.${t.cls})`);
        }
        console.log(`  ✗ ${label}  ${m.small.length} small tap target(s)`);
        for (const t of m.small) console.log(`      ${t.w}×${t.h}  "${t.text}"`);
      } else {
        console.log(`  ✓ ${label}  ${bits.join(', ')}`);
      }

      // The headline must be readable without scrolling on a phone.
      if (size.mobile && m.h1Bottom !== null && m.h1Bottom > size.h) {
        failures.push(`${path} @ ${size.w}×${size.h}: the headline runs past the first screen (ends at ${m.h1Bottom}px)`);
      }
    }
  }
} finally {
  await close();
  browser.close();
}

const uniqueErrors = [...new Set(console_errors)];
if (uniqueErrors.length) {
  console.log('\nBrowser console:');
  for (const message of uniqueErrors) {
    console.log(`  ✗ ${message}`);
    failures.push(`browser console: ${message}`);
  }
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const message of failures) console.error(`  ✗ ${message}`);
  process.exit(1);
}
console.log('\n✓ No horizontal overflow, no tap target under 44px, headline on the first screen everywhere.');
console.log('✓ Nothing in the browser console: no CSP violation, no missing asset, no script error.');
