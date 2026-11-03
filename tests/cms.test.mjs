import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';
import { createCmsHandler } from '../src/cms/service.mjs';
import { siteHandler } from '../src/cms/site.mjs';
import { compilePage, validateChanges, renderEditedPage } from '../src/cms/catalog.mjs';
import { ConflictError, makeStore } from '../src/cms/storage.mjs';
import { makeSession, readSession } from '../src/cms/auth.mjs';
import { handleWebRequest } from '../src/cms/node-adapter.mjs';
import { renderPage } from '../src/render.mjs';
import { initialCollections } from '../src/collections.mjs';

const env = { CMS_EDITOR_PASSWORD: 'test-editor-password-only', CMS_OWNER_PASSWORD: 'test-owner-password-only' };
const base = 'http://localhost:3000';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64');
class MemoryStore {
  records = new Map(); counter = 0;
  async read(key) { const record = this.records.get(key); return record ? { ...record, data: Buffer.from(record.data) } : null; }
  async write(key, data, expected = null, type) {
    if ((this.records.get(key)?.etag ?? null) !== expected) throw new ConflictError();
    const etag = String(++this.counter); this.records.set(key, { data: Buffer.from(data), etag, type }); return { etag };
  }
}
function fixture() {
  const store = new MemoryStore(); const handler = createCmsHandler({ store, env });
  const call = (op, { path = '/', cookie, body, raw, origin = base, method = body !== undefined || raw ? 'POST' : 'GET' } = {}) => handler(new Request(`${base}/api/cms?${new URLSearchParams({ op, page: path })}`, {
    method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method === 'POST' ? { Origin: origin, 'Content-Type': raw ? 'application/octet-stream' : 'application/json' } : {}) }, ...(method === 'POST' ? { body: raw || JSON.stringify(body) } : {}),
  }));
  const login = async role => { const response = await call('login', { body: { name: `Test ${role}`, password: env[role === 'owner' ? 'CMS_OWNER_PASSWORD' : 'CMS_EDITOR_PASSWORD'] } }); assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]; };
  const page = async (cookie, path = '/') => (await call('page', { cookie, path })).json();
  const save = async (cookie, path, fields = {}, items) => { const current = await page(cookie, path); return call('save', { cookie, path, body: { baseRevision: current.revision, fingerprint: current.fingerprint, fields, ...(items !== undefined ? { items } : {}) } }); };
  const publish = async (cookie, path = '/') => call('publish', { cookie, path, body: { baseRevision: (await page(cookie, path)).revision } });
  const live = async (path = '/') => (await siteHandler(new Request(base + path), { store })).text();
  return { store, handler, call, login, page, save, publish, live };
}

test('main navigation and homepage expose Gallery, Testimonials and Our Team directly', () => {
  const { document } = parseHTML(renderPage('/'));
  for (const [href, label] of [['/gallery', 'Gallery'], ['/testimonials', 'Testimonials'], ['/team', 'Our Team']]) {
    assert.equal(document.querySelector(`#main-nav > a[href="${href}"]`).textContent, label);
    assert.ok(document.querySelector(`main a[href="${href}"]`));
  }
  for (const id of ['gallery', 'our-team', 'testimonials']) assert.ok(document.getElementById(id), id);
  for (const selector of ['.testimonial-card', '.team-card']) {
    const cards = [...document.querySelectorAll(selector)]; assert.equal(cards.length, 3);
    for (const card of cards) { assert.equal(card.dataset.sample, 'true'); assert.ok(card.querySelector('.sample-card-label')); assert.ok(card.querySelector('img')); }
  }
  assert.equal(document.querySelectorAll('.sample-content-notice').length, 2);
});

