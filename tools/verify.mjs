/**
 * Checks the things that are easy to break and impossible to see.
 *
 *   node tools/preview.mjs 8098 &
 *   node tools/verify.mjs 8098
 *
 * It runs against a LIVE preview server rather than the files on disk,
 * because half of what matters here is a response: the Content-Security
 * -Policy, the content types, whether a link actually resolves.
 *
 * What it enforces, and why each one is here:
 *
 *   paths      every internal href/src is root-relative and resolves. The
 *              site is deployed at the domain root, so a relative path that
 *              happens to work on the front page breaks the moment a page is
 *              added at a second depth.
 *   origins    no script, stylesheet, image, iframe or font from another
 *              origin. The front page states in words that it loads nothing
 *              from anywhere else; one CDN reference makes that a lie.
 *   inline     no style="…" attribute anywhere. style-src is 'self' with no
 *              'unsafe-inline', so an inline style is dropped in production
 *              while working perfectly in a preview that sends no header.
 *   scripts    exactly one inline script per page, and its text must hash to
 *              the value in the CSP; anything else inline could not run.
 *   headings   one h1 per page, no skipped levels.
 *   seo        unique title and description, canonical at https://ruood.com/,
 *              Open Graph complete, structured data free of claims nobody
 *              can stand behind (ratings, reviews, prices, awards).
 *   a11y       lang, viewport, alt text, a labelled decorative figure, and a
 *              skip link that comes first.
 *
 * Exits non-zero on any failure. `npm run measure` checks different things
 * again — layout overflow and tap targets — and neither subsumes the other.
 */

const PORT = Number(process.argv[2]) || 8098;
const BASE = `http://localhost:${PORT}`;
const SITE = 'https://ruood.com';

/** Every page the site serves. Add a page, add it here. */
const PAGES = [
  { path: '/', name: 'front page', indexable: true },
  { path: '/404.html', name: '404', indexable: false },
];

const INLINE_SCRIPT = "document.documentElement.classList.remove('no-js');";
const SCRIPT_HASH = 'sha256-tuKyZn/3ycw/MNMDii/kvSPrelo6SCsJSecqb1n2neg=';

const failures = [];
const notes = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);
const note = (message) => notes.push(message);

/* ── helpers ─────────────────────────────────────────────────────────── */

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? m[1] : null;
};
const tags = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) || [];
const meta = (html, kind, value) =>
  tags(html, 'meta').find((t) => (attr(t, kind) || '').toLowerCase() === value);

async function get(path) {
  const res = await fetch(BASE + path, { redirect: 'manual' });
  return { res, body: await res.text() };
}

/* ── the run ─────────────────────────────────────────────────────────── */

try {
  await fetch(BASE + '/');
} catch {
  console.error(`No preview server on ${BASE}. Start one first:\n  node tools/preview.mjs ${PORT} &`);
  process.exit(1);
}

const titles = new Map();
const descriptions = new Map();

