const gallery = document.querySelector('.gallery-grid');
if (gallery) {
  const dialog = document.querySelector('#gallery-lightbox');
  const cards = [...gallery.querySelectorAll('.gallery-card')];
  let current = 0; let returnFocus;
  const visibleButtons = () => cards.filter(card => !card.hidden).map(card => card.querySelector('.gallery-open'));
  function show(index) {
    const buttons = visibleButtons(); if (!buttons.length) return;
    current = (index + buttons.length) % buttons.length;
    const button = buttons[current]; const img = document.querySelector('#lightbox-image');
    img.src = button.dataset.gallerySrc; img.alt = button.dataset.galleryAlt;
    document.querySelector('#lightbox-caption').textContent = button.dataset.galleryCaption;
    document.querySelector('#lightbox-counter').textContent = `${current + 1} / ${buttons.length}`;
    dialog.querySelectorAll('.lightbox-previous,.lightbox-next').forEach(control => { control.disabled = buttons.length < 2; });
  }
  document.querySelectorAll('[data-gallery-filter]').forEach(button => button.addEventListener('click', () => {
    const category = button.dataset.galleryFilter;
    document.querySelectorAll('[data-gallery-filter]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    cards.forEach(card => { card.hidden = category !== 'All' && category !== card.dataset.galleryCategory; });
    document.querySelector('#gallery-status').textContent = `${visibleButtons().length} images`;
  }));
  gallery.addEventListener('click', event => {
    const button = event.target.closest('.gallery-open'); if (!button) return;
    returnFocus = button; show(visibleButtons().indexOf(button)); dialog.showModal(); document.body.classList.add('lightbox-open');
  });
  dialog.querySelector('.lightbox-close').addEventListener('click', () => dialog.close());
  dialog.querySelector('.lightbox-previous').addEventListener('click', () => show(current - 1));
  dialog.querySelector('.lightbox-next').addEventListener('click', () => show(current + 1));
  dialog.addEventListener('keydown', event => { if (event.key === 'ArrowLeft') { event.preventDefault(); show(current - 1); } if (event.key === 'ArrowRight') { event.preventDefault(); show(current + 1); } });
  dialog.addEventListener('close', () => { document.body.classList.remove('lightbox-open'); returnFocus?.focus(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}