test('editor fails closed before setup, requires authentication and rejects other origins', async () => {
  const disabled = createCmsHandler({ store: null, env: {} });
  const status = await (await disabled(new Request(base + '/api/cms'))).json();
  assert.equal(status.configured, false); assert.deepEqual(status.setup, { storageConfigured: false, passwordsConfigured: false });
  assert.equal((await disabled(new Request(base + '/api/cms?op=login', { method: 'POST', headers: { Origin: base } }))).status, 503);
  const f = fixture(); assert.equal((await f.call('page')).status, 401);
  const configured = await (await f.call('status')).json(); assert.deepEqual(configured.setup, { storageConfigured: true, passwordsConfigured: true });
  assert.ok(!JSON.stringify(configured).includes(env.CMS_OWNER_PASSWORD)); assert.ok(!JSON.stringify(configured).includes(env.CMS_EDITOR_PASSWORD));
  assert.equal((await f.call('login', { body: {}, origin: 'https://other.example' })).status, 403);
  assert.equal((await f.call('login', { body: null })).status, 400);
  assert.equal((await f.call('login', { body: { name: 'Visitor', password: 'incorrect' } })).status, 401);
  const owner = await f.login('owner');
  assert.equal((await f.call('page', { cookie: owner, path: '/missing' })).status, 404);
});

test('signed sessions expire, resist tampering and are revoked by password rotation', () => {
  const token = makeSession('Reviewer', 'owner', env, 1000);
  const request = value => new Request(base, { headers: { Cookie: `kalpavruksha_editor=${value}` } });
  assert.equal(readSession(request(token), env, 2000).role, 'owner');
  assert.equal(readSession(request(token + 'x'), env, 2000), null);
  assert.equal(readSession(request(token), env, 1000 + 8 * 3600000), null);
  assert.equal(readSession(request(token), { ...env, CMS_EDITOR_PASSWORD: 'rotated-editor-password' }, 2000), null);
});

test('team drafts remain private, only owner publishes, and text is escaped safely', async () => {
  const f = fixture(); const editor = await f.login('editor'); const owner = await f.login('owner');
  const page = await f.page(editor); const heading = page.catalog.find(field => field.label === 'Page heading');
  const text = '<script>alert("test")</script>';
  assert.equal((await f.save(editor, '/', { [heading.key]: text, 'meta-title': 'Approved review title' })).status, 200);
  assert.ok(!(await f.live()).includes('Approved review title'));
  const preview = await f.call('preview', { cookie: editor });
  assert.equal(preview.headers.get('x-frame-options'), 'SAMEORIGIN');
  const previewHtml = await preview.text(); assert.ok(previewHtml.includes('&lt;script&gt;')); assert.ok(!previewHtml.includes(text));
  assert.equal((await f.publish(editor)).status, 403);
  assert.equal((await f.publish(owner)).status, 200);
  const html = await f.live(); assert.ok(html.includes('<title>Approved review title</title>')); assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('data-cms-key=')); assert.ok(!html.includes('/editor-preview.js'));
});

test('stale team saves are rejected without overwriting the latest draft', async () => {
  const f = fixture(); const editor = await f.login('editor'); const stale = await f.page(editor);
  assert.equal((await f.save(editor, '/', { 'meta-title': 'The latest draft' })).status, 200);
  const response = await f.call('save', { cookie: editor, body: { baseRevision: stale.revision, fingerprint: stale.fingerprint, fields: { 'meta-title': 'Stale draft' } } });
  assert.equal(response.status, 409); assert.equal((await f.page(editor)).fields['meta-title'], 'The latest draft');
  const broken = await f.call('save', { cookie: editor, body: { baseRevision: (await f.page(editor)).revision, fingerprint: 'old-template', fields: {} } });
  assert.equal(broken.status, 409);
});