for (const page of PAGES) {
  const where = page.name;
  const { res, body: html } = await get(page.path);

  if (res.status !== 200) fail(where, `expected 200, got ${res.status}`);

  /* --- response headers ------------------------------------------------ */
  const csp = res.headers.get('content-security-policy');
  if (!csp) {
    fail(where, 'no Content-Security-Policy header — is this the project preview server?');
  } else {
    if (csp.includes("'unsafe-inline'")) fail(where, "CSP contains 'unsafe-inline'");
    if (!csp.includes(SCRIPT_HASH)) fail(where, 'CSP does not carry the inline-script hash');
  }

  /* --- document basics ------------------------------------------------- */
  if (!/<html[^>]*\blang="en"/i.test(html)) fail(where, 'no lang="en" on <html>');
  if (!/<html[^>]*\bclass="no-js"/i.test(html)) fail(where, 'no no-js class on <html> (the reveal rules depend on it)');
  if (!meta(html, 'name', 'viewport')) fail(where, 'no viewport meta');
  if (!/<meta charset="utf-8">/i.test(html)) fail(where, 'no charset meta, or not first');
  if (!html.includes('RUŌOD')) fail(where, 'the wordmark lost its macron — check the file encoding is UTF-8');

  /* --- title and description ------------------------------------------- */
  const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1];
  if (!title) fail(where, 'no <title>');
  else {
    if (titles.has(title)) fail(where, `duplicate <title> (also on ${titles.get(title)})`);
    titles.set(title, where);
    if (title.length > 65) note(`${where}: title is ${title.length} characters; search results cut around 60`);
  }

  const descTag = meta(html, 'name', 'description');
  const description = descTag && attr(descTag, 'content');
  if (!description) fail(where, 'no meta description');
  else {
    if (descriptions.has(description)) fail(where, 'duplicate meta description');
    descriptions.set(description, where);
    if (description.length > 165) note(`${where}: description is ${description.length} characters; around 155 is the usual cut`);
  }

  /* --- canonical and indexing ------------------------------------------ */
  const canonical = tags(html, 'link').find((t) => (attr(t, 'rel') || '') === 'canonical');
  const canonicalHref = canonical && attr(canonical, 'href');
  if (!canonicalHref) fail(where, 'no canonical link');
  else if (!canonicalHref.startsWith(SITE + '/')) fail(where, `canonical is ${canonicalHref}, not a ${SITE}/ URL`);

  const robots = meta(html, 'name', 'robots');
  const robotsValue = (robots && attr(robots, 'content')) || '';
  if (page.indexable && robotsValue.includes('noindex')) fail(where, 'an indexable page is marked noindex');
  if (!page.indexable && !robotsValue.includes('noindex')) fail(where, 'this page should be noindex');

  /* --- Open Graph ------------------------------------------------------ */
  for (const property of ['og:type', 'og:title', 'og:description', 'og:url', 'og:image', 'og:site_name']) {
    if (!meta(html, 'property', property)) fail(where, `missing ${property}`);
  }
  const ogImage = meta(html, 'property', 'og:image');
  const ogImageUrl = ogImage && attr(ogImage, 'content');
  if (ogImageUrl && !ogImageUrl.startsWith(SITE + '/')) fail(where, 'og:image is not an absolute ruood.com URL');
  if (ogImageUrl) {
    const asset = await fetch(BASE + ogImageUrl.slice(SITE.length));
    if (!asset.ok) fail(where, `og:image does not exist locally (${ogImageUrl})`);
  }
  if (!meta(html, 'name', 'twitter:card')) fail(where, 'missing twitter:card');
  if (ogImageUrl && !meta(html, 'property', 'og:image:alt')) note(`${where}: og:image has no og:image:alt`);

  /* --- headings -------------------------------------------------------- */
  const headings = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  const h1s = headings.filter((level) => level === 1).length;
  if (h1s !== 1) fail(where, `${h1s} <h1> elements; there must be exactly one`);
  headings.reduce((previous, level) => {
    if (level > previous + 1) fail(where, `heading level jumps from h${previous} to h${level}`);
    return level;
  }, 1);

  /* --- no inline styles ------------------------------------------------ */
  const inlineStyles = html.match(/<[^>]+\sstyle\s*=\s*"/gi) || [];
  if (inlineStyles.length) fail(where, `${inlineStyles.length} style attribute(s); the CSP drops them in production`);
  const styleBlocks = (html.match(/<style\b/gi) || []).length;
  if (styleBlocks) fail(where, `${styleBlocks} <style> block(s); style-src is 'self' and would drop them`);

  /* --- scripts --------------------------------------------------------- */
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  let inlineCount = 0;
  for (const [, attrs, contents] of scripts) {
    const type = (attrs.match(/type\s*=\s*"([^"]*)"/i) || [])[1] || '';
    const src = (attrs.match(/src\s*=\s*"([^"]*)"/i) || [])[1];
    if (type === 'application/ld+json') continue;
    if (src) {
      if (!src.startsWith('/')) fail(where, `script src is not root-relative: ${src}`);
      continue;
    }
    inlineCount += 1;
    if (contents.trim() !== INLINE_SCRIPT) {
      fail(where, 'the inline script is not the hashed one-liner, so the CSP will block it');
    }
  }
  if (inlineCount !== 1) fail(where, `${inlineCount} inline scripts; there must be exactly the one hashed line`);

  /* --- structured data ------------------------------------------------- */
  for (const [, , json] of html.matchAll(/<script\b([^>]*type="application\/ld\+json"[^>]*)>([\s\S]*?)<\/script>/gi)) {
    let data;
    try {
      data = JSON.parse(json);
    } catch (error) {
      fail(where, `structured data is not valid JSON: ${error.message}`);
      continue;
    }
    const flat = JSON.stringify(data);
    for (const claim of ['aggregateRating', 'review', 'ratingValue', 'offers', 'price', 'award', 'downloadCount']) {
      if (flat.includes(`"${claim}"`)) fail(where, `structured data contains "${claim}" — no claim here can be stood behind`);
    }
    if (!flat.includes(SITE)) fail(where, 'structured data does not reference https://ruood.com');
  }

  /* --- links and assets ------------------------------------------------ */
  const references = [];
  for (const tag of tags(html, 'a')) references.push(['href', attr(tag, 'href')]);
  for (const name of ['link', 'script', 'img', 'source', 'iframe']) {
    for (const tag of tags(html, name)) {
      // rel="canonical" is the one link that MUST be absolute: it names the
      // public URL, which is the whole point of it. It is checked above.
      if (name === 'link' && (attr(tag, 'rel') || '') === 'canonical') continue;
      references.push(['href', attr(tag, 'href')], ['src', attr(tag, 'src')]);
    }
  }

  for (const [, value] of references) {
    if (!value) continue;
    if (value.startsWith('#') || value.startsWith('mailto:') || value.startsWith('tel:')) continue;

    if (/^https?:\/\//i.test(value)) {
      fail(where, `absolute URL in markup: ${value} — the site loads nothing from another origin`);
      continue;
    }
    if (!value.startsWith('/')) {
      fail(where, `path is not root-relative: ${value}`);
      continue;
    }
    const target = await fetch(BASE + value, { method: 'GET' });
    if (!target.ok) fail(where, `broken path: ${value} (${target.status})`);
  }

  /* --- fragment targets exist ------------------------------------------ */
  for (const tag of tags(html, 'a')) {
    const href = attr(tag, 'href');
    if (href && href.startsWith('#') && href.length > 1) {
      const id = href.slice(1);
      if (!new RegExp(`id="${id}"`).test(html)) fail(where, `link to #${id}, which no element has`);
    }
  }

  /* --- accessibility basics -------------------------------------------- */
  const firstLink = html.match(/<a\b[^>]*>/i);
  if (firstLink && !/skip-link/.test(firstLink[0])) fail(where, 'the skip link is not the first link in the document');

  for (const tag of tags(html, 'img')) {
    if (attr(tag, 'alt') === null) fail(where, 'an <img> has no alt attribute');
  }

  for (const tag of tags(html, 'svg')) {
    const role = attr(tag, 'role');
    if (role === 'img' && !attr(tag, 'aria-labelledby') && !attr(tag, 'aria-label')) {
      fail(where, 'an <svg role="img"> has no accessible name');
    }
  }

  const decorative = (html.match(/aria-hidden="true"/g) || []).length;
  if (page.path === '/' && decorative < 1) note('front page: no aria-hidden on the decorative layers');
}

