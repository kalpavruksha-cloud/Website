import { mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pages } from '../src/content.mjs';
import { renderPage, renderNotFound } from '../src/render.mjs';
import { sitemap, robots } from '../server.mjs';
import { config } from '../src/config.mjs';
import { brand } from '../src/brand.mjs';

const out = new URL('../dist/', import.meta.url);
// The resolved build target is fixed inside this checkout.
if (fileURLToPath(out) !== fileURLToPath(new URL('../', import.meta.url)) + 'dist' + (process.platform === 'win32' ? '\\' : '/')) throw new Error('Unexpected build target');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(new URL('../public/', import.meta.url), out, { recursive: true });
// Vercel prioritizes existing files over rewrites. Keep page HTML out of its
// filesystem so every public page reads published content from the function.
const staticPages = process.env.VERCEL === '1' ? [] : Object.keys(pages);
for (const path of staticPages) {
  // Vercel cleanUrls maps /about to about.html, including nested page paths.
  const pageFile = new URL(path === '/' ? 'index.html' : `${path.slice(1)}.html`, out);
  await mkdir(new URL('./', pageFile), { recursive: true });
  await writeFile(pageFile, renderPage(path));
}
await writeFile(new URL('404.html', out), renderNotFound());
await writeFile(new URL('sitemap.xml', out), sitemap());
await writeFile(new URL('robots.txt', out), robots());
console.log(process.env.VERCEL === '1' ? `Prepared assets for ${Object.keys(pages).length} server-rendered Vercel pages.` : `Pre-rendered ${staticPages.length} pages to dist/.`);
console.log('Use npm start for the contact API; the static export has enquiry delivery disabled.');
if (!brand.approved) console.log('Review required: official logo is integrated; derived palette and typography need final brand review.');
if (!config.publicSite) console.log('Preview is noindex. Set SITE_URL and PUBLIC_SITE=true only after launch review.');
