import { pages } from '../content.mjs';
import { renderPage, renderNotFound } from '../render.mjs';
import { makeStore, readState } from './storage.mjs';
import { getCollections } from './service.mjs';
import { renderEditedPage } from './catalog.mjs';

export async function siteHandler(request, { store = makeStore() } = {}) {
  const url = new URL(request.url); const path = url.searchParams.get('path') || url.pathname;
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const exists = Object.hasOwn(pages, path); let html;
  if (!exists) html = renderNotFound();
  else if (!store) html = renderPage(path);
  else {
    try { const { state } = await readState(store); html = renderEditedPage(path, state.pages[path]?.published?.fields || {}, { collections: getCollections(state) }); }
    catch { return new Response('The website content is temporarily unavailable. Please try again shortly.', { status: 503, headers: { 'Retry-After': '30', 'Content-Type': 'text/plain; charset=utf-8' } }); }
  }
  return new Response(request.method === 'HEAD' ? null : html, { status: exists ? 200 : 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY' } });
}
