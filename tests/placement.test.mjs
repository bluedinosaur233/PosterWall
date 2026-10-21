import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { normalizeProject } from '../src/model.js';
import { renderWall } from '../src/render.js';
import { fixedGeometry } from '../src/fixed-layout.js';
import { editPlacement, applyPlacement, imageUsage, setImageSelection, nextLayoutSeed, placementIndices } from '../src/placement.js';
import { renderProject } from '../scripts/render.mjs';

function fixture(repeat = false) {
  const sources = Array.from({ length: 14 }, (_, i) => {
    const canvas = createCanvas(20, 30), ctx = canvas.getContext('2d');
    ctx.fillStyle = `rgb(${i * 16},80,120)`; ctx.fillRect(0, 0, 20, 30); return canvas;
  });
  const project = normalizeProject({ version: 1, subject: { tileRatio: 'portrait', shape: 'square', granularity: 4, count: 12, repeat },
    images: sources.map((c, i) => ({ id: `source-${i}`, src: c.toDataURL('image/png'), selected: i < (repeat ? 3 : 12) })) });
  const canvas = createCanvas(1, 1);
  return { project, sources, canvas, tiles: renderWall(canvas, project, sources) };
}
const geometry = tiles => tiles.map(({ x, y, w, h }) => ({ x, y, w, h }));

test('swapping unequal slots changes only those two images and preserves full-image rendering', () => {
  const { project, sources, canvas, tiles } = fixture();
  const target = tiles.findIndex(t => t.h !== tiles[0].h);
  project.subject.placement = editPlacement(project, tiles, target, { sourceSlot: 0 });
  const edited = renderWall(canvas, project, sources);
  assert.deepEqual(geometry(edited), geometry(tiles));
  assert.equal(edited[0].imageId, tiles[target].imageId);
  assert.equal(edited[target].imageId, tiles[0].imageId);
  edited.forEach((tile, i) => {
    if (i !== 0 && i !== target) assert.equal(tile.imageId, tiles[i].imageId);
    assert.deepEqual([...canvas.getContext('2d').getImageData(Math.floor(tile.x + tile.w / 2), Math.floor(tile.y + tile.h / 2), 1, 1).data], [tile.index * 16, 80, 120, 255]);
  });
  assert.equal(editPlacement(project, edited, 0, { sourceSlot: 0 }), null);
});

test('library replacement freezes every other slot, and existing non-repeated art swaps', () => {
  const { project, sources, canvas, tiles } = fixture();
  applyPlacement(project, tiles, editPlacement(project, tiles, 0, { imageId: 'source-13' }));
  assert.equal(project.images.find(image => image.id === tiles[0].imageId).selected, false);
  assert.equal(project.images[13].selected, true);
  const edited = renderWall(canvas, project, sources);
  assert.equal(edited[0].imageId, 'source-13');
  assert.deepEqual(edited.slice(1), tiles.slice(1));
  project.subject.placement = editPlacement(project, edited, 1, { imageId: 'source-13' });
  const swapped = renderWall(canvas, project, sources);
  assert.equal(swapped[1].imageId, 'source-13'); assert.equal(swapped[0].imageId, edited[1].imageId);
  assert.equal(new Set(swapped.map(t => t.imageId)).size, 12);
  const square = createCanvas(30, 30); sources[13] = square;
  assert.throws(() => renderWall(canvas, project, sources), /不符合/);
  project.subject.crop = true; assert.equal(renderWall(canvas, project, sources).length, 12);
});

test('replacement synchronizes selection through undo, reload, random layout and reselecting', () => {
  const { project, sources, canvas, tiles } = fixture();
  project.images[12].selected = true; // An additional candidate not used in these 12 slots.
  const undo = structuredClone(project), removedId = tiles[0].imageId;
  applyPlacement(project, tiles, editPlacement(project, tiles, 0, { imageId: 'source-13' }));
  assert.equal(project.images[12].selected, true, 'keep other explicitly checked candidates');
  assert.equal(project.images.find(image => image.id === removedId).selected, false);
  assert.equal(project.images[13].selected, true);
  const restored = normalizeProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(renderWall(canvas, restored, sources).map(t => t.imageId), project.subject.placement.images);
  assert.equal(restored.images.find(image => image.id === removedId).selected, false);
  assert.deepEqual(renderWall(canvas, undo, sources).map(t => t.imageId), tiles.map(t => t.imageId));
  assert.equal(undo.images[13].selected, false);
  const shuffled = structuredClone(project);
  shuffled.settings.seed = nextLayoutSeed(shuffled, 2026); shuffled.subject.placement = null;
  assert.ok(renderWall(canvas, shuffled, sources).every(t => t.imageId !== removedId), 'random layout cannot bring back a replaced image');
  assert.equal(setImageSelection(project, [removedId], true), true);
  assert.equal(project.subject.placement, null, 'reselecting invalidates the old manual map');
  assert.ok(renderWall(canvas, project, sources).some(t => t.imageId === removedId));
});

