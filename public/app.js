const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('#main-nav');
const groups = [...document.querySelectorAll('.nav-group')];
function closeMenu() {
  menuButton?.setAttribute('aria-expanded', 'false');
  nav?.classList.remove('is-open');
  document.body.classList.remove('menu-open');
}
menuButton?.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  nav.classList.toggle('is-open', open);
  document.body.classList.toggle('menu-open', open);
});
groups.forEach(group => group.addEventListener('toggle', () => {
  if (group.open) groups.filter(other => other !== group).forEach(other => { other.open = false; });
}));
document.addEventListener('click', event => {
  if (!event.target.closest('.nav-group')) groups.forEach(group => { group.open = false; });
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    const open = groups.find(group => group.open);
    if (open) { open.open = false; open.querySelector('summary').focus(); }
    else if (menuButton?.getAttribute('aria-expanded') === 'true') { closeMenu(); menuButton.focus(); }
  }
});
// Close navigation on keyboard focus departure, and restore page scroll on resizing.
groups.forEach(group => group.addEventListener('focusout', event => {
  if (!group.contains(event.relatedTarget)) group.open = false;
}));
matchMedia('(min-width: 901px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

// Business scenes change on request, without automatic rotation or moving text.
const sceneTabs = [...document.querySelectorAll('[data-scene-tab]')];
function selectScene(index, moveFocus = false) {
  if (!sceneTabs[index]) return;
  sceneTabs.forEach((tab, i) => {
    tab.setAttribute('aria-selected', String(i === index));
    tab.tabIndex = i === index ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = i !== index;
  });
  document.querySelectorAll('[data-scene-image]').forEach((scene, i) => {
    if (i === index) {
      const picture = scene.querySelector('img[data-scene-src]');
      if (picture) { picture.src = picture.dataset.sceneSrc; picture.removeAttribute('data-scene-src'); }
    }
    scene.classList.toggle('is-active', i === index);
  });
  document.querySelector('.immersive-hero').dataset.scene = String(index);
  document.querySelector('#scene-number').textContent = String(index + 1).padStart(2, '0');
  if (moveFocus) sceneTabs[index].focus();
}
sceneTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectScene(index));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % sceneTabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + sceneTabs.length) % sceneTabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = sceneTabs.length - 1;
    if (next !== undefined) { event.preventDefault(); selectScene(next, true); }
  });
});

// Transform-only depth and pointer lighting are restricted to precise pointers.
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const hero = document.querySelector('.immersive-hero');
if (hero && finePointer.matches) {
  let frame;
  hero.addEventListener('pointermove', event => {
    if (motionPreference.matches) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const box = hero.getBoundingClientRect();
      hero.style.setProperty('--hero-x', `${(event.clientX - box.left - box.width / 2) * .009}px`);
      hero.style.setProperty('--hero-y', `${(event.clientY - box.top - box.height / 2) * .009}px`);
    });
  });
  hero.addEventListener('pointerleave', () => {
    cancelAnimationFrame(frame);
    hero.style.setProperty('--hero-x', '0px'); hero.style.setProperty('--hero-y', '0px');
  });
}
if (finePointer.matches) document.querySelectorAll('.business-card').forEach(card => {
  let frame;
  card.addEventListener('pointermove', event => {
    if (motionPreference.matches) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const box = card.getBoundingClientRect();
      card.style.setProperty('--pointer-x', `${event.clientX - box.left}px`);
      card.style.setProperty('--pointer-y', `${event.clientY - box.top}px`);
    });
  });
  card.addEventListener('pointerleave', () => { cancelAnimationFrame(frame); card.style.removeProperty('--pointer-x'); card.style.removeProperty('--pointer-y'); });
});

let scrollFrame;
function updateReadingProgress() {
  const height = document.documentElement.scrollHeight - innerHeight;
  document.documentElement.style.setProperty('--scroll-progress', String(height > 0 ? Math.min(1, scrollY / height) : 0));
}
window.addEventListener('scroll', () => {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => { updateReadingProgress(); scrollFrame = undefined; });
}, { passive: true });
window.addEventListener('resize', updateReadingProgress, { passive: true });
updateReadingProgress();

if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.remove('is-pending');
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }), { threshold: 0.04, rootMargin: '0px 0px 35px 0px' });
  document.querySelectorAll('.reveal').forEach(el => { el.classList.add('is-pending'); observer.observe(el); });
}

document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  const category = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  let count = 0;
  document.querySelectorAll('[data-category]').forEach(card => {
    card.hidden = category !== 'All' && category !== card.dataset.category;
    if (!card.hidden) { count++; card.classList.remove('is-pending'); }
  });
  document.querySelector('.filter-status').textContent = `${count} educational ${count === 1 ? 'topic' : 'topics'}`;
}));

const form = document.querySelector('#contact-form');
if (form) {
  const params = new URLSearchParams(location.search);
  const business = params.get('business');
  if (business && [...form.elements.business.options].some(option => option.value === business)) form.elements.business.value = business;
  const topic = params.get('topic');
  if (topic && topic.length < 150) form.elements.message.value = `I would like to enquire about ${topic.toLowerCase()}. `;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submit = form.querySelector('button[type=submit]');
    const status = document.querySelector('#form-status');
    submit.disabled = true;
    status.className = 'form-status';
    status.textContent = 'Sending your enquiry securely…';
    const data = Object.fromEntries(new FormData(form));
    data.consent = form.elements.consent.checked;
    try {
      const response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Your enquiry could not be sent. Please try again.');
      status.textContent = 'Thank you. The email service has accepted your enquiry for delivery to the business inbox.';
      status.classList.add('success');
      form.reset();
    } catch (error) {
      status.textContent = error.name === 'TimeoutError' ? 'Delivery could not be confirmed in time. Please wait before trying again to avoid a duplicate enquiry.' : error.message;
      status.classList.add('error');
    } finally {
      submit.disabled = false;
      if (window.turnstile) window.turnstile.reset();
    }
  });
}
