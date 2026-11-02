import { randomUUID } from 'node:crypto';
import { pages } from '../content.mjs';
import { initialCollections, samplePortraits } from '../collections.mjs';
import { compilePage, validateChanges, validateItems, renderEditedPage, mediaPattern } from './catalog.mjs';
import { makeStore, readState, ConflictError } from './storage.mjs';
import { credentialsReady, authenticate, makeSession, readSession, sessionCookie, requireOrigin, allowLogin } from './auth.mjs';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', ...extra } });
const error = (message, status) => Object.assign(new Error(message), { status });
const normalize = value => value?.fields ? value : { fields: {}, items: undefined, revision: null };
export function getCollections(state, draft = false) {
  const pick = path => normalize((draft ? state.pages[path]?.draft : null) || state.pages[path]?.published);
  return { gallery: pick('/gallery').items ?? initialCollections.gallery, testimonials: pick('/testimonials').items ?? initialCollections.testimonials, team: pick('/team').items ?? initialCollections.team };
}
async function boundedBody(request, limit = 400000) {
  if (Number(request.headers.get('content-length') || 0) > limit) throw error('This request is too large.', 413);
  const reader = request.body?.getReader(); if (!reader) return Buffer.alloc(0);
  let total = 0; const chunks = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > limit) { await reader.cancel(); throw error('This request is too large.', 413); } chunks.push(value); }
  return Buffer.concat(chunks);
}
async function readJSON(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw error('Send a valid editor request.', 415);
  try { const data = JSON.parse((await boundedBody(request)).toString('utf8')); if (!data || typeof data !== 'object' || Array.isArray(data)) throw error('Send a valid editor request.', 400); return data; } catch (caught) { if (caught.status) throw caught; throw error('The editor request could not be read.', 400); }
}
function imageType(data) {
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return ['png', 'image/png'];
  if (data.length > 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return ['jpg', 'image/jpeg'];
  if (data.length > 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return ['webp', 'image/webp'];
  return null;
}
async function validateMedia(store, fields, items) {
  const urls = new Set(Object.values(fields).filter(value => value && typeof value === 'object').map(value => value.src));
  for (const item of items || []) if (item.src) urls.add(item.src);
  for (const url of urls) { const match = mediaPattern.exec(url || ''); if (match && !(await store.read(`cms/media/${match[1]}`))) throw error('An uploaded image is missing. Upload it again before saving.', 400); }
}
export function createCmsHandler({ store: suppliedStore, env = process.env, now = Date.now } = {}) {
  return async function cmsHandler(request) {
    const url = new URL(request.url); const op = url.searchParams.get('op') || 'status';
    const store = suppliedStore === undefined ? makeStore(env) : suppliedStore;
    const ready = Boolean(store && credentialsReady(env)); const session = readSession(request, env, now());
    try {
      if (request.method === 'GET' && op === 'status') return json({ configured: ready, session: session ? { name: session.name, role: session.role } : null, pages: Object.entries(pages).map(([path, page]) => ({ path, title: page.eyebrow || 'Home' })) });
      if (request.method === 'POST') requireOrigin(request);
      if (op === 'logout' && request.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', request, true) });
      if (!ready && !(op === 'media' && request.method === 'GET' && store)) return json({ error: 'Editing is not enabled yet. The owner must connect private content storage and set the two editing passwords.' }, 503);
      if (op === 'login' && request.method === 'POST') {
        if (!(await allowLogin(request, store, env, now()))) return json({ error: 'Too many sign-in attempts. Please wait 15 minutes.' }, 429, { 'Retry-After': '900' });
        const data = await readJSON(request);
        if (!data || typeof data.name !== 'string' || data.name.trim().length < 2 || data.name.length > 60) throw error('Enter your name for the change history.', 400);
        const role = authenticate(data.password, env); if (!role) throw error('The editing password is incorrect.', 401);
        const name = data.name.trim(); return json({ ok: true, session: { name, role } }, 200, { 'Set-Cookie': sessionCookie(makeSession(name, role, env, now()), request) });
      }
      if (op === 'media' && request.method === 'GET') {
        const id = url.searchParams.get('id') || ''; if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(id)) throw error('Image not found.', 404);
        if (!session) {
          const { state } = await readState(store); const src = `/api/cms?op=media&id=${id}`;
          const publicReference = Object.entries(state.pages).some(([path, page]) => {
            const published = page.published;
            if (!published) return false;
            if (Object.values(published.fields || {}).some(value => value && typeof value === 'object' && value.src === src)) return true;
            return (published.items || []).some(item => item.src === src && (path === '/gallery' || (['/team', '/testimonials'].includes(path) && (item.sample || (item.approved && item.consent)))));
          });
          if (!publicReference) throw error('Image not found.', 404);
        }
        const record = await store.read(`cms/media/${id}`); if (!record) throw error('Image not found.', 404);
        const type = imageType(record.data); if (!type) throw error('Image not found.', 404);
        return new Response(new Uint8Array(record.data), { headers: { ...headers, 'Content-Type': type[1], 'Content-Security-Policy': "default-src 'none'; sandbox" } });
      }
      if (!session) throw error('Please sign in to the website editor.', 401);
      if (op === 'upload' && request.method === 'POST') {
        const data = await boundedBody(request, 3 * 1024 * 1024); const type = imageType(data);
        if (!type) throw error('Upload a PNG, JPEG or WebP image up to 3 MB. SVG uploads are not accepted.', 400);
        const id = `${randomUUID()}.${type[0]}`; await store.write(`cms/media/${id}`, data, null, type[1]);
        return json({ ok: true, src: `/api/cms?op=media&id=${id}` });
      }
      const path = url.searchParams.get('page') || '/'; if (!Object.hasOwn(pages, path)) throw error('Page not found.', 404);
      const { state, etag } = await readState(store); const page = state.pages[path] || {}; const draft = normalize(page.draft || page.published);
      const collections = getCollections(state, true);
      if (op === 'preview' && request.method === 'GET') return new Response(renderEditedPage(path, draft.fields, { preview: true, collections }), { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'self'; form-action 'none'" } });
      if (op === 'page' && request.method === 'GET') { const compiled = compilePage(path, collections); return json({ path, catalog: compiled.fields, fingerprint: compiled.fingerprint, fields: draft.fields, items: draft.items ?? initialCollections[path.slice(1)], revision: page.draft?.revision || null, publishedRevision: page.published?.revision || null, history: (page.history || []).map(({ fields, items, ...record }) => record) }); }
      if (request.method !== 'POST' || !['save', 'publish', 'restore', 'render'].includes(op)) throw error('Editor action not found.', 404);
      const data = await readJSON(request);
      if (op !== 'render' && data.baseRevision !== (page.draft?.revision || null)) throw new ConflictError();
      if (op === 'publish' || op === 'restore') { if (session.role !== 'owner') throw error('Only the site owner can publish or restore a version.', 403); }
      let next;
      if (op === 'save' || op === 'render') {
        const items = validateItems(path, data.items);
        const workingCollections = { ...collections, ...(path === '/gallery' ? { gallery: items } : path === '/testimonials' ? { testimonials: items } : path === '/team' ? { team: items } : {}) };
        if (data.fingerprint !== compilePage(path, collections).fingerprint) throw new ConflictError();
        const fields = validateChanges(path, data.fields, workingCollections); await validateMedia(store, fields, items);
        if (op === 'render') return new Response(renderEditedPage(path, fields, { preview: true, collections: workingCollections }), { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
        next = { fields, ...(items ? { items } : {}), revision: randomUUID(), updatedAt: new Date(now()).toISOString(), editor: session.name, note: typeof data.note === 'string' ? data.note.slice(0, 250) : '', kind: 'draft' };
      }
      if (op === 'restore') {
        const previous = data.version === 'original' ? { fields: {}, ...(Object.hasOwn(initialCollections, path.slice(1)) ? { items: initialCollections[path.slice(1)] } : {}) } : page.history?.find(record => record.revision === data.version);
        if (!previous) throw error('That version is no longer in the recent history.', 404);
        validateChanges(path, previous.fields, collections); validateItems(path, previous.items);
        next = { ...previous, revision: randomUUID(), updatedAt: new Date(now()).toISOString(), editor: session.name, note: 'Restored as a draft', kind: 'draft' };
      }
      const history = [...(page.draft ? [page.draft] : []), ...(page.history || [])].slice(0, 20);
      if (op === 'publish') {
        if (!page.draft) throw error('Save a draft before publishing.', 400);
        if (['/testimonials', '/team'].includes(path)) {
          if (page.draft.items?.some(item => !item.sample && item.approved && !item.consent)) throw error('Each approved testimonial or team profile requires permission to publish.', 400);
          if (page.draft.items?.some(item => !item.sample && samplePortraits.includes(item.src))) throw error('Replace the sample portrait or keep this entry labelled as a sample template.', 400);
        }
        state.pages[path] = { ...page, published: { ...page.draft, publishedAt: new Date(now()).toISOString(), publishedBy: session.name, kind: 'published' }, history: [...(page.published ? [page.published] : []), ...(page.history || [])].slice(0, 20) };
      } else state.pages[path] = { ...page, draft: next, history };
      await store.write('cms/state.json', JSON.stringify(state), etag);
      return json({ ok: true, revision: state.pages[path].draft.revision });
    } catch (caught) {
      if (caught instanceof ConflictError) return json({ error: caught.message }, 409);
      if (caught.status) return json({ error: caught.message }, caught.status);
      if (caught.message?.startsWith('Please ') || /Choose|page structure|too long|cannot|Invalid|too many|Too many|supported|uploaded|field|Use an|item ID/i.test(caught.message || '')) return json({ error: caught.message }, 400);
      console.error('CMS request failed:', caught.name || 'Error');
      return json({ error: 'The shared content service is unavailable. Your browser changes have not been saved. Please try again.' }, 503);
    }
  };
}
export const cmsHandler = createCmsHandler();