test('image uploads validate type and size, remain private until used publicly, and preserve crop and alt text', async () => {
  const f = fixture(); const owner = await f.login('owner');
  assert.equal((await f.call('upload', { cookie: owner, raw: Buffer.from('<svg onload="alert(1)"></svg>') })).status, 400);
  assert.equal((await f.call('upload', { cookie: owner, raw: Buffer.alloc(3 * 1024 * 1024 + 1) })).status, 413);
  const uploaded = await (await f.call('upload', { cookie: owner, raw: png })).json();
  const media = () => f.handler(new Request(base + uploaded.src));
  assert.equal((await media()).status, 404);
  const page = await f.page(owner, '/about'); const image = page.catalog.find(field => field.type === 'image');
  assert.equal((await f.save(owner, '/about', { [image.key]: { src: uploaded.src, alt: 'Our approved office photograph', position: '50% 0%' } })).status, 200);
  assert.equal((await media()).status, 404);
  assert.equal((await f.publish(owner, '/about')).status, 200);
  const response = await media(); assert.equal(response.headers.get('content-type'), 'image/png'); assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  const { document } = parseHTML(await f.live('/about')); const img = document.querySelector(`img[alt="Our approved office photograph"]`);
  assert.equal(img.getAttribute('src'), uploaded.src); assert.match(img.getAttribute('style'), /50% 0%/);
  assert.throws(() => validateChanges('/about', { [image.key]: { src: 'javascript:alert(1)', alt: 'Bad', position: '50% 50%' } }));
});

test('gallery entries and team profiles publish to both their page and homepage', async () => {
  const f = fixture(); const owner = await f.login('owner'); const uploaded = await (await f.call('upload', { cookie: owner, raw: png })).json();
  const gallery = [{ id: 'company-office', src: uploaded.src, title: 'Our office details', category: 'Wealth', alt: 'An approved detail photograph', caption: 'Photograph approved for the visual journal.', illustrative: false }];
  assert.equal((await f.save(owner, '/gallery', {}, gallery)).status, 200);
  assert.ok(!(await f.live()).includes('Our office details'));
  assert.equal((await f.publish(owner, '/gallery')).status, 200);
  assert.ok((await f.live('/gallery')).includes('Our office details')); assert.ok((await f.live()).includes('Our office details'));
  const member = { id: 'test-member', name: 'Test Member', role: 'Test Role', business: 'Test Business', bio: 'Test-only profile for automated verification.', src: uploaded.src, alt: 'Test portrait', consent: true, approved: true };
  assert.equal((await f.save(owner, '/team', {}, [member])).status, 200);
  assert.ok(!(await f.live('/team')).includes('Test Member'));
  assert.equal((await f.publish(owner, '/team')).status, 200);
  assert.ok((await f.live('/team')).includes('Test Member')); assert.ok((await f.live()).includes('Test Member'));
  assert.equal(compilePage('/').fingerprint, compilePage('/', { ...initialCollections, gallery, team: [member] }).fingerprint, 'collection edits preserve text/image field IDs');
});

test('testimonials require consent and approval, and owner can restore a previous draft without publishing it', async () => {
  const f = fixture(); const owner = await f.login('owner');
  const quote = { id: 'test-quote', name: 'Test Reviewer', business: 'Test relationship', quote: 'An automated test quote, never seeded on the website.', consent: false, approved: true };
  assert.equal((await f.save(owner, '/testimonials', {}, [quote])).status, 200);
  assert.equal((await f.publish(owner, '/testimonials')).status, 400);
  quote.consent = true; assert.equal((await f.save(owner, '/testimonials', {}, [quote])).status, 200);
  const firstVersion = (await f.page(owner, '/testimonials')).revision;
  assert.equal((await f.publish(owner, '/testimonials')).status, 200);
  assert.ok((await f.live()).includes(quote.quote));
  assert.equal((await f.save(owner, '/testimonials', {}, [])).status, 200);
  assert.equal((await f.publish(owner, '/testimonials')).status, 200);
  assert.ok(!(await f.live()).includes(quote.quote));
  const current = await f.page(owner, '/testimonials');
  assert.equal((await f.call('restore', { cookie: owner, path: '/testimonials', body: { baseRevision: current.revision, version: firstVersion } })).status, 200);
  assert.ok(!(await f.live()).includes(quote.quote), 'restoring only changes shared draft');
  assert.equal((await f.page(owner, '/testimonials')).items[0].quote, quote.quote);
  assert.equal((await f.publish(owner, '/testimonials')).status, 200);
  assert.ok((await f.live('/testimonials')).includes(quote.quote));
  assert.equal(compilePage('/').fingerprint, compilePage('/', { ...initialCollections, testimonials: [quote] }).fingerprint);
});

