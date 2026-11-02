import { parseHTML } from 'linkedom';
import { createHash } from 'node:crypto';
import { pages } from '../content.mjs';
import { renderPage } from '../render.mjs';
import { initialCollections, galleryCategories, samplePortraits } from '../collections.mjs';
import { siteTarget, isEditableTarget } from './targets.mjs';
import { annotateText, annotateSite, applyRuns, applySiteImages, stripEditorAttributes } from './fields.mjs';

export const mediaPattern = /^\/api\/cms\?op=media&id=([a-f0-9-]{36}\.(?:png|jpg|webp))$/;
const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 14);
const labels = { H1: 'Page heading', H2: 'Section heading', H3: 'Subheading', P: 'Paragraph', FIGCAPTION: 'Image caption', A: 'Button label', SPAN: 'Section label' };
const cache = new Map();
export function compilePage(path, collections = initialCollections) {
  if (!isEditableTarget(path)) throw new Error('Unknown page.');
  const cacheKey = `${path}:${hash(JSON.stringify(collections))}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const { document } = parseHTML(renderPage(path === siteTarget ? '/' : path, { collections }));
  const siteFields = annotateSite(document);
  if (path === siteTarget) {
    const result = { html: document.toString(), fields: siteFields, siteFields, fingerprint: hash(JSON.stringify(siteFields)) };
    cache.set(cacheKey, result); return result;
  }
  const fields = [];
  let index = 0;
  for (const block of document.querySelectorAll('main h1,main h2,main h3,main p,main figcaption,main .eyebrow,main .button')) {
    if (block.closest('[data-collection-item]') || block.closest('[data-cms-key]') || block.closest('[aria-hidden="true"]')) continue;
    const visit = parent => {
      for (const node of [...parent.childNodes]) {
        if (node.nodeType === 3 && node.textContent.trim()) {
          const original = node.textContent; const key = `text-${index++}-${hash(original)}`;
          const span = document.createElement('span'); span.setAttribute('data-cms-key', key); span.textContent = original; node.replaceWith(span);
          fields.push({ key, type: 'text', label: labels[block.tagName] || 'Text', original, maxLength: block.tagName === 'P' ? 6000 : 500 });
        } else if (node.nodeType === 1 && !node.hasAttribute('data-cms-key') && !node.closest('[aria-hidden="true"]') && !['SCRIPT', 'STYLE', 'SVG', 'BUTTON', 'INPUT', 'SELECT'].includes(node.tagName)) visit(node);
      }
    };
    visit(block);
  }
  for (const img of document.querySelectorAll('main img')) {
    if (img.closest('[data-collection-item]')) continue;
    const original = img.getAttribute('src') || img.getAttribute('data-scene-src'); if (!original) continue;
    const key = `image-${index++}-${hash(original)}`; img.setAttribute('data-cms-key', key);
    fields.push({ key, type: 'image', label: original.split('/').at(-1).replace(/\.[^.]+$/, '').replaceAll('-', ' '), original, originalAlt: img.getAttribute('alt') || '', ...(img.hasAttribute('data-cms-site-key') ? { siteKey: img.getAttribute('data-cms-site-key') } : {}) });
  }
  annotateText(document.querySelector('main'), fields);
  fields.unshift({ key: 'meta-title', type: 'meta', label: 'Search title', original: pages[path].title, maxLength: 160 }, { key: 'meta-description', type: 'meta', label: 'Search description', original: pages[path].description, maxLength: 400 });
  const result = { html: document.toString(), fields, siteFields, fingerprint: hash(JSON.stringify(fields)) };
  if (cache.size > 60) cache.clear(); cache.set(cacheKey, result); return result;
}
export function validateChanges(path, changes, collections = initialCollections) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Invalid page changes.');
  const { fields } = compilePage(path, collections); const byKey = new Map(fields.map(field => [field.key, field]));
  if (Object.keys(changes).length > fields.length) throw new Error('Too many fields.');
  const safe = {};
  for (const [key, value] of Object.entries(changes)) {
    const field = byKey.get(key); if (!field) throw new Error('The page structure has changed. Reload before saving.');
    if (field.type === 'image') {
      if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.src !== 'string' || (value.src !== field.original && !mediaPattern.test(value.src))) throw new Error('Choose an uploaded image or restore the original.');
      if (typeof value.alt !== 'string' || value.alt.length > 400) throw new Error('Image descriptions must be under 400 characters.');
      if (!['50% 50%', '50% 0%', '50% 100%', '0% 50%', '100% 50%'].includes(value.position)) throw new Error('Choose a supported image crop.');
      safe[key] = { src: value.src, alt: value.alt, position: value.position };
    } else {
      if (typeof value !== 'string' || !value.trim() || value.length > field.maxLength || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new Error(`${field.label} is empty, too long or contains invalid characters.`);
      safe[key] = value;
    }
  }
  return safe;
}
const bounded = (value, max, label, optional = false) => {
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) throw new Error(`Please check ${label}.`);
  return value.trim();
};
export function validateItems(path, items) {
  if (!['/gallery', '/testimonials', '/team'].includes(path)) { if (items !== undefined && items !== null) throw new Error('This page does not have a collection.'); return undefined; }
  if (!Array.isArray(items) || items.length > (path === '/gallery' ? 40 : 25)) throw new Error('Too many collection items.');
  const ids = new Set();
  return items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid collection item.');
    const id = bounded(item.id, 64, 'item ID'); if (!/^[a-zA-Z0-9-]+$/.test(id) || ids.has(id)) throw new Error('Invalid or duplicate item ID.'); ids.add(id);
    if (path === '/team') {
      const src = bounded(item.src || '', 200, 'an uploaded portrait', true);
      if (src && !mediaPattern.test(src) && !samplePortraits.includes(src)) throw new Error('Use an uploaded portrait or an original sample portrait.');
      return { id, name: bounded(item.name, 100, 'the team member’s name'), role: bounded(item.role, 120, 'the role'), business: bounded(item.business, 100, 'the business'), bio: bounded(item.bio, 1000, 'the introduction', true), src, alt: bounded(item.alt || '', 300, 'the portrait description', true), sample: item.sample === true, consent: item.consent === true, approved: item.approved === true };
    }
    if (path === '/gallery') {
      const src = bounded(item.src, 200, 'an uploaded image');
      if (!mediaPattern.test(src) && !initialCollections.gallery.some(original => original.src === src)) throw new Error('Use an uploaded image or an original gallery image.');
      if (!galleryCategories.includes(item.category)) throw new Error('Choose a gallery category.');
      return { id, title: bounded(item.title, 120, 'the photo title'), category: item.category, src, alt: bounded(item.alt, 300, 'the image description'), caption: bounded(item.caption, 500, 'the caption', true), illustrative: item.illustrative !== false };
    }
    const src = bounded(item.src || '', 200, 'the portrait', true);
    if (src && !mediaPattern.test(src) && !samplePortraits.includes(src)) throw new Error('Use an uploaded portrait or an original sample portrait.');
    return { id, name: bounded(item.name, 100, 'the person’s name'), role: bounded(item.role || '', 120, 'the designation or relationship', true), business: bounded(item.business, 100, 'the business'), quote: bounded(item.quote, 1500, 'the testimonial'), src, alt: bounded(item.alt || '', 300, 'the portrait description', true), sample: item.sample === true, consent: item.consent === true, approved: item.approved === true };
  });
}
export function renderEditedPage(path, changes = {}, { preview = false, collections = initialCollections, siteFields = {}, review = false } = {}) {
  const compiled = compilePage(path, collections); const { document } = parseHTML(compiled.html); const known = new Map(compiled.fields.map(field => [field.key, field]));
  for (const element of document.querySelectorAll('[data-cms-key]')) {
    const key = element.getAttribute('data-cms-key'); const field = known.get(key); const value = changes[key];
    if (value !== undefined && field.type === 'text' && typeof value === 'string') element.textContent = value;
    if (value && field.type === 'image' && (value.src === field.original || mediaPattern.test(value.src))) {
      if (element.hasAttribute('data-scene-src')) element.setAttribute('data-scene-src', value.src); else element.setAttribute('src', value.src);
      element.setAttribute('alt', value.alt); element.style.objectPosition = value.position;
    }
  }
  applyRuns(document, changes);
  const shared = path === siteTarget ? changes : siteFields;
  applyRuns(document, shared, 'site'); applySiteImages(document, shared, mediaPattern);
  if (!preview) stripEditorAttributes(document);
  if (typeof changes['meta-title'] === 'string') { document.querySelector('title').textContent = changes['meta-title']; document.querySelector('meta[property="og:title"]').setAttribute('content', changes['meta-title']); }
  if (typeof changes['meta-description'] === 'string') { document.querySelector('meta[name="description"]').setAttribute('content', changes['meta-description']); document.querySelector('meta[property="og:description"]').setAttribute('content', changes['meta-description']); }
  if (preview) {
    document.querySelector('meta[name="robots"]').setAttribute('content', 'noindex,nofollow');
    const script = document.createElement('script'); script.src = '/editor-preview.js?v=full-site-editor'; script.defer = true;
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/editor-preview.css?v=full-site-editor';
    document.head.appendChild(style); document.body.appendChild(script); document.body.setAttribute('data-cms-preview', 'true');
  }
  if (review) {
    document.querySelector('meta[name="robots"]').setAttribute('content', 'noindex,nofollow');
    const banner = document.createElement('aside'); banner.className = 'saved-review-banner';
    banner.innerHTML = '<strong>Saved team draft</strong><span>Review mode · These changes are not published.</span><a href="/admin">Return to editor</a>';
    document.body.prepend(banner);
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/review.css'; document.head.appendChild(style);
    for (const anchor of document.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href');
      if (href?.startsWith('/') && href !== '/admin') { const target = new URL(href, 'https://review.example'); if (Object.hasOwn(pages, target.pathname)) anchor.setAttribute('href', `/review?page=${encodeURIComponent(target.pathname)}${target.hash}`); }
    }
  }
  return document.toString();
}