test('repeat counts follow actual slots; selection clears only after the last occurrence', () => {
  const { project, sources, canvas, tiles } = fixture(true);
  let current = tiles;
  const removedId = tiles[0].imageId, replacementId = tiles.find(t => t.imageId !== removedId).imageId;
  const start = imageUsage(tiles), replacements = start.get(removedId);
  assert.equal([...start.values()].reduce((sum, count) => sum + count, 0), 12);
  for (let remaining = replacements - 1; remaining >= 0; remaining--) {
    const slot = current.findIndex(tile => tile.imageId === removedId);
    applyPlacement(project, current, editPlacement(project, current, slot, { imageId: replacementId }));
    current = renderWall(canvas, project, sources);
    const counts = imageUsage(current);
    assert.equal(counts.get(removedId) ?? 0, remaining);
    assert.equal(counts.get(replacementId), start.get(replacementId) + replacements - remaining);
    assert.equal(project.images.find(image => image.id === removedId).selected, remaining > 0);
    assert.equal([...counts.values()].reduce((sum, count) => sum + count, 0), 12);
  }
  const target = current.findIndex(tile => tile.imageId !== current[0].imageId);
  const countsBefore = imageUsage(current), selectionBefore = project.images.map(image => image.selected);
  applyPlacement(project, current, editPlacement(project, current, target, { sourceSlot: 0 }));
  assert.deepEqual(imageUsage(renderWall(canvas, project, sources)), countsBefore);
  assert.deepEqual(project.images.map(image => image.selected), selectionBefore);
  assert.equal(imageUsage([]).size, 0);
  setImageSelection(project, project.images.map(image => image.id), true);
  assert.equal(project.subject.placement, null, 'select all must also release the manual map');
  project.subject.repeat = false;
  assert.ok([...imageUsage(renderWall(canvas, project, sources)).values()].every(count => count === 1));
});

test('repeated instances can be swapped or replaced independently', () => {
  const { project, sources, canvas, tiles } = fixture(true);
  const target = tiles.findIndex(t => t.imageId !== tiles[0].imageId);
  project.subject.placement = editPlacement(project, tiles, target, { sourceSlot: 0 });
  const edited = renderWall(canvas, project, sources);
  assert.deepEqual(edited.filter((_, i) => i !== 0 && i !== target), tiles.filter((_, i) => i !== 0 && i !== target));
  project.subject.placement = editPlacement(project, edited, 0, { imageId: edited[target].imageId });
  const replaced = renderWall(canvas, project, sources);
  assert.equal(replaced[0].imageId, edited[target].imageId); assert.deepEqual(replaced.slice(1), edited.slice(1));
});

test('placement survives scale, position and source order; stale configurations cannot reuse edits', () => {
  const { project, sources, canvas, tiles } = fixture();
  project.subject.placement = editPlacement(project, tiles, 1, { sourceSlot: 0 });
  const normalized = normalizeProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(normalized.subject.placement, project.subject.placement);
  for (const change of [{ scale: .5 }, { x: .2, y: .8 }, { crop: true }]) {
    assert.ok(placementIndices({ ...project.subject, ...change }, project.settings.seed, project.images));
  }
  const reversed = { ...project, images: [...project.images].reverse() };
  assert.deepEqual(renderWall(canvas, reversed, [...sources].reverse()).map(t=>t.imageId), project.subject.placement.images);
  for (const change of [{ shape: 'heart' }, { granularity: 3 }, { count: 24 }, { tileRatio: 'native' }]) assert.equal(placementIndices({ ...project.subject, ...change }, project.settings.seed, project.images), null);
  assert.equal(placementIndices(project.subject, project.settings.seed + 1, project.images), null);
  const usedId = project.subject.placement.images[0];
  project.images.find(i=>i.id===usedId).selected = false;
  assert.equal(placementIndices(project.subject, project.settings.seed, project.images), null);
  project.subject.placement.images = Array(201).fill('id');
  assert.throws(() => normalizeProject(project), /placement/);
});

test('random layout prefers different geometry without changing shape, levels or count', () => {
  const { project } = fixture();
  const box = { x: 0, y: 0, w: 1, h: 1 };
  const canonical = tiles => geometry(tiles).map(t=>JSON.stringify(t)).sort().join(';');
  const before = JSON.stringify(project);
  const seed = nextLayoutSeed(project, 12345);
  assert.notEqual(seed, null);
  assert.notEqual(canonical(fixedGeometry(box, project.subject, seed)), canonical(fixedGeometry(box, project.subject, project.settings.seed)));
  assert.equal(JSON.stringify(project), before);
  project.subject.granularity = 1; project.subject.count = 6;
  assert.notEqual(nextLayoutSeed(project, 999), null);
  project.images = project.images.slice(0, 1); project.subject.repeat = true;
  assert.equal(nextLayoutSeed(project, 999), null);
});

test('CLI portable projects retain exact manual placement and excluded library items', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'posterwall-placement-'));
  try {
    const { project, tiles } = fixture();
    applyPlacement(project, tiles, editPlacement(project, tiles, 0, { imageId: 'source-13' }));
    await writeFile(join(dir,'input.json'),JSON.stringify(project));
    await renderProject({input:join(dir,'input.json'),output:join(dir,'a.png'),project:join(dir,'portable.json'),scale:'1'});
    const portable = JSON.parse(await readFile(join(dir,'portable.json'),'utf8'));
    assert.deepEqual(portable.subject.placement, project.subject.placement); assert.equal(portable.images.length, 14);
    assert.equal(portable.images.find(image => image.id === tiles[0].imageId).selected, false);
    assert.equal(portable.images.find(image => image.id === 'source-13').selected, true);
    await renderProject({input:join(dir,'portable.json'),output:join(dir,'b.png'),scale:'1'});
    assert.deepEqual(await readFile(join(dir,'a.png')),await readFile(join(dir,'b.png')));
  } finally { await rm(dir,{recursive:true,force:true}); }
});
