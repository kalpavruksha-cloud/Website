import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Exercise the actual client script without a browser or external test dependency.
// This verifies state transitions, not visual layout or browser rendering.
async function loadScenes() {
  function element(attributes = {}) {
    return {
      attributes, dataset: {}, events: {}, hidden: false,
      classList: { active: false, toggle(name, value) { this.active = value; } },
      setAttribute(key, value) { this.attributes[key] = value; },
      getAttribute(key) { return this.attributes[key]; },
      removeAttribute(key) { delete this.attributes[key]; },
      addEventListener(key, callback) { this.events[key] = callback; },
      focus() { this.focused = true; },
    };
  }
  const panels = Array.from({ length: 5 }, (_, i) => ({ hidden: i !== 0 }));
  const tabs = panels.map((_, i) => element({ 'aria-controls': `scene-panel-${i}`, 'aria-selected': String(i === 0) }));
  const pictures = tabs.map((_, i) => { const picture = element({ 'data-scene-src': `/assets/scene-${i}.jpg` }); picture.dataset.sceneSrc = `/assets/scene-${i}.jpg`; return picture; });
  const scenes = tabs.map((_, i) => { const scene = element(); scene.querySelector = () => pictures[i].attributes['data-scene-src'] ? pictures[i] : null; return scene; });
  const hero = element(); const number = { textContent: '01' };
  const document = {
    documentElement: { style: { setProperty() {} }, scrollHeight: 3000 },
    addEventListener() {},
    querySelectorAll(selector) { return selector === '[data-scene-tab]' ? tabs : selector === '[data-scene-image]' ? scenes : []; },
    querySelector(selector) { return selector === '.immersive-hero' ? hero : selector === '#scene-number' ? number : null; },
    getElementById(id) { return panels[Number(id.split('-').at(-1))]; },
  };
  const media = () => ({ matches: false, addEventListener() {} });
  runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), {
    document, window: { addEventListener() {} }, matchMedia: media, innerHeight: 1000, scrollY: 0,
  });
  return { tabs, panels, scenes, pictures, hero, number };
}

test('selecting a business scene synchronizes panels, ARIA state and lazy media', async () => {
  const state = await loadScenes();
  state.tabs[3].events.click();
  assert.equal(state.hero.dataset.scene, '3');
  assert.equal(state.number.textContent, '04');
  assert.equal(state.pictures[3].src, '/assets/scene-3.jpg');
  assert.equal(state.pictures[2].src, undefined, 'unselected media stays deferred');
  state.tabs.forEach((tab, i) => {
    assert.equal(tab.attributes['aria-selected'], String(i === 3));
    assert.equal(tab.tabIndex, i === 3 ? 0 : -1);
    assert.equal(state.panels[i].hidden, i !== 3);
    assert.equal(state.scenes[i].classList.active, i === 3);
  });
});

test('scene keyboard navigation wraps and supports Home and End', async () => {
  const { tabs, number } = await loadScenes();
  let prevented = false;
  tabs[0].events.keydown({ key: 'ArrowLeft', preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(number.textContent, '05'); assert.equal(tabs[4].focused, true);
  tabs[4].events.keydown({ key: 'ArrowRight', preventDefault() {} }); assert.equal(number.textContent, '01');
  tabs[0].events.keydown({ key: 'End', preventDefault() {} }); assert.equal(number.textContent, '05');
  tabs[4].events.keydown({ key: 'Home', preventDefault() {} }); assert.equal(number.textContent, '01');
});
