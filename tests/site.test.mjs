import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { pages, businesses } from '../src/content.mjs';
import { renderPage } from '../src/render.mjs';
import { validateEnquiry, deliverEnquiry, createRateLimiter, contactAvailable } from '../src/contact.mjs';
import { createApp } from '../server.mjs';
import { config } from '../src/config.mjs';

const valid = { fullName: 'Test Visitor', mobile: '+91 99999 99999', email: 'visitor@example.com', business: 'General Business Enquiry', message: 'Please share information about the corporate office.', consent: true };

test('all 26 routes have unique metadata, one h1, valid links and available images', async () => {
  assert.equal(Object.keys(pages).length, 26);
  const titles = new Set(); const descriptions = new Set();
  for (const [path, page] of Object.entries(pages)) {
    const html = renderPage(path);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${path} must have one h1`);
    assert.ok(html.includes('rel="canonical"'), path);
    assert.ok(html.includes('name="robots" content="noindex,nofollow"'), 'preview must not be indexed');
    assert.ok(!html.includes('undefined'), path);
    const mainText = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)[1].replace(/<[^>]*>/g, ' ');
    assert.ok(mainText.split(/\s+/).length > 100, `${path} must contain meaningful page content`);
    assert.ok(!titles.has(page.title), `duplicate title ${path}`); titles.add(page.title);
    assert.ok(!descriptions.has(page.description), `duplicate description ${path}`); descriptions.add(page.description);
    for (const [, href] of html.matchAll(/href="(\/[^"]*)"/g)) {
      const target = href.split(/[?#]/)[0];
      if (target === '/admin') await access(new URL('../public/admin.html', import.meta.url));
      else if (/\.(css|svg|jpg|png)$/.test(target)) await access(new URL(`../public${target}`, import.meta.url));
      else assert.ok(pages[target], `${path} links to missing route ${target}`);
    }
    for (const [, src] of html.matchAll(/src="(\/assets\/[^"]+)"/g)) await access(new URL(`../public${src}`, import.meta.url));
  }
});

test('business relationships and illustrative market labels are explicit; unavailable form is disabled', () => {
  assert.equal(businesses.length, 5);
  const requestedOrder = ['/wealth', '/businesses/kv-constructions', '/real-estate', '/businesses/rudraksh-enterprises', '/businesses/brindavan-resto'];
  for (const path of ['/', '/businesses']) {
    const html = renderPage(path);
    const cards = [...html.matchAll(/<a href="([^"]+)" class="business-card reveal">/g)].map(match => match[1]);
    assert.deepEqual(cards, requestedOrder, `${path} must preserve the requested company sequence`);
  }
  for (const business of businesses) {
    const main = renderPage(business.route).match(/<main[^>]*>([\s\S]*?)<\/main>/)[1];
    assert.ok(main.includes(`src="${business.logo}"`), `missing business page logo: ${business.name}`);
  }
  assert.match(renderPage('/'), /KV Constructions · Independent partner/);
  assert.match(renderPage('/businesses/kv-constructions'), /not owned by Kalpavruksha/);
  assert.match(renderPage('/wealth'), /Illustrative · Not live data/);
  assert.match(renderPage('/contact'), /type="submit" disabled/);
  assert.match(renderPage('/corporate-office'), /Planned corporate office opening/);
});

test('validation rejects malformed input, missing consent, spam and header injection', () => {
  assert.ok(validateEnquiry(valid).enquiry);
  for (const data of [null, [], {}, { ...valid, email: 'a\r\nBcc: x@example.com' }, { ...valid, fullName: 'a\nInjected' }, { ...valid, consent: false }, { ...valid, business: 'Unknown business' }, { ...valid, website: 'spam' }, { ...valid, message: 'short' }, { ...valid, message: 'x'.repeat(3001) }, { ...valid, mobile: '(((((((' }]) assert.ok(validateEnquiry(data).error);
});

test('rate limiting isolates clients and expires', () => {
  let now = 0;
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => now });
  assert.equal(limiter.allow('one'), true); assert.equal(limiter.allow('one'), true); assert.equal(limiter.allow('one'), false);
  assert.equal(limiter.allow('two'), true);
  now = 1001; assert.equal(limiter.allow('one'), true);
});

test('delivery confirms success only after provider acceptance', async () => {
  const env = { RESEND_API_KEY: 'test-only', CONTACT_FROM: 'Website <site@example.com>', CONTACT_TO: 'contact@example.com' };
  assert.equal(contactAvailable({}), false);
  assert.equal(contactAvailable({ ...env, NODE_ENV: 'production' }), false);
  assert.equal((await deliverEnquiry(valid, { env: {} })).status, 503);
  let captured;
  const accepted = await deliverEnquiry(valid, { env, fetcher: async (url, options) => { captured = JSON.parse(options.body); return { ok: true, json: async () => ({ id: 'mock-provider-id' }) }; } });
  assert.equal(accepted.ok, true); assert.deepEqual(captured.to, ['contact@example.com']); assert.equal(captured.reply_to, valid.email);
  const rejected = await deliverEnquiry(valid, { env, fetcher: async () => ({ ok: false, json: async () => ({ message: 'error' }) }) });
  assert.equal(rejected.ok, undefined); assert.equal(rejected.status, 502);
  assert.equal((await deliverEnquiry(valid, { env, fetcher: async () => { throw new Error('network'); } })).status, 502);
});

test('anti-spam rejects absent tokens and mismatched hostnames', async () => {
  const env = { RESEND_API_KEY: 'test-only', CONTACT_FROM: 'site@example.com', CONTACT_TO: 'contact@example.com', TURNSTILE_SECRET_KEY: 'test-only' };
  assert.equal((await deliverEnquiry(valid, { env })).status, 400);
  const result = await deliverEnquiry(valid, { env, token: 'test-token', fetcher: async () => ({ ok: true, json: async () => ({ success: true, hostname: 'untrusted.example' }) }) });
  assert.equal(result.status, 400);
});

test('HTTP serves all routes and assets, protects source and validates contact requests', async t => {
  let delivered = 0;
  const server = createApp({ deliver: async () => { delivered++; return { status: 200, ok: true }; }, limiter: createRateLimiter({ limit: 20 }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of Object.keys(pages)) assert.equal((await fetch(base + path)).status, 200, path);
  for (const path of ['/styles.css', '/app.js', '/favicon.svg', '/assets/architecture.jpg', '/assets/materials.svg', '/robots.txt', '/sitemap.xml']) assert.equal((await fetch(base + path)).status, 200, path);
  assert.equal((await fetch(base + '/does-not-exist')).status, 404);
  assert.equal((await fetch(base + '/src/config.mjs')).status, 404);
  assert.equal((await fetch(base + '/.env')).status, 404);
  const review = await fetch(base + '/review', { redirect: 'manual' });
  assert.equal(review.status, 303); assert.match(review.headers.get('location'), /\/admin\?next=/); assert.equal(review.headers.get('cache-control'), 'no-store');
  const css = await fetch(base + '/styles.css'); assert.match(css.headers.get('content-type'), /text\/css/);
  const post = (data, origin = config.origin) => fetch(base + '/api/contact', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal((await post(valid, 'https://untrusted.example')).status, 403);
  assert.equal((await post({ ...valid, consent: false })).status, 400);
  assert.equal((await post({ ...valid, message: 'x'.repeat(17000) })).status, 413);
  const response = await post(valid); assert.equal(response.status, 200); assert.equal((await response.json()).ok, true); assert.equal(delivered, 1);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
});

test('responsive CSS includes reduced-motion handling', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.ok(css.includes('prefers-reduced-motion:reduce'));
  for (const size of [600, 900, 1150]) assert.ok(css.includes(`max-width:${size}px`));
});
