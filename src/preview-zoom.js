const STEPS = [.1, .25, .5, .75, 1, 1.5, 2];
const MARGIN = 24;

export function previewZoom({ stage, surface, zoomIn, zoomOut, fit, value }) {
  const wrap = surface.parentElement;
  let width = 1, height = 1, zoom = 1, fitting = true, available = false;
  let spaceHeld = false, pan = null, suppressClick = false;

  function anchorAt(clientX, clientY) {
    const viewport = stage.getBoundingClientRect(), bounds = surface.getBoundingClientRect();
    const x = clientX ?? viewport.left + stage.clientLeft + stage.clientWidth / 2;
    const y = clientY ?? viewport.top + stage.clientTop + stage.clientHeight / 2;
    return {
      x: (x - bounds.left) / bounds.width, y: (y - bounds.top) / bounds.height,
      viewportX: x - viewport.left - stage.clientLeft, viewportY: y - viewport.top - stage.clientTop,
    };
  }
  function controls() {
    value.value = available ? `${Math.round(zoom * 100)}%` : '—';
    zoomIn.disabled = !available || zoom >= STEPS.at(-1);
    zoomOut.disabled = !available || zoom <= STEPS[0];
    fit.disabled = !available;
    fit.setAttribute('aria-pressed', fitting);
  }
  function layout(anchor) {
    if (!available) return;
    if (fitting) zoom = Math.max(.01, Math.min(1, (stage.clientWidth - MARGIN * 2) / width, (stage.clientHeight - MARGIN * 2) / height));
    const displayWidth = width * zoom, displayHeight = height * zoom;
    surface.style.width = `${displayWidth}px`; surface.style.height = `${displayHeight}px`;
    wrap.style.width = `${Math.max(stage.clientWidth, displayWidth + MARGIN * 2)}px`;
    wrap.style.height = `${Math.max(stage.clientHeight, displayHeight + MARGIN * 2)}px`;
    const viewport = stage.getBoundingClientRect(), bounds = surface.getBoundingClientRect();
    const point = anchor || { x: .5, y: .5, viewportX: stage.clientWidth / 2, viewportY: stage.clientHeight / 2 };
    stage.scrollLeft += bounds.left + bounds.width * point.x - viewport.left - stage.clientLeft - point.viewportX;
    stage.scrollTop += bounds.top + bounds.height * point.y - viewport.top - stage.clientTop - point.viewportY;
    controls();
  }
  function setZoom(next, clientX, clientY) {
    if (!available) return;
    const anchor = anchorAt(clientX, clientY);
    fitting = false; zoom = Math.max(STEPS[0], Math.min(STEPS.at(-1), next)); layout(anchor);
  }
  const enlarge = () => setZoom(STEPS.find(step => step > zoom + .001) ?? STEPS.at(-1));
  const shrink = () => setZoom(STEPS.findLast(step => step < zoom - .001) ?? STEPS[0]);
  zoomIn.addEventListener('click', enlarge);
  zoomOut.addEventListener('click', shrink);
  fit.addEventListener('click', () => { fitting = true; layout(); });
  stage.addEventListener('wheel', event => {
    if (!available || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
    setZoom(zoom * Math.exp(-delta * .005), event.clientX, event.clientY);
  }, { passive: false });
  stage.addEventListener('keydown', event => {
    if (event.key === '+' || event.key === '=') { event.preventDefault(); enlarge(); }
    if (event.key === '-') { event.preventDefault(); shrink(); }
  });
  document.addEventListener('keydown', event => {
    if (event.code !== 'Space' || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (!stage.matches(':hover') && !stage.contains(document.activeElement)) return;
    event.preventDefault(); spaceHeld = true; stage.classList.add('pan-ready');
  });
  document.addEventListener('keyup', event => {
    if (event.code === 'Space') { spaceHeld = false; stage.classList.remove('pan-ready'); }
  });
  function endPan() {
    const previous = pan; pan = null;
    if (previous && stage.hasPointerCapture(previous.id)) stage.releasePointerCapture(previous.id);
    stage.classList.remove('panning');
  }
  window.addEventListener('blur', () => { spaceHeld = false; stage.classList.remove('pan-ready'); endPan(); });
  stage.addEventListener('pointerdown', event => {
    if (!available || surface.inert || !event.isPrimary || ![0, 1].includes(event.button)) return;
    if (stage.scrollWidth <= stage.clientWidth && stage.scrollHeight <= stage.clientHeight) return;
    if (!spaceHeld && event.button !== 1 && event.target.closest('button')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    pan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop };
    stage.setPointerCapture(event.pointerId); stage.classList.add('panning');
  }, true);
  stage.addEventListener('pointermove', event => {
    if (pan?.id !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    stage.scrollLeft = pan.left + pan.x - event.clientX;
    stage.scrollTop = pan.top + pan.y - event.clientY;
  }, true);
  stage.addEventListener('pointerup', event => {
    if (pan?.id !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); endPan();
  }, true);
  stage.addEventListener('click', event => {
    if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; }
  }, true);
  stage.addEventListener('pointercancel', endPan);
  stage.addEventListener('lostpointercapture', endPan);
  new ResizeObserver(() => layout(fitting || !available ? null : anchorAt())).observe(stage);
  controls();
  return {
    update(nextWidth, nextHeight) {
      if (available && width === nextWidth && height === nextHeight) return;
      width = nextWidth; height = nextHeight; available = true; layout();
    },
    clear() {
      available = false; endPan(); wrap.style.width = '100%'; wrap.style.height = '100%';
      stage.scrollLeft = stage.scrollTop = 0; controls();
    },
  };
}
