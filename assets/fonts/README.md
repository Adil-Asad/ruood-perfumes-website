# Fonts

Empty on purpose. The site uses device font stacks only (see the --font-*
tokens in css/styles.css), so there is no font file to serve and no external
font request to make. If a licensed face is ever added, self-host it here —
never load it from a third-party CDN, and update the Content-Security-Policy
in netlify.toml and tools/preview.mjs with it.
