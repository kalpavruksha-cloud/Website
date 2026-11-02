const parentOrigin = parent.location.origin;
let selected;
document.addEventListener('click', event => {
  const field = event.target.closest('[data-cms-key]');
  if (field) { event.preventDefault(); event.stopImmediatePropagation(); parent.postMessage({ type: 'cms-select', key: field.dataset.cmsKey }, parentOrigin); return; }
  const anchor = event.target.closest('a');
  if (anchor) { event.preventDefault(); event.stopImmediatePropagation(); const url = new URL(anchor.href, location.href); if (url.origin === parentOrigin) parent.postMessage({ type: 'cms-navigate', path: url.pathname }, parentOrigin); }
}, true);
document.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); }, true);
window.addEventListener('message', event => {
  if (event.origin !== parentOrigin || event.source !== parent || !event.data) return;
  const { type, key, value } = event.data;
  const element = [...document.querySelectorAll('[data-cms-key]')].find(node => node.dataset.cmsKey === key);
  if (type === 'cms-focus' && element) {
    const scene = element.closest('[data-scene-image]');
    if (scene) document.querySelector(`[data-scene-tab="${scene.dataset.sceneImage}"]`)?.click();
    selected?.classList.remove('cms-selected'); selected = element; element.classList.add('cms-selected'); element.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  if (type === 'cms-change' && element) {
    if (element.tagName === 'IMG' && value && typeof value.src === 'string') { element.src = value.src; if (element.hasAttribute('data-scene-src')) element.dataset.sceneSrc = value.src; element.alt = value.alt; element.style.objectPosition = value.position; }
    else if (typeof value === 'string') element.textContent = value;
  }
});
parent.postMessage({ type: 'cms-ready' }, parentOrigin);
