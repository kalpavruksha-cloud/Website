import { contactCategories } from './content.mjs';
import { config } from './config.mjs';

export function contactAvailable(env = process.env) {
  return Boolean(env.RESEND_API_KEY && env.CONTACT_FROM && env.CONTACT_TO &&
    (env.NODE_ENV !== 'production' || (env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY)));
}

export function validateEnquiry(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'Please provide a valid enquiry.' };
  const get = key => typeof data[key] === 'string' ? data[key].trim() : '';
  if (get('website')) return { error: 'The enquiry could not be accepted.' };
  const enquiry = { fullName: get('fullName'), mobile: get('mobile'), email: get('email'), business: get('business'), message: get('message') };
  if (enquiry.fullName.length < 2 || enquiry.fullName.length > 100 || /[\x00-\x1f\x7f]/.test(enquiry.fullName)) return { error: 'Please enter a name between 2 and 100 characters.' };
  if (!/^[+\d ()-]{7,24}$/.test(enquiry.mobile) || enquiry.mobile.replace(/\D/g, '').length < 7) return { error: 'Please enter a valid contact number.' };
  if (enquiry.email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(enquiry.email)) return { error: 'Please enter a valid email address.' };
  if (!contactCategories.includes(enquiry.business)) return { error: 'Please select a business of interest.' };
  if (enquiry.message.length < 10 || enquiry.message.length > 3000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(enquiry.message)) return { error: 'Please enter a message between 10 and 3,000 characters.' };
  if (data.consent !== true && data.consent !== 'on') return { error: 'Consent is required to send your enquiry.' };
  return { enquiry };
}

export function createRateLimiter({ limit = 5, windowMs = 15 * 60 * 1000, maxClients = 5000, now = Date.now } = {}) {
  const clients = new Map();
  return {
    allow(key) {
      const time = now();
      for (const [client, entry] of clients) if (entry.reset <= time) clients.delete(client);
      let entry = clients.get(key);
      if (!entry) {
        if (clients.size >= maxClients) return false;
        entry = { count: 0, reset: time + windowMs };
        clients.set(key, entry);
      }
      if (entry.count >= limit) return false;
      entry.count++;
      return true;
    },
  };
}

export async function deliverEnquiry(enquiry, { token, ip, fetcher = fetch, env = process.env } = {}) {
  if (!contactAvailable(env)) return { status: 503, error: 'Online enquiry delivery is not configured yet. Please try again once the contact channel is available.' };
  if (env.TURNSTILE_SECRET_KEY) {
    if (typeof token !== 'string' || !token || token.length > 2048) return { status: 400, error: 'Please complete the anti-spam verification.' };
    try {
      const verification = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip || '' }), signal: AbortSignal.timeout(10000),
      });
      const result = await verification.json();
      if (!verification.ok || !result.success || result.hostname !== new URL(config.origin).hostname) return { status: 400, error: 'Anti-spam verification could not be confirmed. Please try again.' };
    } catch { return { status: 502, error: 'The anti-spam service is unavailable. Please try again later.' }; }
  }
  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.CONTACT_FROM, to: [env.CONTACT_TO], reply_to: enquiry.email, subject: `Website enquiry: ${enquiry.business}`, text: `Kalpavruksha website enquiry\n\nName: ${enquiry.fullName}\nMobile: ${enquiry.mobile}\nEmail: ${enquiry.email}\nBusiness: ${enquiry.business}\n\n${enquiry.message}\n\nConsent to respond: confirmed` }), signal: AbortSignal.timeout(12000),
    });
    const result = await response.json();
    if (!response.ok || typeof result.id !== 'string' || !result.id) return { status: 502, error: 'The email service did not accept your enquiry. Please try again later.' };
    return { status: 200, ok: true };
  } catch { return { status: 502, error: 'Delivery could not be confirmed. Please wait before trying again to avoid a duplicate enquiry.' }; }
}
