const $ = selector => document.querySelector(selector);
const frame = $('#page-preview');
let session, pageData, selectedKey, mode = 'text', dirty = false, busy = false, pageList = [];
function node(tag, className, text) { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
function button(text, action) { const element = node('button', '', text); element.type = 'button'; element.addEventListener('click', action); return element; }
function message(text, kind = '') { const target = $('#studio').hidden ? $('#login-status') : $('#studio-status'); target.textContent = text; target.className = kind; }
function changed() { dirty = true; $('#draft-state').textContent = 'Unsaved changes'; }
async function api(op, { method = 'GET', body, raw = false } = {}) {
  const query = new URLSearchParams({ op, ...(pageData ? { page: pageData.path } : {}) });
  const response = await fetch(`/api/cms?${query}`, { method, credentials: 'same-origin', headers: body && !raw ? { 'Content-Type': 'application/json' } : raw ? { 'Content-Type': 'application/octet-stream' } : {}, body: body === undefined ? undefined : raw ? body : JSON.stringify(body), signal: AbortSignal.timeout(35000) });
  if (!response.ok) { const result = await response.json().catch(() => ({})); const error = new Error(result.error || 'The request did not complete. Please try again.'); error.status = response.status; throw error; }
  return response.headers.get('content-type')?.startsWith('text/html') ? response.text() : response.json();
}
async function work(action) {
  if (busy) return; busy = true; const controls = [...$('#studio').querySelectorAll('button,input,select,textarea')].map(element => [element, element.disabled]); controls.forEach(([element]) => { element.disabled = true; }); $('#studio').classList.add('is-busy');
  try { await action(); } catch (error) { message(error.name === 'TimeoutError' ? 'The request timed out. Your changes are still in this browser. Check the shared draft before retrying.' : error.message, 'error'); }
  finally { busy = false; controls.forEach(([element, disabled]) => { element.disabled = disabled; }); $('#studio').classList.remove('is-busy'); }
}
function confirmLeave() { return !dirty || confirm('You have unsaved changes. Download or save your draft first. Discard these browser changes?'); }
function post(type, key, value) { frame.contentWindow?.postMessage({ type, key, value }, location.origin); }
function currentValue(field) { return pageData.fields[field.key] ?? (field.type === 'image' ? { src: field.original, alt: field.originalAlt, position: '50% 50%' } : field.original); }
function changeField(field, value) { pageData.fields[field.key] = value; changed(); post('cms-change', field.key, value); }
function labelled(container, label, input) { const id = `edit-${crypto.randomUUID()}`; input.id = id; const text = node('label', '', label); text.htmlFor = id; container.append(text, input); return input; }
function input(value, max = 300) { const control = node('input'); control.type = 'text'; control.value = value || ''; control.maxLength = max; return control; }
async function upload(file) { if (!file || file.size > 3 * 1024 * 1024) throw new Error('Choose a PNG, JPEG or WebP image no larger than 3 MB.'); message('Uploading the image to shared storage…'); const result = await api('upload', { method: 'POST', body: file, raw: true }); message('Image uploaded. Save the shared draft to keep this replacement.', 'success'); return result.src; }
function chooseField(key, focus = true) {
  selectedKey = key; const field = pageData.catalog.find(item => item.key === key); if (!field) return;
  $('#field-select').value = key; const root = $('#field-editor'); root.replaceChildren(node('h2', 'field-title', field.label));
  root.append(node('p', 'field-help', field.type === 'image' ? 'Replace this image on the selected page. The layout and proportions stay in place.' : 'Update this text without changing its layout. Each line or emphasized phrase can be selected separately.'));
  const value = currentValue(field);
  if (field.type === 'image') {
    const preview = node('img'); preview.src = value.src; preview.alt = value.alt; root.append(preview);
    const file = node('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; labelled(root, 'Upload a replacement · maximum 3 MB', file);
    file.addEventListener('change', () => work(async () => { if (!file.files[0]) return; const src = await upload(file.files[0]); changeField(field, { ...currentValue(field), src }); chooseField(key, false); }));
    const alt = labelled(root, 'Image description', input(value.alt, 400)); alt.addEventListener('input', () => changeField(field, { ...currentValue(field), alt: alt.value }));
    const position = node('select'); for (const [label, val] of [['Center', '50% 50%'], ['Top', '50% 0%'], ['Bottom', '50% 100%'], ['Left', '0% 50%'], ['Right', '100% 50%']]) { const option = node('option', '', label); option.value = val; position.append(option); } position.value = value.position;
    labelled(root, 'Image crop focus', position); position.addEventListener('change', () => changeField(field, { ...currentValue(field), position: position.value }));
  } else {
    const area = node('textarea'); area.value = value; area.rows = field.type === 'meta' ? 3 : field.maxLength > 500 ? 7 : 4; area.maxLength = field.maxLength; labelled(root, 'Text', area); area.addEventListener('input', () => changeField(field, area.value));
  }
  const restore = button('Restore the original field', () => { delete pageData.fields[key]; changed(); post('cms-change', key, currentValue(field)); chooseField(key, false); }); restore.className = 'restore-field'; root.append(restore);
  const original = node('details', 'original-copy'); original.append(node('summary', '', 'Original content'), node('p', '', field.type === 'image' ? field.originalAlt || field.original : field.original)); root.append(original);
  if (focus) post('cms-focus', key);
}
function fieldList() {
  const select = $('#field-select'); const query = $('#field-search').value.toLowerCase(); select.replaceChildren();
  const matches = pageData.catalog.filter(field => (mode === 'image' ? field.type === 'image' : field.type !== 'image') && `${field.label} ${field.original}`.toLowerCase().includes(query));
  for (const field of matches) { const option = node('option', '', `${field.label} — ${field.original.replace(/\s+/g, ' ').slice(0, 90)}`); option.value = field.key; select.append(option); }
  const key = matches.some(field => field.key === selectedKey) ? selectedKey : matches[0]?.key;
  if (key) chooseField(key, false); else $('#field-editor').replaceChildren(node('p', 'field-help', 'No matching fields. Try a different search.'));
}
function setMode(next) {
  mode = next; document.querySelectorAll('[data-mode]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.mode === mode)));
  $('#field-list-panel').hidden = mode === 'collection'; $('#collection-panel').hidden = mode !== 'collection';
  if (mode === 'collection') renderCollection(); else fieldList();
}
function collectionField(container, label, value, setter, { long = false, max = 300 } = {}) {
  const control = long ? node('textarea') : input(value, max); if (long) { control.value = value || ''; control.maxLength = max; control.rows = 4; }
  labelled(container, label, control); control.addEventListener('input', () => { setter(control.value); changed(); }); return control;
}
function check(container, text, checked, setter) { const label = node('label', 'checkbox-label'); const control = node('input'); control.type = 'checkbox'; control.checked = checked; label.append(control, node('span', '', text)); container.append(label); control.addEventListener('change', () => { setter(control.checked); changed(); }); }
function renderCollection() {
  const gallery = pageData.path === '/gallery'; const team = pageData.path === '/team'; $('#collection-title').textContent = gallery ? 'Gallery photographs' : team ? 'Team profiles' : 'Testimonials';
  $('#collection-help').textContent = gallery ? 'Add verified company photographs, clear captions and a business category. Keep concept images labelled illustrative.' : team ? 'Add real team members, their roles, introductions and optional portraits. Obtain permission before publishing a profile.' : 'Use genuine quotes only. Record the person’s permission and mark the quote approved before the owner publishes it.';
  const root = $('#collection-entries'); root.replaceChildren(); const items = pageData.items || [];
  if (!items.length) root.append(node('p', 'collection-empty', gallery ? 'Add your first gallery photograph.' : team ? 'Add your first team member using their verified name and role.' : 'No testimonials have been entered. Add a genuine quote with permission when one is available.'));
  items.forEach((item, index) => {
    const article = node('article', 'collection-editor'); const toolbar = node('div', 'collection-item-toolbar'); toolbar.append(node('span', '', `Entry ${index + 1}`));
    const up = button('↑', () => { if (index) { [items[index - 1], items[index]] = [items[index], items[index - 1]]; changed(); renderCollection(); } }); up.setAttribute('aria-label', 'Move entry up'); up.disabled = index === 0;
    const down = button('↓', () => { if (index < items.length - 1) { [items[index + 1], items[index]] = [items[index], items[index + 1]]; changed(); renderCollection(); } }); down.setAttribute('aria-label', 'Move entry down'); down.disabled = index === items.length - 1;
    toolbar.append(up, down, button('Remove', () => { if (confirm('Remove this entry from the draft? The published version stays unchanged until publication.')) { items.splice(index, 1); changed(); renderCollection(); } })); article.append(toolbar);
    if (gallery || team) {
      if (item.src) { const image = node('img', 'collection-image-preview'); image.src = item.src; image.alt = item.alt; article.append(image); }
      const file = node('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; labelled(article, (team ? 'Portrait (optional)' : 'Photograph') + ' · maximum 3 MB', file);
      file.addEventListener('change', () => work(async () => { if (!file.files[0]) return; item.src = await upload(file.files[0]); changed(); renderCollection(); }));
      if (gallery) {
      collectionField(article, 'Title', item.title, value => { item.title = value; }, { max: 120 });
      const category = node('select'); for (const name of ['Wealth', 'KV Constructions', 'Real Estate', 'Rudraksh', 'Brindavan Resto']) { const option = node('option', '', name); option.value = name; category.append(option); } category.value = item.category; labelled(article, 'Business category', category); category.addEventListener('change', () => { item.category = category.value; changed(); });
      collectionField(article, 'Image description', item.alt, value => { item.alt = value; });
      collectionField(article, 'Caption', item.caption, value => { item.caption = value; }, { long: true, max: 500 });
      check(article, 'Illustrative or conceptual image (not a verified company photograph)', item.illustrative !== false, value => { item.illustrative = value; });
      } else {
      collectionField(article, 'Display name', item.name, value => { item.name = value; }, { max: 100 });
      collectionField(article, 'Role / designation', item.role, value => { item.role = value; }, { max: 120 });
      collectionField(article, 'Business / team', item.business, value => { item.business = value; }, { max: 100 });
      collectionField(article, 'Short introduction', item.bio, value => { item.bio = value; }, { long: true, max: 1000 });
      collectionField(article, 'Portrait description', item.alt, value => { item.alt = value; });
      if (item.src) article.append(button('Remove portrait', () => { item.src = ''; item.alt = ''; changed(); renderCollection(); }));
      check(article, 'Permission to publish this profile and portrait has been obtained.', item.consent === true, value => { item.consent = value; });
      check(article, 'This profile has been checked and is ready for owner approval.', item.approved === true, value => { item.approved = value; });
      }
    } else {
      collectionField(article, 'Person’s display name', item.name, value => { item.name = value; }, { max: 100 });
      collectionField(article, 'Business / relationship', item.business, value => { item.business = value; }, { max: 100 });
      collectionField(article, 'Their exact quote', item.quote, value => { item.quote = value; }, { long: true, max: 1500 });
      check(article, 'Permission to publish this name and quote has been obtained.', item.consent === true, value => { item.consent = value; });
      check(article, 'This genuine quote has been reviewed and is ready for owner approval.', item.approved === true, value => { item.approved = value; });
    }
    root.append(article);
  });
}
async function loadPage(path) {
  pageData = { path }; const data = await api('page'); pageData = data; dirty = false; $('#change-note').value = ''; $('#page-select').value = path;
  $('#preview-path').textContent = path; $('#live-page-link').href = path; $('#collection-mode').hidden = !['/gallery', '/testimonials', '/team'].includes(path);
  $('#draft-state').textContent = data.revision ? data.revision === data.publishedRevision ? 'Published · draft in sync' : 'Shared draft' : 'Original content';
  $('#field-search').value = ''; setMode(mode === 'collection' && $('#collection-mode').hidden ? 'text' : mode);
  frame.removeAttribute('srcdoc'); frame.src = `/api/cms?op=preview&page=${encodeURIComponent(path)}&v=${Date.now()}`;
  message('Choose text or an image in the preview. Draft changes are visible to signed-in teammates.', '');
}
function payload() { return { fields: pageData.fields, ...(pageData.items ? { items: pageData.items } : {}), baseRevision: pageData.revision, fingerprint: pageData.fingerprint, note: $('#change-note').value }; }
function showStudio(nextSession) {
  session = nextSession; $('#login-view').hidden = true; $('#studio').hidden = false;
  $('#session-name').textContent = session.name; $('#session-role').textContent = session.role;
  $('#publish-button').hidden = session.role !== 'owner'; $('#history-button').hidden = session.role !== 'owner';
}
async function initialize() {
  try {
    const status = await api('status'); pageList = status.pages;
    const select = $('#page-select'); select.replaceChildren(); for (const page of pageList) { const option = node('option', '', `${page.path === '/' ? 'Home' : page.title} — ${page.path}`); option.value = page.path; select.append(option); }
    $('#setup-notice').hidden = status.configured; $('#login-controls').disabled = !status.configured;
    if (status.session && status.configured) { showStudio(status.session); await work(() => loadPage('/')); }
    else { $('#studio').hidden = true; $('#login-view').hidden = false; message(status.configured ? 'Use the team password to save drafts or the owner password to publish.' : 'Editing is protected until the owner completes the one-time activation.'); }
  } catch (error) { message(error.message, 'error'); $('#login-controls').disabled = true; }
}
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); const controls = $('#login-controls'); const name = $('#editor-name').value; const password = $('#editor-password').value; controls.disabled = true;
  try { const result = await api('login', { method: 'POST', body: { name, password } }); $('#editor-password').value = ''; showStudio(result.session); await work(() => loadPage('/')); }
  catch (error) { message(error.message, 'error'); } finally { controls.disabled = false; }
});
$('#logout-button').addEventListener('click', () => work(async () => { if (!confirmLeave()) return; await api('logout', { method: 'POST', body: {} }); dirty = false; pageData = undefined; await initialize(); }));
$('#page-select').addEventListener('change', event => { const path = event.target.value; if (!confirmLeave()) { event.target.value = pageData.path; return; } work(() => loadPage(path)); });
document.querySelectorAll('[data-mode]').forEach(control => control.addEventListener('click', () => setMode(control.dataset.mode)));
$('#field-search').addEventListener('input', fieldList); $('#field-select').addEventListener('change', event => chooseField(event.target.value));
$('#save-button').addEventListener('click', () => work(async () => { message('Saving the shared draft…'); const path = pageData.path; await api('save', { method: 'POST', body: payload() }); await loadPage(path); message('Shared draft saved. Teammates can now review it. The published page is unchanged.', 'success'); }));
$('#refresh-preview').addEventListener('click', () => work(async () => { message('Preparing the preview…'); const html = await api('render', { method: 'POST', body: payload() }); frame.srcdoc = html; message('Preview updated with your browser changes. Save the shared draft to keep them.'); }));
$('#publish-button').addEventListener('click', () => work(async () => { if (dirty) throw new Error('Save your shared draft before publishing.'); if (!confirm('Publish the latest saved draft of this page to the website?')) return; const path = pageData.path; await api('publish', { method: 'POST', body: { baseRevision: pageData.revision } }); await loadPage(path); message('Published. Open the published page to review the result.', 'success'); }));
$('#download-button').addEventListener('click', () => { const blob = new Blob([JSON.stringify({ page: pageData.path, ...payload() }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = node('a'); link.href = url; link.download = `kalpavruksha-${pageData.path.replaceAll('/', '-') || 'home'}-draft.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); message('A draft backup was downloaded. Save the shared draft to share changes with the team.'); });
$('#add-entry').addEventListener('click', () => { pageData.items ||= []; if (pageData.items.length >= (pageData.path === '/gallery' ? 40 : 25)) { message('This collection has reached its entry limit.', 'error'); return; } pageData.items.push(pageData.path === '/gallery' ? { id: crypto.randomUUID(), title: '', src: '', alt: '', caption: '', category: 'Wealth', illustrative: true } : pageData.path === '/team' ? { id: crypto.randomUUID(), name: '', role: '', business: '', bio: '', src: '', alt: '', consent: false, approved: false } : { id: crypto.randomUUID(), name: '', business: '', quote: '', consent: false, approved: false }); changed(); renderCollection(); });
$('#history-button').addEventListener('click', () => { const root = $('#history-list'); root.replaceChildren(); for (const record of pageData.history || []) { const row = node('div', 'history-entry'); const copy = node('div'); copy.append(node('p', '', record.note || (record.kind === 'published' ? 'Published version' : 'Saved draft')), node('span', '', `${record.editor} · ${new Date(record.updatedAt).toLocaleString()}`)); row.append(copy, button('Restore as draft', () => restore(record.revision))); root.append(row); } if (!root.childNodes.length) root.append(node('p', '', 'No earlier saved versions yet.')); $('#history-dialog').showModal(); });
async function restore(version) { if (!confirmLeave()) return; $('#history-dialog').close(); await work(async () => { const path = pageData.path; await api('restore', { method: 'POST', body: { baseRevision: pageData.revision, version } }); await loadPage(path); message('Version restored as a shared draft. Review it before publishing.', 'success'); }); }
$('#restore-original').addEventListener('click', () => restore('original')); $('#close-history').addEventListener('click', () => $('#history-dialog').close());
document.querySelectorAll('[data-preview-size]').forEach(control => control.addEventListener('click', () => { document.querySelectorAll('[data-preview-size]').forEach(other => other.setAttribute('aria-pressed', String(other === control))); frame.classList.toggle('mobile-preview', control.dataset.previewSize === 'mobile'); }));
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow || !event.data || busy) return;
  if (event.data.type === 'cms-select') { const field = pageData?.catalog.find(item => item.key === event.data.key); if (field) { $('#field-search').value = ''; selectedKey = field.key; setMode(field.type === 'image' ? 'image' : 'text'); chooseField(field.key, false); post('cms-focus', field.key); } }
  if (event.data.type === 'cms-ready') { for (const [key, value] of Object.entries(pageData?.fields || {})) post('cms-change', key, value); }
  if (event.data.type === 'cms-navigate' && pageList.some(page => page.path === event.data.path) && confirmLeave()) work(() => loadPage(event.data.path));
});
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
initialize();
