import { get, put } from '@vercel/blob';
import { readFile, mkdir, writeFile, open, rename, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

export class ConflictError extends Error { constructor() { super('Another teammate saved changes. Reload the latest draft before saving.'); this.status = 409; } }
const etag = body => createHash('sha256').update(body).digest('hex');
const safeKey = key => /^cms\/[a-zA-Z0-9/._-]+$/.test(key) && !key.split('/').includes('..');
export function makeStore(env = process.env) {
  // On Vercel the SDK can obtain OIDC from the request context even when
  // VERCEL_OIDC_TOKEN is absent from process.env.
  const oidcReady = Boolean(env.BLOB_STORE_ID && (env.VERCEL || env.VERCEL_OIDC_TOKEN));
  if (oidcReady || env.BLOB_READ_WRITE_TOKEN) {
    // Let the SDK read and refresh Vercel's OIDC token itself. Passing that
    // short-lived token explicitly would disable its automatic refresh.
    const options = oidcReady ? { storeId: env.BLOB_STORE_ID, access: 'private' } : { token: env.BLOB_READ_WRITE_TOKEN, access: 'private' };
    return {
      kind: 'blob',
      async read(key) {
        if (!safeKey(key)) throw new Error('Invalid storage key');
        const result = await get(key, { ...options, useCache: false });
        if (!result) return null;
        return { data: Buffer.from(await new Response(result.stream).arrayBuffer()), etag: result.blob.etag, type: result.blob.contentType };
      },
      async write(key, data, expected = null, type = 'application/json') {
        if (!safeKey(key)) throw new Error('Invalid storage key');
        try {
          return await put(key, data, { ...options, addRandomSuffix: false, allowOverwrite: expected !== null, ...(expected !== null ? { ifMatch: expected } : {}), contentType: type, cacheControlMaxAge: 60 });
        } catch (error) {
          if (error.name === 'BlobPreconditionFailedError' || /already exists/i.test(error.message)) throw new ConflictError();
          throw error;
        }
      },
    };
  }
  if (env.CMS_LOCAL_STORAGE === 'true' && !env.VERCEL && env.NODE_ENV !== 'production') {
    const root = resolve(env.CMS_LOCAL_DIRECTORY || fileURLToPath(new URL('../../.cms-data/', import.meta.url)));
    const target = key => { if (!safeKey(key)) throw new Error('Invalid storage key'); return resolve(root, key); };
    return {
      kind: 'local',
      async read(key) { try { const data = await readFile(target(key)); return { data, etag: etag(data) }; } catch (error) { if (error.code === 'ENOENT') return null; throw error; } },
      async write(key, data, expected = null) {
        const path = target(key); await mkdir(dirname(path), { recursive: true });
        let lock;
        try { lock = await open(`${path}.lock`, 'wx'); } catch (error) { if (error.code === 'EEXIST') throw new ConflictError(); throw error; }
        const temp = `${path}.${randomUUID()}.tmp`;
        try {
          let existing = null; try { existing = etag(await readFile(path)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
          if (existing !== expected) throw new ConflictError();
          await writeFile(temp, data); await rename(temp, path); return { etag: etag(data) };
        } finally { await lock.close(); await unlink(`${path}.lock`); await unlink(temp).catch(() => {}); }
      },
    };
  }
  return null;
}
export const freshState = () => ({ version: 1, pages: {} });
export async function readState(store) {
  const record = await store.read('cms/state.json');
  return { state: record ? JSON.parse(record.data.toString('utf8')) : freshState(), etag: record?.etag ?? null };
}
