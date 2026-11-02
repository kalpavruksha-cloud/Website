import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.mjs';
import { pages } from './src/content.mjs';
import { renderPage, renderNotFound } from './src/render.mjs';
import { contactAvailable, validateEnquiry, createRateLimiter, deliverEnquiry } from './src/contact.mjs';
import { cmsHandler } from './src/cms/service.mjs';
import { siteHandler } from './src/cms/site.mjs';
import { makeStore } from './src/cms/storage.mjs';
import { handleWebRequest } from './src/cms/node-adapter.mjs';

const publicDir = resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const types = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.png': 'image/png' };
export const sitemap = () => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(pages).map(path => `<url><loc>${config.origin}${path}</loc></url>`).join('')}</urlset>`;
export const robots = () => `User-agent: *\n${config.publicSite ? 'Allow: /\nDisallow: /api/' : 'Disallow: /'}\nSitemap: ${config.origin}/sitemap.xml\n`;
export function createApp({ deliver = deliverEnquiry, limiter = createRateLimiter() } = {}) {
  return createServer(async (request, response) => {
    const production = process.env.NODE_ENV === 'production';
    const headers = {
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
      ...(production ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
      ...(!config.publicSite ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
    };
    const send = (status, body, type = 'text/html; charset=utf-8', extra = {}) => {
      response.writeHead(status, { ...headers, 'Content-Type': type, ...extra });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    const json = (status, data, extra = {}) => send(status, JSON.stringify(data), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store', ...extra });
    let path;
    try { path = decodeURIComponent(new URL(request.url, config.origin).pathname); }
    catch { send(400, 'Invalid request', 'text/plain'); return; }
    if (path === '/api/cms') {
      try { await handleWebRequest(request, response, cmsHandler); } catch { if (!response.headersSent) json(500, { error: 'The editor service could not process this request.' }); }
      return;
    }
    if (path === '/review') {
      await handleWebRequest(request, response, req => { const target = new URL(req.url); target.searchParams.set('op', 'review'); return cmsHandler(new Request(target, req)); }); return;
    }
    if (path === '/admin' || path === '/admin/') {
      if (!['GET', 'HEAD'].includes(request.method)) { send(405, 'Method not allowed', 'text/plain', { Allow: 'GET, HEAD' }); return; }
      send(200, await readFile(resolve(publicDir, 'admin.html')), undefined, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" }); return;
    }
    if (pages[path] && makeStore()) { await handleWebRequest(request, response, req => siteHandler(req)); return; }
    if (path === '/api/contact' && request.method === 'POST') {
      if (request.headers.origin !== config.origin) { json(403, { error: 'The enquiry must be sent from this website.' }); return; }
      if (!request.headers['content-type']?.startsWith('application/json')) { json(415, { error: 'Please use the website enquiry form.' }); return; }
      const ip = process.env.TRUST_PROXY === 'true' ? (request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.socket.remoteAddress) : request.socket.remoteAddress;
      if (!limiter.allow(ip)) { json(429, { error: 'Too many enquiries. Please wait 15 minutes before trying again.' }, { 'Retry-After': '900' }); return; }
      try {
        let size = 0;
        const chunks = [];
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 16384) { json(413, { error: 'This enquiry is too large.' }); return; }
          chunks.push(chunk);
        }
        let data;
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { json(400, { error: 'The enquiry could not be read. Please try again.' }); return; }
        const { enquiry, error } = validateEnquiry(data);
        if (error) { json(400, { error }); return; }
        const result = await deliver(enquiry, { token: data['cf-turnstile-response'], ip });
        json(result.status, result.ok ? { ok: true } : { error: result.error });
      } catch { if (!response.headersSent) json(500, { error: 'Your enquiry could not be processed. Please try again later.' }); }
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) { send(405, 'Method not allowed', 'text/plain', { Allow: path === '/api/contact' ? 'POST' : 'GET, HEAD' }); return; }
    if (path === '/api/contact-status') { json(200, { available: contactAvailable() }); return; }
    if (path === '/sitemap.xml') { send(200, sitemap(), 'application/xml; charset=utf-8'); return; }
    if (path === '/robots.txt') { send(200, robots(), 'text/plain; charset=utf-8'); return; }
    if (path.length > 1 && path.endsWith('/')) { send(308, '', 'text/plain', { Location: path.replace(/\/+$/, '') }); return; }
    if (pages[path]) { send(200, renderPage(path, { deliveryAvailable: contactAvailable() }), undefined, { 'Cache-Control': 'no-cache' }); return; }
    const target = resolve(publicDir, `.${path}`);
    if (target.startsWith(publicDir + sep) && !path.includes('\0') && !path.includes('\\') && types[extname(target)]) {
      try { send(200, await readFile(target), types[extname(target)], { 'Cache-Control': 'public, max-age=86400' }); return; }
      catch (error) { if (!['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code)) { send(500, 'Unable to load resource', 'text/plain'); return; } }
    }
    send(404, renderNotFound());
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createApp();
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.listen(config.port, '0.0.0.0', () => console.log(`Kalpavruksha local preview: http://localhost:${config.port}`));
}
