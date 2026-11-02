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
    env: { ...process.env, VERCEL: '', SITE_URL: '', VERCEL_PROJECT_PRODUCTION_URL: 'deployment-test.example', VERCEL_URL: 'preview-test.example', PUBLIC_SITE: 'false' },
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
  // Existing HTML would take precedence over Vercel rewrites and hide CMS edits.
  execFileSync(process.execPath, ['scripts/build.mjs'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, VERCEL: '1', SITE_URL: '', VERCEL_PROJECT_PRODUCTION_URL: 'deployment-test.example', PUBLIC_SITE: 'false' },
    stdio: 'pipe',
  });
  assert.equal(settings.rewrites.length, Object.keys(pages).length + 1);
  assert.equal(settings.rewrites.find(rule => rule.source === '/review')?.destination, '/api/cms?op=review');
  for (const route of Object.keys(pages)) {
    assert.equal(settings.rewrites.find(rule => rule.source === route)?.destination, `/api/site?path=${encodeURIComponent(route)}`);
    const file = route === '/' ? 'index.html' : `${route.slice(1)}.html`;
    await assert.rejects(access(new URL(`../dist/${file}`, import.meta.url)), { code: 'ENOENT' });
  }
  for (const file of ['admin.html', 'community.css', 'editor.js', 'editor.css', 'gallery.js', '404.html']) await access(new URL(`../dist/${file}`, import.meta.url));
  const cms = (await import('../api/cms.mjs')).default;
  const site = (await import('../api/site.mjs')).default;
  assert.equal(typeof cms.fetch, 'function'); assert.equal(typeof site.fetch, 'function');
  assert.equal((await site.fetch(new Request('https://deployment-test.example/api/site?path=%2Fteam'))).status, 200);
});
