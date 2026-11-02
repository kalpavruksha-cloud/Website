import { readFileSync } from 'node:fs';

// A deliberately small environment loader; existing process variables take priority.
try {
  const file = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of file.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }

const rawUrl = new URL(process.env.SITE_URL || 'http://localhost:3000');
if (!['http:', 'https:'].includes(rawUrl.protocol)) throw new Error('SITE_URL must be an HTTP(S) URL');
export const config = {
  port: Number(process.env.PORT || 3000),
  origin: rawUrl.origin,
  publicSite: process.env.PUBLIC_SITE === 'true',
  production: process.env.NODE_ENV === 'production',
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
};
