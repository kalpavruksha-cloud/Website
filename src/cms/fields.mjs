import { createHash } from 'node:crypto';
import { brand } from '../brand.mjs';
import { businesses } from '../content.mjs';

const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 14);
const decode = (element, attribute) => JSON.parse(element.getAttribute(attribute) || '[]');
const excluded = 'script,style,svg,textarea,[aria-hidden="true"],[data-collection-item],[data-cms-key],.menu-toggle,#scene-number,#gallery-status,#form-status,.honeypot';

// Annotate original text nodes without adding spans: dates, nested links and
// layout selectors retain their existing element structure.
export function annotateText(root, fields, scope = 'page', counts = new Map()) {
  const attribute = scope === 'site' ? 'data-cms-site-runs' : 'data-cms-runs';
  const visit = element => {
    if (element.matches(excluded)) return;
    const runs = [];
    [...element.childNodes].forEach((node, index) => {
      if (node.nodeType === 3 && node.textContent.trim()) {
        const original = node.textContent;
        const occurrence = counts.get(original) || 0; counts.set(original, occurrence + 1);
        const key = `${scope}-text-${hash(original)}-${occurrence}`;
        runs.push({ key, index });
        fields.push({ key, type: 'text', label: `${scope === 'site' ? element.closest('header') ? 'Header' : 'Footer' : 'Page text'} · ${element.tagName.toLowerCase()}`, original, maxLength: 6000 });
      } else if (node.nodeType === 1) visit(node);
    });
    if (runs.length) element.setAttribute(attribute, JSON.stringify(runs));
  };
  visit(root);
}

export function annotateSite(document) {
  const fields = []; const counts = new Map();
  for (const root of document.querySelectorAll('header.site-header,footer.site-footer')) annotateText(root, fields, 'site', counts);
  const logos = new Set([brand.logoPath, ...businesses.map(business => business.logo)]);
  const seen = new Set();
  for (const img of document.querySelectorAll('img[src]')) {
    const original = img.getAttribute('src'); if (!logos.has(original)) continue;
    const key = `site-logo-${hash(original)}`; img.setAttribute('data-cms-site-key', key);
    if (!seen.has(key)) { seen.add(key); fields.push({ key, type: 'image', label: `Site-wide logo · ${original.split('/').at(-1).replace(/\.[^.]+$/, '').replaceAll('-', ' ')}`, original, originalAlt: img.getAttribute('alt') || '' }); }
  }
  return fields;
}

export function applyRuns(document, changes, scope = 'page') {
  const attribute = scope === 'site' ? 'data-cms-site-runs' : 'data-cms-runs';
  for (const element of document.querySelectorAll(`[${attribute}]`)) {
    for (const { key, index } of decode(element, attribute)) {
      if (typeof changes[key] === 'string' && element.childNodes[index]?.nodeType === 3) element.childNodes[index].textContent = changes[key];
    }
  }
}

export function applySiteImages(document, changes, mediaPattern) {
  for (const image of document.querySelectorAll('[data-cms-site-key]')) {
    const value = changes[image.getAttribute('data-cms-site-key')];
    if (!value || typeof value.src !== 'string' || (!mediaPattern.test(value.src) && !value.src.startsWith('/assets/'))) continue;
    image.setAttribute('src', value.src);
    if (image.getAttribute('alt')) image.setAttribute('alt', value.alt);
    image.style.objectPosition = value.position;
  }
}

export function stripEditorAttributes(document) {
  for (const element of document.querySelectorAll('[data-cms-key],[data-cms-runs],[data-cms-site-key],[data-cms-site-runs]')) {
    for (const attribute of ['data-cms-key', 'data-cms-runs', 'data-cms-site-key', 'data-cms-site-runs']) element.removeAttribute(attribute);
  }
}
