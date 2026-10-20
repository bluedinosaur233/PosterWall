import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { DEFAULTS, TEMPLATES, normalizeProject } from '../src/model.js';
import { composition, subjectLayout } from '../src/shapes.js';
import { renderWall } from '../src/render.js';

const box = { x: 43.2, y: 67.4, w: 864, h: 864 };

function assertAxisSymmetry(tiles, axis) {
  const position = axis === 'x' ? 'y' : 'x', size = axis === 'x' ? 'h' : 'w';
  const spanSize = axis === 'x' ? 'w' : 'h';
  const center2 = 2 * box[axis] + box[spanSize];
  const boundaries = [...new Set(tiles.flatMap(t => [t[position], t[position] + t[size]]))].sort((a, b) => a - b);
  for (let i = 1; i < boundaries.length; i++) {
    if (boundaries[i] - boundaries[i - 1] < 1e-7) continue;
    const sample = (boundaries[i] + boundaries[i - 1]) / 2;
    const ranges = tiles.filter(t => sample > t[position] && sample < t[position] + t[size])
      .map(t => [t[axis], t[axis] + t[spanSize]]).sort((a, b) => a[0] - b[0]);
    const spans = [];
    for (const range of ranges) {
      if (spans.length && range[0] <= spans.at(-1)[1] + 1e-7) spans.at(-1)[1] = Math.max(spans.at(-1)[1], range[1]);
      else spans.push([...range]);
    }
    for (let j = 0; j < spans.length; j++) {
      const reflected = spans[spans.length - 1 - j];
      assert.ok(Math.abs(spans[j][0] + reflected[1] - center2) < 1e-6, `${axis} leading edge differs`);
      assert.ok(Math.abs(spans[j][1] + reflected[0] - center2) < 1e-6, `${axis} trailing edge differs`);
    }
  }
}

test('circle outline has both reflection axes across counts, levels, templates and repetition modes', () => {
  for (const repeat of [false, true]) for (const level of [1, 2, 3, 4]) for (const seed of [0, 234]) for (const count of [1, 3, 18, 49, 100]) for (const template of TEMPLATES) {
    const ratios = Array.from({ length: count }, (_, i) => [.5, 2 / 3, .68, 1, 1.5][i % 5]);
    const tiles = subjectLayout(count, box, { ...DEFAULTS, template, seed }, 'circle', ratios, level, repeat);
    assert.equal(new Set(tiles.map(t => t.index)).size, count);
    if (!repeat) assert.equal(tiles.length, count, 'no implicit reuse');
    for (const [i, tile] of tiles.entries()) {
      assert.ok(Math.abs(tile.w / tile.h - ratios[tile.index]) < 1e-7, 'native aspect must be preserved');
      assert.ok(tile.x >= box.x - 1e-6 && tile.x + tile.w <= box.x + box.w + 1e-6);
      assert.ok(tile.y >= box.y - 1e-6 && tile.y + tile.h <= box.y + box.h + 1e-6);
      for (const other of tiles.slice(i + 1)) assert.ok(
        Math.min(tile.x + tile.w, other.x + other.w) - Math.max(tile.x, other.x) < 1e-6 ||
        Math.min(tile.y + tile.h, other.y + other.h) - Math.max(tile.y, other.y) < 1e-6, 'overlapping sources');
    }
    assertAxisSymmetry(tiles, 'x'); assertAxisSymmetry(tiles, 'y');
  }
  const uniqueRatios = Array.from({ length: 18 }, (_, i) => .55 + i * .017);
  const sparse = subjectLayout(18, box, DEFAULTS, 'circle', uniqueRatios, 4, false);
  assert.equal(sparse.length, 18);
  assertAxisSymmetry(sparse, 'x'); assertAxisSymmetry(sparse, 'y');
});

