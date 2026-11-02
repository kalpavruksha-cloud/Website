import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pages } from '../src/content.mjs';

test('Vercel clean URL routes resolve to built HTML, including the homepage and nested pages', async () => {
  const settings = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(settings.framework, null);
  assert.equal(settings.outputDirectory, 'dist');
  assert.equal(settings.buildCommand, 'npm run build');
  assert.equal(settings.cleanUrls, true);
  execFileSync(process.execPath, ['scripts/build.mjs'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, SITE_URL: '', VERCEL_PROJECT_PRODUCTION_URL: 'deployment-test.example', VERCEL_URL: 'preview-test.example', PUBLIC_SITE: 'false' },
    stdio: 'pipe',
  });
  for (const route of Object.keys(pages)) {
    const file = route === '/' ? 'index.html' : `${route.slice(1)}.html`;
    const html = await readFile(new URL(`../dist/${file}`, import.meta.url), 'utf8');
    assert.ok(html.includes('<main'), `missing built page: ${route}`);
    assert.ok(html.includes(`rel="canonical" href="https://deployment-test.example${route}"`), `wrong hosted canonical: ${route}`);
    for (const [, resource] of html.matchAll(/(?:src|href)="(\/(?:assets\/[^"?]+|[^"?]+\.(?:css|js)))(?:\?[^" ]*)?"/g)) {
      await access(new URL(`../dist${resource}`, import.meta.url));
    }
  }
  const contact = await readFile(new URL('../dist/contact.html', import.meta.url), 'utf8');
  assert.match(contact, /type="submit" disabled/);
  await access(new URL('../dist/404.html', import.meta.url));
  await access(new URL('../dist/sitemap.xml', import.meta.url));
  await access(new URL('../dist/robots.txt', import.meta.url));
});
