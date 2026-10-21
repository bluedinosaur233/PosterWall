export function previewEditor({ stage, surface, layer, library, hint, cancel, onEdit, onReorder, canEdit, canReorder }) {
  let tiles = [], images = [], selected = null, drag = null, ghost = null, width = 1, height = 1, suppressClick = false;
  const buttons = () => [...layer.children];
  const tileButton = event => event.target.closest('[data-slot]');
  const dropButton = event => {
    // Zoomed artwork extends beyond the scroll viewport. Hidden tiles cannot
    // receive drops over the toolbars or the adjacent material library.
    const viewport = stage.getBoundingClientRect();
    if (event.clientX < viewport.left + stage.clientLeft || event.clientX >= viewport.left + stage.clientLeft + stage.clientWidth || event.clientY < viewport.top + stage.clientTop || event.clientY >= viewport.top + stage.clientTop + stage.clientHeight) return null;
    const bounds = surface.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    const x = (event.clientX - bounds.left) / bounds.width * width;
    const y = (event.clientY - bounds.top) / bounds.height * height;
    const slot = tiles.findIndex(tile => x >= tile.x && x < tile.x + tile.w && y >= tile.y && y < tile.y + tile.h);
    return slot < 0 ? null : layer.children[slot];
  };
  function reset() {
    const previous = drag; drag = null; selected = null;
    if (previous?.element.hasPointerCapture(previous.pointerId)) previous.element.releasePointerCapture(previous.pointerId);
    previous?.element.classList.remove('dragging', 'tile-dragging');
    ghost?.remove(); ghost = null;
    document.body.classList.remove('poster-dragging');
    library.querySelectorAll('.drop-target').forEach(item => item.classList.remove('drop-target'));
    buttons().forEach(button => { button.classList.remove('tile-selected', 'tile-target', 'tile-dragging'); button.setAttribute('aria-pressed', 'false'); });
    hint.textContent = tiles.length ? '拖入替换 · 拖动交换' : '';
    cancel.hidden = true;
  }
  function choose(slot) {
    selected = slot;
    buttons().forEach(button => { button.classList.toggle('tile-selected', Number(button.dataset.slot) === slot); button.setAttribute('aria-pressed', Number(button.dataset.slot) === slot); });
    hint.textContent = '点海报交换 · 点素材替换'; cancel.hidden = false;
  }
  function clear() { reset(); tiles = []; images = []; layer.replaceChildren(); hint.textContent = ''; }
  function blockClick() {
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
  }
  function start(event, element, action) {
    if (event.button !== 0 || !event.isPrimary) return;
    drag = { element, action, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  }
  function move(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      const pending = drag; drag = null; reset(); drag = pending; drag.moved = true;
      drag.element.setPointerCapture(event.pointerId);
      drag.element.classList.add('sourceSlot' in drag.action ? 'tile-dragging' : 'dragging');
      document.body.classList.add('poster-dragging');
      const id = drag.action.imageId ?? tiles[drag.action.sourceSlot]?.imageId;
      const source = images.find(image => image.id === id);
      const thumbnail = drag.element.querySelector('img');
      if (source || thumbnail) {
        ghost = document.createElement('img'); ghost.className = 'poster-drag-ghost'; ghost.alt = ''; ghost.draggable = false;
        ghost.src = source?.src || thumbnail.src; document.body.append(ghost);
      }
    }
    event.preventDefault();
    if (ghost) { ghost.style.left = `${event.clientX + 12}px`; ghost.style.top = `${event.clientY + 12}px`; }
    const button = canEdit() ? dropButton(event) : null;
    buttons().forEach(item => item.classList.toggle('tile-target', item === button));
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.image-item');
    library.querySelectorAll('.image-item').forEach(item => item.classList.toggle('drop-target', !button && Boolean(drag.action.imageId) && item === target && item !== drag.element));
  }
  function finish(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) { drag = null; return; }
    const action = drag.action, button = canEdit() ? dropButton(event) : null;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.image-item');
    event.preventDefault(); blockClick(); reset();
    if (button) void onEdit(Number(button.dataset.slot), action);
    else if (action.imageId && target && library.contains(target) && canReorder()) onReorder(action.imageId, target.dataset.id);
  }
  // Pointer capture keeps fast cross-panel drags reliable and supports pen/touch.
  // Native image dragging can lose the final drop when crossing the canvas margin.
  for (const element of [layer, library]) element.addEventListener('dragstart', event => event.preventDefault());
  layer.addEventListener('pointerdown', event => {
    const button = tileButton(event);
    if (button && canEdit()) start(event, button, { sourceSlot: Number(button.dataset.slot) });
  });
  library.addEventListener('pointerdown', event => {
    const item = event.target.closest('.image-item');
    if (item && !event.target.closest('input, button') && canReorder()) start(event, item, { imageId: item.dataset.id });
  });
  document.addEventListener('pointermove', move, { passive: false });
  document.addEventListener('pointerup', finish);
  document.addEventListener('pointercancel', () => { if (drag) reset(); });
  document.addEventListener('lostpointercapture', () => { if (drag) reset(); });
  window.addEventListener('blur', () => { if (drag) reset(); });
  document.addEventListener('click', event => {
    if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; }
  }, true);
  layer.addEventListener('click', event => {
    const button = tileButton(event); if (!button || !canEdit()) return;
    const slot = Number(button.dataset.slot);
    if (selected === null) choose(slot);
    else if (selected === slot) reset();
    else { const sourceSlot = selected; reset(); void onEdit(slot, { sourceSlot }); }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { if (drag?.moved) blockClick(); reset(); } });
  surface.addEventListener('click', event => { if (!tileButton(event)) reset(); });
  cancel.addEventListener('click', reset);
  return {
    clear, reset,
    get tiles() { return tiles; },
    replaceSelected(imageId) {
      if (selected === null || !canEdit()) return false;
      const target = selected; reset(); void onEdit(target, { imageId }); return true;
    },
    render(nextTiles, nextImages, canvasWidth, canvasHeight) {
      reset(); tiles = nextTiles; images = nextImages; width = canvasWidth; height = canvasHeight;
      hint.textContent = tiles.length ? '拖入替换 · 拖动交换' : '';
      const titles = new Map(images.map(image => [image.id, image.title]));
      layer.replaceChildren(...tiles.map((tile, slot) => {
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'preview-tile'; button.dataset.slot = slot; button.dataset.imageId = tile.imageId;
        button.setAttribute('aria-label', `位置 ${slot + 1}：${titles.get(tile.imageId)}`); button.setAttribute('aria-pressed', 'false');
        button.title = `${titles.get(tile.imageId)} · 拖动或点选交换`;
        Object.assign(button.style, { left: `${tile.x / width * 100}%`, top: `${tile.y / height * 100}%`, width: `${tile.w / width * 100}%`, height: `${tile.h / height * 100}%` });
        return button;
      }));
    },
  };
}