/* ── site-level files ─────────────────────────────────────────────────── */

const robotsTxt = await get('/robots.txt');
if (!robotsTxt.res.ok) fail('robots.txt', 'missing');
else {
  if (!/^User-agent: \*/m.test(robotsTxt.body)) fail('robots.txt', 'no User-agent line');
  if (!robotsTxt.body.includes(`Sitemap: ${SITE}/sitemap.xml`)) fail('robots.txt', 'does not point at the sitemap');
  if (/^Disallow: \/$/m.test(robotsTxt.body)) fail('robots.txt', 'disallows the whole site');
}

const sitemap = await get('/sitemap.xml');
if (!sitemap.res.ok) fail('sitemap.xml', 'missing');
else {
  const locations = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (!locations.length) fail('sitemap.xml', 'lists no URLs');
  for (const loc of locations) {
    if (!loc.startsWith(SITE + '/')) fail('sitemap.xml', `${loc} is not a ${SITE}/ URL`);
    const path = loc.slice(SITE.length) || '/';
    const target = await fetch(BASE + path);
    if (!target.ok) fail('sitemap.xml', `${loc} does not resolve (${target.status})`);
  }
  if (locations.some((l) => l.includes('/404'))) fail('sitemap.xml', 'lists the 404 page');
}

const manifest = await get('/site.webmanifest');
if (!manifest.res.ok) fail('site.webmanifest', 'missing');
else {
  const parsed = JSON.parse(manifest.body);
  for (const icon of parsed.icons || []) {
    const target = await fetch(BASE + icon.src);
    if (!target.ok) fail('site.webmanifest', `icon missing: ${icon.src}`);
  }
}

/* --- the stylesheet holds no external reference ------------------------ */
const css = await get('/css/styles.css');
if (!css.res.ok) fail('styles.css', 'missing');
else {
  for (const [, url] of css.body.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    if (/^https?:/i.test(url)) fail('styles.css', `external url() reference: ${url}`);
  }
  if (/@import\s+url\(\s*["']?https?:/i.test(css.body)) fail('styles.css', 'imports a remote stylesheet');
}

/* ── report ──────────────────────────────────────────────────────────── */

for (const message of notes) console.log(`note   ${message}`);

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const message of failures) console.error(`  ✗ ${message}`);
  process.exit(1);
}

console.log(`\n✓ ${PAGES.length} page(s) verified: paths, origins, inline styles, scripts, headings, SEO, accessibility basics.`);
