import { createHash, createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { ConflictError } from './storage.mjs';

export const cookieName = 'kalpavruksha_editor';
const digest = value => createHash('sha256').update(value).digest();
const safeEqual = (a, b) => timingSafeEqual(digest(a), digest(b));
const signingKey = env => digest(`${env.CMS_OWNER_PASSWORD}\0${env.CMS_EDITOR_PASSWORD}\0kalpavruksha-editor-v1`);
export const credentialsReady = env => typeof env.CMS_OWNER_PASSWORD === 'string' && env.CMS_OWNER_PASSWORD.length >= 16 && typeof env.CMS_EDITOR_PASSWORD === 'string' && env.CMS_EDITOR_PASSWORD.length >= 16 && env.CMS_OWNER_PASSWORD !== env.CMS_EDITOR_PASSWORD;
export function credentialIssues(env) {
  const issues = [];
  for (const [key, label] of [['CMS_EDITOR_PASSWORD', 'Team'], ['CMS_OWNER_PASSWORD', 'Owner']]) {
    if (typeof env[key] !== 'string' || !env[key]) issues.push(`${label} password is missing.`);
    else if (env[key].length < 16) issues.push(`${label} password is shorter than 16 characters.`);
  }
  if (env.CMS_EDITOR_PASSWORD && env.CMS_OWNER_PASSWORD && env.CMS_EDITOR_PASSWORD === env.CMS_OWNER_PASSWORD) issues.push('Team and owner passwords must be different.');
  return issues;
}
export function authenticate(password, env) {
  if (!credentialsReady(env) || typeof password !== 'string' || password.length > 500) return null;
  const owner = safeEqual(password, env.CMS_OWNER_PASSWORD); const editor = safeEqual(password, env.CMS_EDITOR_PASSWORD);
  return owner ? 'owner' : editor ? 'editor' : null;
}
export function makeSession(name, role, env, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ name, role, exp: now + 8 * 60 * 60 * 1000, nonce: randomUUID() })).toString('base64url');
  return `${payload}.${createHmac('sha256', signingKey(env)).update(payload).digest('base64url')}`;
}
export function readSession(request, env, now = Date.now()) {
  if (!credentialsReady(env)) return null;
  const token = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!token || token.length > 2048) return null;
  if (token.split('.').length !== 2) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', signingKey(env)).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return ['owner', 'editor'].includes(session.role) && typeof session.name === 'string' && session.exp > now ? session : null;
  } catch { return null; }
}
export function sessionCookie(token, request, expired = false) {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${expired ? 0 : 28800}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export function requireOrigin(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) { const error = new Error('Open the editor on this website before making changes.'); error.status = 403; throw error; }
}
export async function allowLogin(request, store, env, now = Date.now()) {
  const ip = request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || 'local';
  const bucket = Math.floor(now / (15 * 60 * 1000));
  const id = createHmac('sha256', signingKey(env)).update(`${ip.split(',')[0].trim()}-${bucket}`).digest('hex');
  const key = `cms/auth/${id}.json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const record = await store.read(key); const count = record ? JSON.parse(record.data.toString()).count : 0;
    if (count >= 8) return false;
    try { await store.write(key, JSON.stringify({ count: count + 1 }), record?.etag ?? null); return true; }
    catch (error) { if (!(error instanceof ConflictError)) throw error; }
  }
  return false;
}