test('repeated circle remains round across seeds without losing its size hierarchy', () => {
  const ratios = Array.from({ length: 18 }, (_, i) => [.63, .67, .7, .75][i % 4]);
  for (const seed of [0, 233, 234, 1000]) for (const level of [1, 2, 3, 4]) {
    const make = () => subjectLayout(18, box, { ...DEFAULTS, seed }, 'circle', ratios, level, true);
    const tiles = make();
    assert.deepEqual(tiles, make());
    const width = Math.max(...tiles.map(t => t.x + t.w)) - Math.min(...tiles.map(t => t.x));
    const height = Math.max(...tiles.map(t => t.y + t.h)) - Math.min(...tiles.map(t => t.y));
    assert.ok(Math.abs(width / height - 1) < .04, 'circle must not become an oval');
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const filled = (x, y) => tiles.some(t => cx + x * width >= t.x - 1e-7 && cx + x * width <= t.x + t.w + 1e-7 && cy + y * height >= t.y - 1e-7 && cy + y * height <= t.y + t.h + 1e-7);
    assert.ok(filled(0, 0) && filled(.35, 0) && filled(0, .35), 'body must reach all axes');
    assert.ok(!filled(.45, .45), 'corners must remain outside the circle');
    const uses = ratios.map((_, index) => tiles.filter(t => t.index === index).length);
    assert.ok(uses.every(n => n > 0), 'all sources stay present');
    for (const ratio of new Set(ratios)) {
      const peers = uses.filter((_, i) => ratios[i] === ratio);
      assert.ok(Math.max(...peers) - Math.min(...peers) <= 1, 'equal-ratio sources rotate evenly');
    }
  }
});

test('circle PNG has two pixel-symmetric axes and upright complete sources at all export scales', () => {
  const sources = [createCanvas(60, 90), createCanvas(68, 100), createCanvas(60, 90), createCanvas(68, 100)];
  const corners = [[0, 0, '#ff0000', [255,0,0,255]], [.5, 0, '#00ff00', [0,255,0,255]], [0, .5, '#0000ff', [0,0,255,255]], [.5, .5, '#ffff00', [255,255,0,255]]];
  for (const source of sources) for (const [x, y, color] of corners) {
    const ctx = source.getContext('2d'); ctx.fillStyle = color;
    ctx.fillRect(x * source.width, y * source.height, source.width / 2, source.height / 2);
  }
  for (const scale of [1, 2, 3]) for (const repeat of [false, true]) {
    const project = normalizeProject({ version: 1, images: sources.map((_, i) => ({ src: `${i}.png` })), subject: { shape: 'circle', granularity: 4, repeat, scale: .73, x: .17, y: .37 }, base: { preset: 'none' } });
    const canvas = createCanvas(1, 1), tiles = renderWall(canvas, project, sources, scale), ctx = canvas.getContext('2d');
    const { box: b } = composition(project), cx = Math.round((b.x + b.w / 2) * scale), cy = Math.round((b.y + b.h / 2) * scale);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const alpha = (x, y) => x < 0 || y < 0 || x >= canvas.width || y >= canvas.height ? 0 : pixels[(y * canvas.width + x) * 4 + 3];
    let horizontal = 0, vertical = 0, partial = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const value = alpha(x, y);
      horizontal += value !== alpha(2 * cx - 1 - x, y);
      vertical += value !== alpha(x, 2 * cy - 1 - y);
      partial += value !== 0 && value !== 255;
    }
    assert.equal(horizontal, 0, 'left/right alpha mismatch'); assert.equal(vertical, 0, 'top/bottom alpha mismatch');
    assert.equal(partial, 0, 'translucent seams');
    for (const tile of tiles) for (const [x, y, , color] of corners) {
      assert.deepEqual([...ctx.getImageData(Math.floor((tile.x + tile.w * (x + .25)) * scale), Math.floor((tile.y + tile.h * (y + .25)) * scale), 1, 1).data], color, 'source was flipped or cropped');
    }
  }
});
