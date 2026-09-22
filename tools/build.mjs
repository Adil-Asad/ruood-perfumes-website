/**
 * Stages the deployable site into dist/.
 *
 * There is no build step for the content — the HTML, CSS and JavaScript ship
 * exactly as they are written. This exists only to decide what is deployed:
 * the repository holds documentation, tooling and a package.json that have no
 * business being served from ruood.com, and Netlify publishes a directory,
 * not a list of files.
 *
 * Paths do NOT change here. Every link and asset reference in the HTML is
 * root-relative (/css/styles.css, /assets/…), which is correct both for the
 * preview server and for dist/ published at the domain root.
 *
 *   node tools/build.mjs
 */

import { cp, rm, mkdir, readdir, stat } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const DIST = join(ROOT, 'dist');

/** Everything the deployed site consists of. Add a page, add it here. */
const DEPLOY = [
  'index.html',
  '404.html',
  'robots.txt',
  'sitemap.xml',
  'site.webmanifest',
  'css',
  'js',
  'assets',
];

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

for (const entry of DEPLOY) {
  await cp(join(ROOT, entry), join(DIST, entry), {
    recursive: true,
    // A note to whoever opens assets/fonts/ is for the repository, not for
    // ruood.com. Nothing named README is deployed.
    filter: (source) => !/[\\/]README\.md$/i.test(source),
  });
}

/** A directory's total size and file count, for the one-line report. */
async function weigh(dir) {
  let bytes = 0, files = 0;
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    const info = await stat(path);
    if (info.isDirectory()) {
      const inner = await weigh(path);
      bytes += inner.bytes;
      files += inner.files;
    } else {
      bytes += info.size;
      files += 1;
    }
  }
  return { bytes, files };
}

const { bytes, files } = await weigh(DIST);
console.log(`dist/  ${files} files, ${(bytes / 1024).toFixed(1)} kB`);
console.log('Publish directory: dist');
