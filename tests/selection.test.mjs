import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { normalizeProject, selectedImages, projectAssets } from '../src/model.js';
import { fixedQuantityState } from '../src/fixed-layout.js';
import { renderWall } from '../src/render.js';
import { renderProject } from '../scripts/render.mjs';

function fixture() {
  const sources = ['#ff0000', '#00ff00', '#0000ff'].map((color, index) => {
    const canvas = createCanvas(index === 1 ? 30 : 20, 30);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  });
  const project = normalizeProject({ version: 1, base: { preset: 'none' },
    subject: { shape: 'square', tileRatio: 'portrait', count: 6, repeat: true },
    images: sources.map((canvas, index) => ({ id: String(index), src: canvas.toDataURL('image/png'), selected: index === 2 })) });
  return { project, sources };
}

test('selection defaults preserve existing projects and validation retains excluded assets', () => {
  const { project } = fixture();
  assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(project))), project);
  assert.deepEqual(selectedImages(project).map(image => image.id), ['2']);
  assert.equal(projectAssets(project).length, 3);
  const legacy = structuredClone(project); delete legacy.images[0].selected;
  assert.equal(normalizeProject(legacy).images[0].selected, true);
  for (const invalid of [null, 'false', 0]) {
    legacy.images[0].selected = invalid;
    assert.throws(() => normalizeProject(legacy), /selected/);
  }
});

test('unselected sources never affect ratio checks, capacities, repetition or rendered pixels', () => {
  const { project, sources } = fixture();
  const canvas = createCanvas(1, 1), tiles = renderWall(canvas, project, sources);
  assert.equal(tiles.length, 6);
  assert.ok(tiles.every(tile => tile.index === 2), 'returned indices address the original library');
  for (const tile of tiles) assert.deepEqual([...canvas.getContext('2d').getImageData(Math.floor(tile.x + tile.w / 2), Math.floor(tile.y + tile.h / 2), 1, 1).data], [0, 0, 255, 255]);
  project.subject.repeat = false;
  assert.ok(fixedQuantityState(project.subject, selectedImages(project).length).options.every(option => option.disabled));
  assert.throws(() => renderWall(canvas, project, sources), /当前 1 张/);
  project.subject.repeat = true; project.images[2].selected = false;
  assert.deepEqual(renderWall(canvas, project, sources), []);
  assert.ok(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.every(value => value === 0));
  project.subject.tileRatio = 'native'; project.images[0].selected = true;
  assert.ok(renderWall(canvas, project, sources).every(tile => tile.index === 0));
});

test('CLI exports match the selected composition while portable projects keep the full library', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'posterwall-selection-'));
  try {
    const { project } = fixture();
    const input = join(dir, 'input.json'), first = join(dir, 'first.png'), portablePath = join(dir, 'portable.json');
    await writeFile(input, JSON.stringify(project));
    const result = await renderProject({ input, output: first, project: portablePath, scale: '1' });
    assert.equal(result.images, 1);
    const portable = JSON.parse(await readFile(portablePath, 'utf8'));
    assert.equal(portable.images.length, 3);
    assert.deepEqual(portable.images.map(image => image.selected), [false, false, true]);
    await renderProject({ input: portablePath, output: join(dir, 'second.png'), scale: '1' });
    assert.deepEqual(await readFile(first), await readFile(join(dir, 'second.png')));
    project.images = selectedImages(project);
    await writeFile(input, JSON.stringify(project));
    await renderProject({ input, output: join(dir, 'selected-only.png'), scale: '1' });
    assert.deepEqual(await readFile(first), await readFile(join(dir, 'selected-only.png')));
    project.images[0].selected = false;
    await writeFile(input, JSON.stringify(project));
    await assert.rejects(renderProject({ input, output: first }), /勾选素材/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