test('photo templates can be replaced with genuine content without publishing an unlabelled sample portrait', async () => {
  const f = fixture(); const owner = await f.login('owner');
  for (const path of ['/team', '/testimonials']) {
    const current = await f.page(owner, path); assert.equal(current.items.length, 3);
    assert.ok(current.items.every(item => item.sample && item.src));
    assert.equal((await f.save(owner, path, {}, current.items)).status, 200);
    assert.equal((await f.publish(owner, path)).status, 200, 'labelled templates are intentionally publishable');
    const item = { ...current.items[0], sample: false, consent: true, approved: true, name: 'Actual Test Person' };
    assert.equal((await f.save(owner, path, {}, [item])).status, 200);
    assert.equal((await f.publish(owner, path)).status, 400, 'AI portrait must remain labelled until replaced');
    const photo = await (await f.call('upload', { cookie: owner, raw: png })).json();
    item.src = photo.src; item.alt = 'Approved test portrait';
    assert.equal((await f.save(owner, path, {}, [item])).status, 200);
    assert.equal((await f.publish(owner, path)).status, 200);
    const { document } = parseHTML(await f.live(path));
    const card = document.querySelector(path === '/team' ? '.team-card' : '.testimonial-card');
    assert.equal(card.dataset.sample, 'false'); assert.equal(card.querySelector('.sample-card-label'), null);
    assert.equal(card.querySelector('img').getAttribute('src'), photo.src);
    assert.ok(card.textContent.includes('Actual Test Person'));
    assert.equal((await f.handler(new Request(base + photo.src))).status, 200, 'published testimonial photos are accessible');
    assert.equal(document.querySelector('.sample-content-notice'), null);
  }
});

