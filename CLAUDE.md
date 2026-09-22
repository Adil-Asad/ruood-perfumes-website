# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

The **main public website for RUŌOD**, a fragrance house, deployed at
`https://ruood.com/`. Static HTML, CSS and vanilla JavaScript. **No framework,
no dependencies, no build step for the content.**

Right now it is one page: a coming-soon landing page, plus a 404 in the same
design. That is the whole site, and the page's own copy is honest about it.

Three projects sit beside each other on this machine and must stay separate:

```
D:\ruood-perfumes-website\   this repository — ruood.com
D:\ruood-lab-website\        RUŌOD Lab's website — ruood.com/lab, its own repo
D:\app\                      the RUŌOD Lab Android application — its own repo
```

Read from the other two freely. **Do not modify them, do not deploy them, do
not commit to their repositories, and do not copy files out of them.** The
brand facts here (the wordmark, the `info@ruood.com` address, the palette's
relationship to the app's gold) were re-derived, not copied.

## Commands

Node 18+. There is nothing to install.

```bash
npm run preview                 # http://localhost:8080
node tools/preview.mjs 8098 &   # the checks run against a live server
npm run verify                  # links, origins, inline styles, SEO, a11y
npm run measure                 # overflow, tap targets, console — 9 widths
npm run shots                   # screenshots into ./.shots
npm run build                   # → dist/ (publish dist, not the repo root)
npm run icons                   # regenerate PNG icons + social card
```

`verify` and `measure` exit non-zero on failure. Run **both** before calling
work done — they check different things and neither subsumes the other.
`measure`, `shots` and `icons` drive an installed Chrome over the DevTools
Protocol through `tools/cdp.mjs`.

## Paths are root-relative, and the site is served at the root

Every asset path and internal link starts with `/` (`href="/css/styles.css"`).
That is correct for the deployed site and for the preview server, which mounts
the project at `/` exactly as Netlify serves `dist/`.

- **Opening `index.html` from the file system will look broken.** That is
  expected. Do not "fix" it by making paths relative — the moment a second
  page is added at another depth, relative paths cannot be right for both, and
  they would break production.
- `verify.mjs` fails on any path that is not root-relative, on any absolute
  URL in the markup (the one exception, `rel="canonical"`, is checked
  separately), and on a canonical that is not a `https://ruood.com/` URL.

## Deployment architecture

Two Netlify sites, and this repository is the one that owns the domain.

```
ruood.com/            THIS repo — publish directory dist/
ruood.com/lab   →     200 rewrite → ruoo.netlify.app/lab — a DIFFERENT repo
```

- **`publish = "dist"`.** `tools/build.mjs` stages the deployable files there
  so that `tools/`, `README.md`, `CLAUDE.md` and `package.json` are never
  served. Add a file the site needs and add it to the `DEPLOY` list.
- **This site owns the apex.** Its `404.html` answers unknown paths for the
  whole domain and its `robots.txt` is the only one a crawler reads — the Lab
  cannot publish its own, so the Lab's rules belong in this repository's file
  when `/lab` goes live.
- **The `/lab` proxy rules are in this repository's `netlify.toml`, commented
  out.** Switching them on is a deliberate act; read the notes beside them
  first. `200` is a rewrite, so the address bar stays on `ruood.com/lab`,
  which is what every canonical URL in the Lab project already claims. A `301`
  would push visitors onto the netlify.app host and split the SEO value off
  those URLs.
- **Never add a redirect whose target differs from its source only by a
  trailing slash.** Netlify ignores the trailing slash when matching `from`,
  so such a rule matches its own target and loops. The Lab site has answered
  `ERR_TOO_MANY_REDIRECTS` from exactly that shape of rule.
- **Do not add `/lab` content to this repository**, and do not test the proxy
  against the live Lab site without being asked to.

## Rules that are not preferences

### No third-party resources, ever

The site loads nothing from another origin — no web fonts, no CDN, no
analytics, no embeds, no social widgets. The type stacks are device fonts.

This is a **stated property of the page**: the hero note says in words that
the page sets no cookies and loads nothing from anywhere else. Adding one
external request makes that sentence false, so it would have to change in the
same commit, along with the CSP in `netlify.toml` and `tools/preview.mjs`.
`verify.mjs` fails on a cross-origin `script`, `link`, `img` or `iframe`, and
on an external `url()` or `@import` in the stylesheet.

Do not add analytics unless the user explicitly asks; if they do, that
sentence, the CSP and the `Permissions-Policy` all change with it, and the
site then needs a privacy page it does not currently have.

### No `style="…"` attributes

The deployed CSP is `style-src 'self'` with no `'unsafe-inline'`, so an inline
style is **silently dropped in production** while working fine in a preview
that sends no header. Use a class; there are small placement utilities at the
end of `styles.css` for one-offs. `verify.mjs` fails on one, and
`preview.mjs` sends the production CSP so the local preview cannot disagree
with the deploy.

This is also why the reveal stagger is written as `transition-delay` rules in
the stylesheet rather than set from JavaScript.

### The inline script is allowed by hash

Each page carries one inline script —
`document.documentElement.classList.remove('no-js');` — allowed in
`script-src` by SHA-256 rather than `'unsafe-inline'`, so nothing else inline
can run. The hash lives in **two** places, `netlify.toml` and
`tools/preview.mjs`, and the command to regenerate it is commented in
`netlify.toml`. Change that line and both must be updated, and so must the
copy in `verify.mjs` that checks it.

### The page may not claim what cannot be stood behind

There is no product, no date and no catalogue to point at yet, and the page is
written accordingly. Do not add:

- a launch date, a countdown, or "in X weeks";
- product names, notes, ingredients, or a collection size;
- heritage, provenance, awards, press quotes, reviews or ratings;
- customer testimonials or follower counts;
- **product photography of any kind.** The hero figure is an abstract drawn
  mark and its caption says so. Nothing may imply a product is on show.

`verify.mjs` fails if the structured data grows an `aggregateRating`,
`review`, `offers`, `price`, `award` or `downloadCount`.

### No fake functionality

No newsletter form, no account, no cart, no checkout, no API. The calls to
action are `mailto:info@ruood.com` links, which genuinely reach the house. If
a real mailing list is ever wanted, it needs a real backend and a privacy
notice — not a form that quietly discards what people type.

### SEO invariants

- one `<h1>` per page; no skipped heading levels;
- unique `<title>` and meta description per page;
- canonical to the `https://ruood.com/` URL;
- `404.html` is `noindex` and is not in the sitemap;
- Open Graph complete, with an absolute `og:image` that exists.

## Design

A perfume house's palette, not a software product's: an ivory paper ground
(`--ivory`), a warm near-black (`--ink`), and **one** restrained brass accent
that appears in the Ō of the wordmark, in the italic of the headline, in
hairlines and in links — and almost nowhere else. Gold is the brand's colour;
using it everywhere is what makes a luxury page look synthetic.

Colour was **measured, not eyeballed**. The ratios are listed in the comment
at the top of `styles.css`. `--line` (decorative) and `--line-control` (a
control's own boundary, which needs 3:1) are separate tokens for that reason.
Check any new pair before using it.

Type is a two-stack system with no font files: `--font-display` resolves to
Didot or Bodoni on Apple devices and Constantia or Georgia on Windows —
high-contrast editorial serifs either way — and `--font-body` is the system
sans, used for the eyebrow, the buttons, the notes and the dark section's
prose. Spacing comes from the tokens at the top of the stylesheet; don't fix
an alignment difference with a one-off number.

Motion is small and has to survive being switched off: the aura drifts, the
figure draws itself once, sections fade in as they arrive. All of it sits
behind `prefers-reduced-motion`, and the page is complete and readable with
JavaScript blocked entirely — the `.reveal` rules only apply once the inline
snippet has removed `no-js`.

The layout is rearranged per breakpoint, not shrunk: above 900px the figure
sits beside the copy; below, it moves behind the type and anchors to the foot
of the hero so the trail rises past the words instead of crossing the
headline.

## Structure

```
index.html  404.html
css/styles.css       one file: tokens → reset → primitives → sections → utilities
js/script.js         reveal-on-scroll and the year; the only script
assets/icons/        placeholder mark → favicon, touch icon, manifest icons
assets/images/       the Open Graph card, generated from tools/og-card.html
assets/fonts/        empty on purpose
tools/               never deployed
```

The masthead and colophon are **duplicated across the two pages**. With no
build step that is the trade, deliberately taken rather than adding a
templating dependency for two files. Change one, change both — and when a page
is added, update the nav in every page, `sitemap.xml`, the `DEPLOY` list in
`build.mjs`, and the `PAGES` arrays in both `verify.mjs` and `measure.mjs`.

`assets/icons/ruood-mark.svg` and `favicon.svg` are **placeholders**, drawn
here rather than taken from anywhere. When the official logo arrives, replace
them and run `npm run icons`; every PNG is generated from those two files.
