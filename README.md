# RUŌOD — the main website

The public website for **RUŌOD**, a fragrance house, served at
**https://ruood.com/**. At the moment it is a single "coming soon" page: the
house is being prepared and the site says so rather than pretending otherwise.

Static HTML, CSS and vanilla JavaScript. No framework, no dependencies, no
build step for the content.

```
D:\ruood-perfumes-website\        this repository — the main RUŌOD site
D:\ruood-lab-website\             RUŌOD Lab's website — a separate project
D:\app\                           the RUŌOD Lab mobile application — separate
```

Nothing here reads from, writes to, or deploys the other two.

---

## Running it locally

Node 18 or newer. There is nothing to install.

```bash
npm run preview                  # http://localhost:8080
```

Open the page at that address. **Do not open `index.html` from the file
system** — every path in the HTML is root-relative (`/css/styles.css`,
`/assets/…`), which is correct for the deployed site and wrong for a `file://`
URL, so the page will look unstyled and tell you nothing true.

The preview server also sends the **production Content-Security-Policy**, the
same one `netlify.toml` sends. That is deliberate: without it, an inline style
or an unhashed inline script works locally and is silently dropped on the
deploy, and you find out from a visitor.

---

## Checking it

```bash
node tools/preview.mjs 8098 &    # the checks run against a live server
npm run verify                   # links, origins, inline styles, SEO, a11y
npm run measure                  # overflow, tap targets, console — 9 widths
npm run shots                    # screenshots into ./.shots
npm run build                    # → dist/  (publish dist, not the repo root)
npm run icons                    # regenerate the PNG icons and social card
```

`verify` and `measure` both exit non-zero on failure, and they check different
things. Run **both** before calling a change done.

| command | what it would catch |
| --- | --- |
| `verify` | a path that does not resolve, a resource from another origin, a `style="…"` attribute, an inline script the CSP would block, a second `<h1>`, a missing canonical, a sitemap entry that 404s, structured data carrying a claim nobody can stand behind |
| `measure` | horizontal overflow at any of nine widths, a tap target under 44×44, a headline that runs past the first screen on a phone, anything the browser logs — including a CSP violation |

`measure`, `shots` and `icons` drive an installed Chrome over the DevTools
Protocol; the standard Windows, macOS and Linux paths are listed in
`tools/cdp.mjs`.

---

## Structure

```
index.html            the coming-soon page
404.html              same design, one message
css/styles.css        one file: tokens → reset → primitives → sections → utilities
js/script.js          reveal-on-scroll and the year; the only script
assets/icons/         favicon, touch icon, manifest icons — see "Brand assets"
assets/images/        the Open Graph card
assets/fonts/         empty on purpose: the site uses device fonts only
netlify.toml          publish directory, headers, and the /lab proxy
robots.txt            speaks for the whole domain, including /lab
sitemap.xml           one page, because there is one page
site.webmanifest      name, colours, icons
tools/                never deployed
```

---

## Deployment

Netlify, from this repository:

| setting | value |
| --- | --- |
| build command | `npm run build` |
| publish directory | `dist` |
| production branch | `main` |

`tools/build.mjs` stages the deployable files into `dist/`, so the tooling,
the documentation and `package.json` are never served from ruood.com. Paths do
not change — they are root-relative already, which is correct for `dist/`
published at the domain root.

**This site owns the apex.** `ruood.com` and `www.ruood.com` point here; it is
the site whose `404.html` answers an unknown path, and whose `robots.txt` a
crawler reads for the entire domain.

### RUŌOD Lab, and the `/lab` path

RUŌOD Lab is a **separate project on a separate Netlify site**, deployed from
`D:\ruood-lab-website\` to its own origin. Its public address is
`https://ruood.com/lab`, and it reaches that address through **this** site:

```
ruood.com/            → this repository
ruood.com/lab   →  200 rewrite →  ruoo.netlify.app/lab   (the Lab's own site)
```

| | main site | RUŌOD Lab |
| --- | --- | --- |
| Netlify project | `ruoodp` | `ruoo` |
| repository | this one | `D:\ruood-lab-website\` |
| public URL | `https://ruood.com/` | `https://ruood.com/lab` |

The proxy rules live in **this** repository's `netlify.toml` and are live:

```toml
[[redirects]]
  from = "/lab"
  to = "https://ruoo.netlify.app/lab"
  status = 200
  force = true

[[redirects]]
  from = "/lab/*"
  to = "https://ruoo.netlify.app/lab/:splat"
  status = 200
  force = true
```

The target keeps the `/lab` prefix, because the Lab origin serves its pages
under `/lab`. Two things matter about these rules:

1. **Status 200, never 301.** A 200 is a rewrite: the address bar stays on
   `ruood.com/lab`, which is what every canonical URL, `og:url`, sitemap entry
   and JSON-LD `@id` in the Lab project already claims. A 301 would push
   visitors onto the netlify.app host and split the SEO value away from those
   URLs.
2. **The Lab's `Sitemap:` line is in this repository's `robots.txt`.**
   A robots.txt is only honoured at the root of a domain, so the Lab cannot
   publish its own — its rules belong in this repository's file. (The Lab
   keeps a `robots.txt` of its own purely as the source to merge in.)

There is no `/lab` content in this repository. The front page links to the
Lab as `/lab` (never the netlify.app address), in its own section and in the
colophon. The local preview cannot serve `/lab`, because that is another
site, so `verify` checks the proxy rules in `netlify.toml` instead of fetching
the path.

---

## Content rules

The page is a promise to strangers, so it says only what is true.

- **No claims that cannot be stood behind.** No launch date, no product
  names, no counts, no heritage, no sourcing story, no reviews, no ratings.
  The structured data carries none of those either, and `verify` fails if any
  appear.
- **No invented product photography.** There is no RUŌOD product imagery in
  this repository. The hero figure is an abstract drawn mark and its caption
  says so. Nothing here may imply that a product exists to be seen.
- **No fake functionality.** No newsletter form, no account, no cart, no
  checkout. The calls to action are `mailto:` links, which really do open the
  visitor's mail app and really do reach `info@ruood.com`.
- **The privacy sentence on the page is load-bearing.** It says the page sets
  no cookies and loads nothing from anywhere else. Adding an analytics script,
  a web font or any third-party embed makes that sentence false, so it would
  have to change in the same commit — and so would the CSP in `netlify.toml`
  and `tools/preview.mjs`.

## Brand assets

`assets/icons/ruood-mark.svg` and `favicon.svg` are **placeholders drawn for
this site**: the Ō of RUŌOD as a ring and its macron, in brass on the house's
ink. The wordmark on the page is set in type, not an image.

When the official RUŌOD logo is available, replace the two SVGs and run
`npm run icons`. Every PNG the site links to is generated from them, so no
other file needs to change.

---

## Git

The remote is `https://github.com/Adil-Asad/ruood-perfumes-website.git`, and
`main` is the production branch Netlify builds. Do not push this repository to
the RUŌOD Lab repository.