test('sign-in attempt limits persist across independent function instances', async () => {
  const f = fixture();
  for (let i = 0; i < 8; i++) assert.equal((await f.call('login', { body: { name: 'Visitor', password: 'incorrect' } })).status, 401);
  const anotherInstance = createCmsHandler({ store: f.store, env });
  const response = await anotherInstance(new Request(base + '/api/cms?op=login', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Visitor', password: env.CMS_OWNER_PASSWORD }) }));
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '900');
});

test('site-wide text and logos persist across sessions and publish consistently across pages', async () => {
  const f = fixture(); const owner = await f.login('owner'); const editor = await f.login('editor');
  const settings = await f.page(editor, '/_site');
  const footerText = settings.catalog.find(field => field.type === 'text' && field.original.includes('A diversified business ecosystem connecting'));
  const navigation = settings.catalog.find(field => field.type === 'text' && field.original === 'The Company ');
  assert.ok(footerText); assert.ok(navigation);
  const logo = settings.catalog.find(field => field.type === 'image' && field.original.endsWith('/kalpavruksha-logo.png'));
  const photo = await (await f.call('upload', { cookie: editor, raw: png })).json();
  const fields = { [footerText.key]: 'Shared company introduction for automated testing.', [navigation.key]: 'Our Company ', [logo.key]: { src: photo.src, alt: 'Approved company logo', position: '50% 50%' } };
  assert.equal((await f.save(editor, '/_site', fields)).status, 200);
  const newInstance = createCmsHandler({ store: f.store, env });
  const loaded = await (await newInstance(new Request(base + '/api/cms?op=page&page=%2F_site', { headers: { Cookie: editor } }))).json();
  assert.equal(loaded.fields[footerText.key], fields[footerText.key]);
  assert.ok(!(await f.live('/about')).includes(fields[footerText.key]));
  assert.equal((await f.publish(editor, '/_site')).status, 403);
  assert.equal((await f.publish(owner, '/_site')).status, 200);
  for (const path of ['/', '/about', '/wealth', '/gallery', '/team']) {
    const html = await f.live(path); const { document } = parseHTML(html);
    assert.ok(document.querySelector('footer').textContent.includes(fields[footerText.key]));
    assert.ok(document.querySelector('header').textContent.includes('Our Company'));
    assert.equal(document.querySelector('header .brand img').getAttribute('src'), photo.src);
    assert.equal(document.querySelector('footer .brand img').getAttribute('src'), photo.src);
    assert.ok(!/data-cms-(?:key|runs|site-key|site-runs)=/.test(html), 'public pages have no editing markers');
  }
  assert.equal((await f.handler(new Request(base + photo.src))).status, 200);
});

test('extra page text edits preserve native date and caption element structure', async () => {
  const f = fixture(); const owner = await f.login('owner'); const page = await f.page(owner);
  const date = page.catalog.find(field => field.key.startsWith('page-text-') && field.original === '15');
  assert.ok(date, 'office date is editable');
  const before = parseHTML(renderPage('/')).document.querySelector('.office-date strong').outerHTML;
  assert.equal((await f.save(owner, '/', { [date.key]: '21' })).status, 200);
  assert.equal((await f.publish(owner)).status, 200);
  const { document } = parseHTML(await f.live()); const after = document.querySelector('.office-date strong').outerHTML;
  assert.equal(after, before.replace('>15<', '>21<'), 'no added wrappers or changed child spans');
});

test('authenticated review browses saved drafts and site-wide content while public pages remain unchanged', async () => {
  const f = fixture(); const editor = await f.login('editor');
  const anonymous = await f.call('review'); assert.equal(anonymous.status, 303); assert.match(anonymous.headers.get('location'), /\/admin\?next=/);
  const page = await f.page(editor); const heading = page.catalog.find(field => field.label === 'Page heading');
  assert.equal((await f.save(editor, '/', { [heading.key]: 'Shared review heading' })).status, 200);
  const site = await f.page(editor, '/_site'); const footer = site.catalog.find(field => field.type === 'text' && field.original.includes('A diversified business ecosystem connecting'));
  assert.equal((await f.save(editor, '/_site', { [footer.key]: 'Shared review footer' })).status, 200);
  const response = await f.call('review', { cookie: editor }); assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const html = await response.text(); assert.ok(html.includes('Shared review heading')); assert.ok(html.includes('Shared review footer'));
  assert.ok(html.includes('Saved team draft')); assert.ok(html.includes('/review?page=%2Fabout'));
  assert.ok(!html.includes('data-cms-key=')); assert.ok(!html.includes('/editor-preview.js'));
  const publicHtml = await f.live(); assert.ok(!publicHtml.includes('Shared review heading')); assert.ok(!publicHtml.includes('Shared review footer'));
});

test('visual editing bridge selects site-wide text and changes native text nodes without damaging nested content', async () => {
  const { document, Event } = parseHTML(renderEditedPage('/', {}, { preview: true }));
  const handlers = {}; const messages = [];
  const parent = { location: { origin: base }, postMessage: message => messages.push(message) };
  runInNewContext(await readFile(new URL('../public/editor-preview.js', import.meta.url), 'utf8'), {
    document, parent, window: { addEventListener: (name, handler) => { handlers[name] = handler; } }, location: { href: base }, URL, matchMedia: () => ({ matches: true }),
  });
  const date = compilePage('/').fields.find(field => field.key.startsWith('page-text-') && field.original === '15');
  const strong = document.querySelector('.office-date strong'); const month = strong.querySelector('span').outerHTML;
  handlers.message({ origin: base, source: parent, data: { type: 'cms-change', key: date.key, value: '28' } });
  assert.ok(strong.textContent.startsWith('28')); assert.equal(strong.querySelector('span').outerHTML, month);
  handlers.message({ origin: 'https://other.example', source: parent, data: { type: 'cms-change', key: date.key, value: '99' } });
  assert.ok(strong.textContent.startsWith('28'));
  document.querySelector('header .nav-group summary').dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
  assert.equal(messages.at(-1).scope, 'site');
  assert.ok(compilePage('/_site').fields.some(field => field.key === messages.at(-1).key));
});

test('owner can publish the reviewed website together, while stale snapshots and invalid entries publish nothing', async () => {
  const f = fixture(); const owner = await f.login('owner'); const editor = await f.login('editor');
  await f.save(editor, '/', { 'meta-title': 'Reviewed home title' });
  await f.save(editor, '/about', { 'meta-title': 'Reviewed about title' });
  const snapshot = async () => Object.fromEntries((await (await f.call('overview', { cookie: owner })).json()).pending.map(page => [page.path, page.revision]));
  const stale = await snapshot(); assert.equal(Object.keys(stale).length, 2);
  assert.equal((await f.call('publish-all', { cookie: editor, body: { revisions: stale } })).status, 403);
  await f.save(editor, '/about', { 'meta-title': 'Newer reviewed about title' });
  assert.equal((await f.call('publish-all', { cookie: owner, body: { revisions: stale } })).status, 409);
  assert.ok(!(await f.live()).includes('Reviewed home title'));
  const quote = { id: 'unapproved-permission', name: 'Test Reviewer', business: 'Test relationship', quote: 'Test-only quote', approved: true, consent: false };
  await f.save(editor, '/testimonials', {}, [quote]);
  assert.equal((await f.call('publish-all', { cookie: owner, body: { revisions: await snapshot() } })).status, 400);
  assert.ok(!(await f.live()).includes('Reviewed home title'), 'validation failure leaves all public pages unchanged');
  await f.save(editor, '/testimonials', {}, []);
  const response = await f.call('publish-all', { cookie: owner, body: { revisions: await snapshot() } });
  assert.equal(response.status, 200); assert.equal((await response.json()).count, 3);
  assert.ok((await f.live()).includes('Reviewed home title')); assert.ok((await f.live('/about')).includes('Newer reviewed about title'));
  assert.equal(Object.keys(await snapshot()).length, 0);
});

test('local content storage survives a new instance and rejects conflicting writers', async t => {
  const root = resolve('test-results'); await mkdir(root, { recursive: true }); const directory = await mkdtemp(resolve(root, 'cms-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const localEnv = { CMS_LOCAL_STORAGE: 'true', CMS_LOCAL_DIRECTORY: directory }; const store = makeStore(localEnv);
  assert.equal(makeStore({ ...localEnv, VERCEL: '1' }), null); assert.equal(makeStore({ ...localEnv, NODE_ENV: 'production' }), null);
  await store.write('cms/state.json', 'first'); const record = await makeStore(localEnv).read('cms/state.json'); assert.equal(record.data.toString(), 'first');
  const results = await Promise.allSettled([store.write('cms/state.json', 'second', record.etag), store.write('cms/state.json', 'third', record.etag)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.ok(results.find(result => result.status === 'rejected').reason instanceof ConflictError);
  await assert.rejects(store.read('cms/../../.env'));
});

test('private storage recognizes Vercel OIDC connections as well as read-write tokens', async () => {
  assert.equal(makeStore({ BLOB_STORE_ID: 'store_test', VERCEL_OIDC_TOKEN: 'test-only-token' }).kind, 'blob');
  assert.equal(makeStore({ BLOB_STORE_ID: 'store_test', VERCEL: '1' }).kind, 'blob', 'Vercel supplies OIDC through request context');
  assert.equal(makeStore({ BLOB_READ_WRITE_TOKEN: 'test-only-token' }).kind, 'blob');
  assert.equal(makeStore({ BLOB_STORE_ID: 'store_test' }), null);
  const handler = createCmsHandler({ env: { ...env, BLOB_STORE_ID: 'store_test', VERCEL_OIDC_TOKEN: 'test-only-token' } });
  const status = await (await handler(new Request(base + '/api/cms?op=status'))).json();
  assert.equal(status.configured, true); assert.equal(status.setup.storageConfigured, true);
});

test('Node adapter supports authenticated JSON editing over HTTP', async t => {
  const f = fixture(); const server = createServer((request, response) => handleWebRequest(request, response, f.handler));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(origin + '/api/cms?op=login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'HTTP Reviewer', password: env.CMS_OWNER_PASSWORD }) });
  assert.equal(login.status, 200); const cookie = login.headers.get('set-cookie').split(';')[0];
  const preview = await fetch(origin + '/api/cms?op=preview&page=%2Fteam', { headers: { Cookie: cookie } });
  assert.equal(preview.status, 200); assert.match(await preview.text(), /Our team/);
  assert.match(preview.headers.get('content-security-policy'), /frame-ancestors 'self'/);
});
