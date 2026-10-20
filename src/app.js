import { DEFAULTS, MAX_IMAGES, normalizeProject, dimensions, projectAssets } from './model.js';
import { renderWall } from './render.js';
import { createDemoProject } from './demo.js';
import { fixedQuantityState, incompatibleImages, TILE_RATIOS } from './fixed-layout.js';
import { readDraft, writeDraft } from './storage.js';
import { importImage, loadImage, blobDataURL, resolveImageFiles, MAX_FILE_BYTES, MAX_PROJECT_BYTES } from './images.js';
const $ = selector => document.querySelector(selector);
function editorProject(input) {
  const normalized = normalizeProject(input);
  // Retain legacy text metadata for portable files, but web compositions no
  // longer render titles or captions, including restored/imported projects.
  normalized.settings.showHeader = false;
  normalized.settings.showCaptions = false;
  return normalized;
}
let project = editorProject({ version: 1, settings: DEFAULTS, images: [] });
let cache = new Map(), revision = 0, saveTimer, toastTimer, editingId, draggingId, undoProject, busy = false, ready = false;
function toast(message, duration = 4500) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, duration); }
function checkpoint() { undoProject = structuredClone(project); $('#undo').hidden = false; }
async function confirmAction(title) {
  $('#confirm-title').textContent = title;
  const dialog = $('#confirm-dialog'); dialog.showModal();
  return new Promise(resolve => {
    const close = value => { dialog.close(); cleanup(); resolve(value); };
    const cancel = () => close(false), ok = () => close(true);
    const escape = event => { event.preventDefault(); close(false); };
    const cleanup = () => { $('#confirm-ok').removeEventListener('click', ok); $('#confirm-cancel').removeEventListener('click', cancel); dialog.removeEventListener('cancel', escape); };
    $('#confirm-ok').addEventListener('click', ok); $('#confirm-cancel').addEventListener('click', cancel); dialog.addEventListener('cancel', escape);
  });
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function slug() { return project.settings.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0,60) || 'posterwall'; }
function syncSubjectValues() {
  $('#subject-granularity-value').value = project.subject.granularity;
  $('#subject-scale-value').value = `${Math.round(project.subject.scale * 100)}%`;
  for (const axis of ['x', 'y']) {
    const value = `${Number((project.subject[axis] * 100).toFixed(2))}%`;
    $(`#subject-${axis}-value`).value = value;
    $(`#subject-${axis}`).setAttribute('aria-valuetext', project.subject[axis] === .5 ? `${value}，居中` : value);
  }
  $('#center-subject').disabled = project.subject.x === .5 && project.subject.y === .5;
}
function syncSettings() {
  for (const [key, value] of Object.entries(project.settings)) {
    const input = document.getElementById(key);
    if (input) { if (input.type === 'checkbox') input.checked = value; else input.value = value; }
    const output = document.getElementById(`${key}-value`); if (output) output.value = value;
  }
  for (const key of ['ratio']) document.querySelectorAll(`[data-${key}]`).forEach(button => {
    button.setAttribute('aria-pressed', button.dataset[key] === project.settings[key]);
  });
  document.querySelectorAll('[data-shape]').forEach(button => button.setAttribute('aria-pressed', button.dataset.shape === project.subject.shape));
  document.querySelectorAll('[data-subject]').forEach(input => { if (input.type === 'checkbox') input.checked = project.subject[input.dataset.subject]; else input.value = project.subject[input.dataset.subject]; });
  syncSubjectValues();
  document.querySelectorAll('[data-base]').forEach(button => button.setAttribute('aria-pressed', button.dataset.base === project.base.preset));
  const transparent = project.base.preset === 'none';
  $('#mount-controls').hidden = transparent;
  $('#preview').classList.toggle('transparent', transparent);
  $('#format option[value=jpeg]').disabled = transparent;
  if (transparent) $('#format').value = 'png';
  $('#shadow').checked = project.base.shadow;
  const background = project.base.background;
  $('#background-controls').hidden = !background;
  $('#upload-background').textContent = background ? '更换背景图' : '＋ 背景图';
  if (background) {
    $('#background-preview').src = background.src;
    for (const key of ['focusX','focusY']) document.querySelector(`[data-background="${key}"]`).value = background[key];
  } else $('#background-preview').removeAttribute('src');
}
function syncSizes() {
  const out = dimensions(project.settings, Number($('#scale').value));
  $('#export-size').textContent = `${out.width} × ${out.height} px`;
}
function renderLibrary() {
  const fragment = document.createDocumentFragment();
  project.images.forEach(item => {
    const div = document.createElement('div'); div.className = 'image-item'; div.draggable = true; div.dataset.id = item.id;
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', `编辑 ${item.title}`); button.title = `${item.title} · 拖动排序，点击编辑`;
    const img = document.createElement('img'); img.src = item.src; img.alt = item.title; img.loading = 'lazy'; img.style.objectPosition = `${item.focusX * 100}% ${item.focusY * 100}%`;
    button.append(img); div.append(button); fragment.append(div);
  });
  $('#images').replaceChildren(fragment); $('#image-count').textContent = project.images.length;
  $('#empty-library').hidden = project.images.length > 0; $('#clear').disabled = !project.images.length;
}
function cachedImage(src) {
  if (!cache.has(src)) cache.set(src, loadImage(src).catch(error => { cache.delete(src); throw error; }));
  return cache.get(src);
}
async function loadAssets(snapshot) {
  return Promise.all([Promise.all(snapshot.images.map(item => cachedImage(item.src))), snapshot.base.background ? cachedImage(snapshot.base.background.src) : null]);
}
async function draw() {
  const thisRevision = ++revision, snapshot = structuredClone(project);
  $('#export').disabled = true;
  syncSizes();
  try {
    const [loaded, background] = await loadAssets(snapshot);
    if (thisRevision !== revision) return;
    const ratios = loaded.map(img => img.naturalWidth / img.naturalHeight);
    if (snapshot.subject.tileRatio === 'native') {
      const format = Object.keys(TILE_RATIOS).sort((a, b) => ratios.reduce((sum, r) => sum + Math.abs(Math.log(r / TILE_RATIOS[a])), 0) - ratios.reduce((sum, r) => sum + Math.abs(Math.log(r / TILE_RATIOS[b])), 0))[0];
      project.subject.tileRatio = snapshot.subject.tileRatio = format;
      $('#tile-ratio').value = format;
    }
    const { options, selected } = fixedQuantityState(snapshot.subject, loaded.length);
    if (selected !== null) project.subject.count = snapshot.subject.count = selected;
    const controls = $('#quantity-options');
    controls.replaceChildren(...options.map(({ count, disabled }) => {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = `${count} 张`;
      button.dataset.count = count; button.setAttribute('aria-pressed', count === selected);
      button.disabled = disabled; button.title = disabled ? `需要 ${count} 张素材或允许重复` : `生成 ${count} 张海报`;
      return button;
    }));
    const levels = $('#subject-granularity');
    levels.max = 4; levels.value = snapshot.subject.granularity;
    levels.disabled = false; levels.title = '1–4 种固定尺寸';
    $('#subject-granularity-value').value = snapshot.subject.granularity;
    const incompatible = incompatibleImages(ratios, snapshot.subject);
    $('#enable-crop').hidden = !incompatible.length;
    $('#layout-notice').hidden = true; $('#preview').hidden = false;
    if (loaded.length && options.find(option => option.count === selected)?.disabled) throw new Error(`此档需要 ${selected} 张素材，当前 ${loaded.length} 张。请添加图片或允许重复。`);
    const tiles = renderWall($('#preview'), snapshot, loaded, 1, background);
    $('#subject-count-value').value = `${tiles.length} 张`;
    $('#export').disabled = !snapshot.images.length || busy;
    for (const key of cache.keys()) if (!projectAssets(snapshot).some(i => i.src === key)) cache.delete(key);
  } catch (error) { if (thisRevision === revision) {
    $('#subject-count-value').value = '—';
    $('#preview').hidden = true; $('#layout-notice').hidden = false;
    $('#layout-notice-text').textContent = error.message;
  } }
}
function changed({ library = false, settings = false } = {}) {
  if (settings) syncSettings(); if (library) renderLibrary();
  void draw();
  clearTimeout(saveTimer); $('#save-status').textContent = '保存中…';
  saveTimer = setTimeout(async () => {
    try { await writeDraft(structuredClone(project)); $('#save-status').textContent = '草稿已保存'; }
    catch { $('#save-status').textContent = '草稿保存失败，请保存项目'; toast('草稿保存失败，请保存项目'); }
  }, 500);
}
async function runBusy(action) {
  if (busy || !ready) return;
  busy = true; $('#upload').disabled = true; $('#export').disabled = true;
  for (const selector of ['.settings-panel', '#images', '.canvas-toolbar']) $(selector).inert = true;
  try { await action(); } catch (error) { toast(error.message, 7000); }
  finally { busy = false; $('#upload').disabled = false;
    for (const selector of ['.settings-panel', '#images', '.canvas-toolbar']) $(selector).inert = false;
    void draw(); }
}
async function addFiles(files) {
  const json = files.find(f => /\.(json|posterwall)$/i.test(f.name));
  if (json) return openProject(json, files);
  if (!files.length) return;
  await runBusy(async () => {
    const room = MAX_IMAGES - project.images.length;
    if (room <= 0) throw new Error('最多 100 张图片，请先移除一些素材');
    const added = [], failed = [];
    for (const file of files.slice(0, room)) {
      $('#save-status').textContent = `正在处理图片 ${added.length + failed.length + 1}/${Math.min(room, files.length)}…`;
      try { added.push(await importImage(file)); } catch (e) { failed.push(e.message); }
    }
    if (added.length) { checkpoint(); project.images.push(...added); changed({ library: true }); }
    toast(`已添加 ${added.length} 张${failed.length ? `；${failed[0]}` : ''}${files.length > room ? `；超过 ${MAX_IMAGES} 张的部分未导入` : ''}`, failed.length ? 7000 : 4500);
  });
}
async function openProject(file, files = []) {
  if (busy || !ready) return;
  if (project.images.length && !await confirmAction('替换当前项目？')) return;
  await runBusy(async () => {
    if (file.size > MAX_PROJECT_BYTES) throw new Error('项目文件不能超过 80 MB');
    const next = editorProject(JSON.parse(await file.text()));
    const items = resolveImageFiles(projectAssets(next), files);
    for (const item of items) {
      if (item.file) { const converted = await importImage(item.file); item.src = converted.src; delete item.file; }
      const data = item.src.split(',')[1] || '';
      if (Math.floor(data.length * .75) > MAX_FILE_BYTES) throw new Error(`图片超过 20 MB：${item.title}`);
      const image = await loadImage(item.src);
      if (image.naturalWidth * image.naturalHeight > 60_000_000) throw new Error(`图片超过 6000 万像素：${item.title}`);
    }
    next.images = items.slice(0, next.images.length);
    if (next.base.background) next.base.background = items.at(-1);
    checkpoint(); project = next; changed({ library: true, settings: true }); toast('项目已打开');
  });
}
async function loadDemo() {
  return editorProject(createDemoProject((width, height) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    return canvas;
  }));
}
$('#upload').addEventListener('click', () => { if (ready) $('#file-input').click(); });
$('#file-input').addEventListener('change', e => { void addFiles([...e.target.files]); e.target.value = ''; });
$('#open-project').addEventListener('click', () => { if (ready) $('#project-input').click(); });
$('#project-input').addEventListener('change', e => { const file = e.target.files[0]; e.target.value = ''; if (file) void openProject(file); });
for (const target of [$('#upload'), $('#stage'), $('#images')]) {
  target.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); $('#upload').classList.add('dragover'); } });
  target.addEventListener('dragleave', () => $('#upload').classList.remove('dragover'));
  target.addEventListener('drop', e => { $('#upload').classList.remove('dragover'); if (e.dataTransfer.files.length) { e.preventDefault(); void addFiles([...e.dataTransfer.files]); } });
}
document.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
document.addEventListener('drop', e => { if (e.dataTransfer.files.length) e.preventDefault(); });
for (const key of ['ratio']) document.querySelectorAll(`[data-${key}]`).forEach(button => button.addEventListener('click', () => {
  if (!ready || busy) return; project.settings[key] = button.dataset[key]; changed({ settings: true });
}));
$('#padding').addEventListener('input', event => {
  if (!ready || busy) return;
  project.settings.padding = Number(event.target.value);
  $('#padding-value').value = event.target.value;
  changed();
});
document.querySelectorAll('[data-shape]').forEach(button => button.addEventListener('click', () => {
  if (!ready || busy) return;
  project.subject.shape = button.dataset.shape; changed({ settings: true });
}));
$('#quantity-options').addEventListener('click', event => {
  const button = event.target.closest('[data-count]');
  if (!ready || busy || !button || button.disabled) return;
  project.subject.count = Number(button.dataset.count); changed();
});
document.querySelectorAll('[data-subject]').forEach(input => input.addEventListener('input', () => {
  if (!ready || busy) return;
  project.subject[input.dataset.subject] = input.type === 'checkbox' ? input.checked : input.dataset.subject === 'tileRatio' ? input.value : Number(input.value);
  syncSubjectValues(); changed({ settings: input.dataset.subject === 'granularity' });
}));
$('#center-subject').addEventListener('click', () => {
  if (!ready || busy) return;
  project.subject.x = project.subject.y = .5;
  changed({ settings: true });
});
$('#enable-crop').addEventListener('click', () => {
  if (!ready || busy) return;
  project.subject.crop = true; changed({ settings: true });
});
document.querySelectorAll('[data-base]').forEach(button => button.addEventListener('click', () => {
  if (!ready || busy) return;
  checkpoint(); project.base.preset = button.dataset.base; project.base.background = null; changed({ settings: true });
}));
for (const key of ['shadow']) $(`#${key}`).addEventListener('input', event => {
  if (!ready || busy) return;
  project.base[key] = key === 'shadow' ? event.target.checked : Number(event.target.value);
  changed();
});
$('#upload-background').addEventListener('click', () => { if (ready && !busy) $('#background-input').click(); });
$('#background-input').addEventListener('change', event => {
  const file = event.target.files[0]; event.target.value = '';
  if (file) void runBusy(async () => {
    const background = await importImage(file, { maxEdge: 3840 });
    checkpoint(); if (project.base.preset === 'none') project.base.preset = 'white'; project.base.background = background; changed({ settings: true });
  });
});
$('#remove-background').addEventListener('click', () => {
  if (busy || !project.base.background) return;
  checkpoint(); project.base.background = null; changed({ settings: true });
});
document.querySelectorAll('[data-background]').forEach(input => input.addEventListener('input', () => {
  if (!project.base.background || busy) return;
  project.base.background[input.dataset.background] = Number(input.value); changed();
}));
$('#shuffle').addEventListener('click', () => {
  if (!ready || busy) return;
  checkpoint(); project.settings.seed = crypto.getRandomValues(new Uint32Array(1))[0];
  for (let i = project.images.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [project.images[i], project.images[j]] = [project.images[j], project.images[i]]; }
  changed({ library: true });
});
$('#clear').addEventListener('click', async () => {
  if (busy || !ready || !await confirmAction('清空素材？')) return;
  checkpoint(); project.images = []; changed({ library: true });
});
$('#undo').addEventListener('click', () => { if (undoProject && !busy) { project = undoProject; undoProject = null; $('#undo').hidden = true; changed({ library: true, settings: true }); toast('已撤销'); } });
$('#load-demo').addEventListener('click', () => runBusy(async () => { const demo = await loadDemo(); checkpoint(); project = demo; changed({ library: true, settings: true }); }));
$('#images').addEventListener('click', e => {
  const item = e.target.closest('.image-item'); if (!item || busy) return;
  editingId = item.dataset.id; checkpoint(); syncImageEditor(); $('#image-dialog').showModal();
});
function syncImageEditor() {
  const i = project.images.findIndex(x => x.id === editingId), item = project.images[i]; if (!item) return;
  $('#edit-preview').src = item.src; $('#image-title').value = item.title;
  $('#move-left').disabled = i === 0; $('#move-right').disabled = i === project.images.length - 1;
}
$('#image-title').addEventListener('input', e => {
  const item = project.images.find(x => x.id === editingId); if (!item) return;
  item.title = e.target.value; changed({ library: true });
});
for (const [id, delta] of [['move-left', -1], ['move-right', 1]]) $(`#${id}`).addEventListener('click', () => {
  const i = project.images.findIndex(x => x.id === editingId), j = i + delta; if (i < 0 || j < 0 || j >= project.images.length) return;
  [project.images[i], project.images[j]] = [project.images[j], project.images[i]]; changed({ library: true }); syncImageEditor();
});
$('#remove-image').addEventListener('click', () => { project.images = project.images.filter(x => x.id !== editingId); $('#image-dialog').close(); changed({ library: true }); });
$('#finish-edit').addEventListener('click', () => $('#image-dialog').close());
$('#images').addEventListener('dragstart', e => { const item = e.target.closest('.image-item'); if (!item) return; draggingId = item.dataset.id; item.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', draggingId); });
$('#images').addEventListener('dragend', () => { draggingId = null; document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging')); });
$('#images').addEventListener('dragover', e => { if (draggingId) e.preventDefault(); });
$('#images').addEventListener('drop', e => {
  if (!draggingId || busy) return; e.preventDefault();
  const target = e.target.closest('.image-item'); if (!target) return;
  const from = project.images.findIndex(x => x.id === draggingId), to = project.images.findIndex(x => x.id === target.dataset.id);
  if (from < 0 || to < 0 || from === to) return;
  checkpoint(); const [item] = project.images.splice(from, 1); project.images.splice(to, 0, item); draggingId = null; changed({ library: true });
});
$('#save-project').addEventListener('click', () => runBusy(async () => {
  const portable = structuredClone(project);
  for (const item of projectAssets(portable)) if (!item.src.startsWith('data:')) {
    const response = await fetch(item.src); if (!response.ok) throw new Error(`无法保存图片：${item.title}`); item.src = await blobDataURL(await response.blob());
  }
  const blob = new Blob([JSON.stringify(portable, null, 2)], { type: 'application/json' });
  if (blob.size > MAX_PROJECT_BYTES) throw new Error('项目超过 80 MB，请减少素材后保存');
  download(blob, `${slug()}.posterwall.json`); toast('项目已保存');
}));
$('#export').addEventListener('click', () => runBusy(async () => {
  if (!project.images.length) throw new Error('请先添加图片');
  const snapshot = structuredClone(project), scale = Number($('#scale').value), format = $('#format').value;
  const button = $('#export'); button.textContent = '正在生成…';
  try {
    const [loaded, background] = await loadAssets(snapshot), canvas = document.createElement('canvas');
    renderWall(canvas, snapshot, loaded, scale, background);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, `image/${format}`, .96));
    if (!blob) throw new Error('导出失败，请尝试较低清晰度');
    download(blob, `${slug()}-${scale}x.${format === 'jpeg' ? 'jpg' : 'png'}`); toast('海报已导出');
    canvas.width = 1; canvas.height = 1;
  } finally { button.innerHTML = '导出海报 <span>↓</span>'; }
}));
$('#scale').addEventListener('change', syncSizes); $('#format').addEventListener('change', syncSizes);
$('#agent-help').addEventListener('click', () => $('#agent-dialog').showModal());
$('#cover-help').addEventListener('click', () => $('#cover-dialog').showModal());
async function init() {
  $('#export').disabled = true;
  let draft;
  try { draft = await readDraft(); } catch { /* Private browsers still support explicit project files. */ }
  try { project = draft ? editorProject(draft) : await loadDemo(); }
  catch (error) { toast(`未能恢复草稿或示例：${error.message}`); }
  ready = true; syncSettings(); renderLibrary(); await draw();
  $('#save-status').textContent = draft ? '草稿已恢复' : '示例项目';
}
void init();
