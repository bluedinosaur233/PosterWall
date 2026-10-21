import { selectedImages } from './model.js';
import { fixedGeometry, fixedLayout } from './fixed-layout.js';

export const placementKey = (subject, seed, count = subject.count) =>
  [subject.tileRatio, subject.shape, subject.granularity, count, seed].join('/');

// Resolve IDs only within the selected pool. Stale edits must never reintroduce
// deselected images, duplicates without permission, or a different geometry.
export function placementIndices(subject, seed, images, count = subject.count) {
  const saved = subject.placement;
  if (subject.tileRatio === 'native' || !saved || saved.key !== placementKey(subject, seed, count) || saved.images.length !== count) return null;
  const indices = new Map(images.flatMap((image, index) => image.selected !== false ? [[image.id, index]] : []));
  if (saved.images.some(id => !indices.has(id)) || (!subject.repeat && new Set(saved.images).size !== count)) return null;
  return saved.images.map(id => indices.get(id));
}

export function editPlacement(project, tiles, target, { sourceSlot, imageId } = {}) {
  if (project.subject.tileRatio === 'native') throw new Error('请先选择固定图片比例');
  if (!Number.isInteger(target) || !tiles[target]) throw new Error('请选择海报位置');
  const ids = tiles.map(tile => tile.imageId);
  if (sourceSlot !== undefined) {
    if (!Number.isInteger(sourceSlot) || !tiles[sourceSlot]) throw new Error('来源位置无效');
    if (sourceSlot === target || ids[sourceSlot] === ids[target]) return null;
    [ids[sourceSlot], ids[target]] = [ids[target], ids[sourceSlot]];
  } else {
    if (!project.images.some(image => image.id === imageId)) throw new Error('素材已移除');
    if (ids[target] === imageId) return null;
    const existing = ids.indexOf(imageId);
    if (!project.subject.repeat && existing !== -1) [ids[existing], ids[target]] = [ids[target], ids[existing]];
    else ids[target] = imageId;
  }
  return { key: placementKey(project.subject, project.settings.seed, tiles.length), images: ids };
}

export function imageUsage(tiles) {
  const counts = new Map();
  for (const { imageId } of tiles) counts.set(imageId, (counts.get(imageId) ?? 0) + 1);
  return counts;
}

// Only deselect images actually removed by this edit. Other checked library
// candidates remain available for larger quantities or a new random layout.
export function applyPlacement(project, previousTiles, placement) {
  const previous = new Set(previousTiles.map(tile => tile.imageId));
  const used = new Set(placement.images);
  for (const image of project.images) {
    if (used.has(image.id)) image.selected = true;
    else if (previous.has(image.id)) image.selected = false;
  }
  project.subject.placement = placement;
}

export function setImageSelection(project, ids, selected) {
  const targets = new Set(ids);
  let changed = false;
  for (const image of project.images) {
    if (targets.has(image.id) && (image.selected !== false) !== selected) {
      image.selected = selected; changed = true;
    }
  }
  // A new selection must take part in automatic assignment. Keeping a valid
  // manual map here otherwise silently ignores newly checked sources.
  if (changed) project.subject.placement = null;
  return changed;
}

const unitBox = { x: 0, y: 0, w: 1, h: 1 };
const geometrySignature = tiles => tiles.map(({ x, y, w, h }) => [x, y, w, h].map(n => n.toFixed(8)).join(',')).sort().join(';');
const artSignature = (tiles, ids) => tiles.map((tile, i) => `${[tile.x, tile.y, tile.w, tile.h].map(n => n.toFixed(8)).join(',')}:${ids ? ids[i] : tile.index}`).sort().join(';');

export function nextLayoutSeed(project, candidate) {
  const images = selectedImages(project), { subject, settings } = project;
  const current = fixedGeometry(unitBox, subject, settings.seed);
  const signature = geometrySignature(current);
  const seeds = Array.from({ length: 48 }, (_, i) => (candidate + Math.imul(i, 2654435761)) >>> 0).filter(seed => seed !== settings.seed);
  for (const seed of seeds) if (geometrySignature(fixedGeometry(unitBox, subject, seed)) !== signature) return seed;
  // A uniform grid has only one geometry. Still offer a different art order.
  const currentSlots = fixedLayout(images.length, unitBox, subject, settings.seed);
  const manual = placementIndices(subject, settings.seed, images);
  const previous = artSignature(currentSlots, currentSlots.map((tile, i) => images[manual ? manual[i] : tile.index].id));
  for (const seed of seeds.slice(0, 8)) {
    const slots = fixedLayout(images.length, unitBox, subject, seed);
    if (artSignature(slots, slots.map(tile => images[tile.index].id)) !== previous) return seed;
  }
  return null;
}
