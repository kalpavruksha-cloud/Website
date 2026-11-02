const parentOrigin = parent.location.origin;
let selected;
const runs = (element, attribute) => JSON.parse(element.getAttribute(attribute) || '[]');
function locate(key) {
  for (const element of document.querySelectorAll('[data-cms-key],[data-cms-runs],[data-cms-site-key],[data-cms-site-runs]')) {
    if (element.dataset.cmsKey === key || element.dataset.cmsSiteKey === key) return { element };
    for (const attribute of ['data-cms-runs', 'data-cms-site-runs']) { const run = runs(element, attribute).find(item => item.key === key); if (run) return { element, index: run.index }; }
  }
  return {};
}
document.addEventListener('click', event => {
  const shared = event.target.closest('[data-cms-site-key],[data-cms-site-runs]');
  const field = shared || event.target.closest('[data-cms-key],[data-cms-runs]');
  if (field) {
    const key = shared ? shared.dataset.cmsSiteKey || runs(shared, 'data-cms-site-runs')[0]?.key : field.dataset.cmsKey || runs(field, 'data-cms-runs')[0]?.key;
    event.preventDefault(); event.stopImmediatePropagation(); parent.postMessage({ type: 'cms-select', key, scope: shared ? 'site' : 'page' }, parentOrigin); return;
  }
  const anchor = event.target.closest('a');
  if (anchor) { event.preventDefault(); event.stopImmediatePropagation(); const url = new URL(anchor.href, location.href); if (url.origin === parentOrigin) parent.postMessage({ type: 'cms-navigate', path: url.pathname }, parentOrigin); }
}, true);
document.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); }, true);
window.addEventListener('message', event => {
  if (event.origin !== parentOrigin || event.source !== parent || !event.data) return;
  const { type, key, value } = event.data;
  const { element, index } = locate(key);
  if (type === 'cms-focus' && element) {
    const scene = element.closest('[data-scene-image]');
    if (scene) document.querySelector(`[data-scene-tab="${scene.dataset.sceneImage}"]`)?.click();
    selected?.classList.remove('cms-selected'); selected = element; element.classList.add('cms-selected'); element.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  if (type === 'cms-change' && element) {
    if (element.tagName === 'IMG' && value && typeof value.src === 'string') { element.src = value.src; if (element.hasAttribute('data-scene-src')) element.dataset.sceneSrc = value.src; element.alt = value.alt; element.style.objectPosition = value.position; }
    else if (typeof value === 'string') { if (index !== undefined && element.childNodes[index]?.nodeType === 3) element.childNodes[index].textContent = value; else element.textContent = value; }
  }
});
parent.postMessage({ type: 'cms-ready' }, parentOrigin);
