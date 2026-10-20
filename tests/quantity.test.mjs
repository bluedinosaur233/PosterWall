import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, SHAPES, normalizeProject } from '../src/model.js';
import { subjectLayout } from '../src/shapes.js';
import { availableLevels, posterCapacity, COUNT_PRESETS, quantityOptions } from '../src/levels.js';

const box = { x: 10, y: 20, w: 800, h: 800 };
test('poster quantity validates and survives portable project normalization', () => {
  const make = count => normalizeProject({ version: 1, images: [], subject: { count } });
  assert.equal(make(undefined).subject.count, null);
  for (const count of [0, 601, 2.5, '20']) assert.throws(() => make(count));
  for (const count of [null, 1, 300, 600]) assert.deepEqual(normalizeProject(make(count)), make(count));
});

test('quantity limits select sources without deleting or silently repeating them', () => {
  const ratios = Array.from({ length: 18 }, (_, i) => [.5, 2 / 3, 1, 1.5][i % 4]);
  for (const shape of SHAPES) for (const quantity of [1, 5, 18, 600]) {
    const tiles = subjectLayout(18, box, DEFAULTS, shape, ratios, 4, false, quantity);
    assert.equal(tiles.length, Math.min(18, quantity));
    assert.deepEqual(tiles.map(t => t.index).sort((a, b) => a - b), Array.from({ length: tiles.length }, (_, i) => i));
  }
});

test('repetition quantity and size levels are independent and preserve all sources', () => {
  const ratios = Array(7).fill(2 / 3);
  for (const shape of ['square', 'heart', 'circle']) for (const quantity of COUNT_PRESETS) for (const level of [1, 3]) {
    const tiles = subjectLayout(7, box, DEFAULTS, shape, ratios, level, true, quantity);
    assert.ok(Math.abs(tiles.length-quantity) < quantity*.35, 'quantity selects an approximate template budget');
    assert.equal(new Set(tiles.map(t => t.index)).size, 7);
    assert.equal(new Set(tiles.map(t => +t.h.toFixed(6))).size, level);
    const uses = ratios.map((_, i) => tiles.filter(t => t.index === i).length);
    assert.ok(Math.max(...uses) - Math.min(...uses) <= posterCapacity(7, shape, true, quantity).step);
  }
  assert.equal(posterCapacity(18, 'circle', true, 65).value, 65);
  assert.equal(posterCapacity(18, 'heart', true, 101).value, 101);
  assert.equal(availableLevels([2 / 3], 'circle', true, 96), 4);
  assert.deepEqual(quantityOptions(18, true), COUNT_PRESETS);
  assert.deepEqual(quantityOptions(18, false), [5,9,14,18]);
});

test('more posters refine the circle boundary with the same one-size palette', () => {
  const ratios = Array(18).fill(2 / 3);
  const make = count => subjectLayout(18, box, DEFAULTS, 'circle', ratios, 1, true, count);
  const coarse = make(72), fine = make(400);
  assert.ok(fine[0].h < coarse[0].h);
  assert.ok(new Set(fine.map(t => t.y)).size > new Set(coarse.map(t => t.y)).size);
  assert.equal(new Set(fine.map(t => +t.h.toFixed(6))).size, 1);
});

test('dense circles grow from the rim to the center without a pinched waist', () => {
  const ratios = Array(18).fill(2 / 3);
  ratios[8] = 12 / 17; ratios[13] = .68;
  for (const quantity of [400, 600]) {
    const tiles = subjectLayout(18, box, DEFAULTS, 'circle', ratios, 3, true, quantity);
    const center = box.y + box.h / 2;
    const edges = [...new Set(tiles.flatMap(t => [t.y, t.y + t.h]).filter(y => y <= center))].sort((a, b) => a - b);
    let previous = 0;
    for (let i = 1; i < edges.length; i++) {
      if (edges[i] - edges[i - 1] < 1e-6) continue;
      const y = (edges[i] + edges[i - 1]) / 2;
      const row = tiles.filter(t => t.y < y && t.y + t.h > y);
      const width = Math.max(...row.map(t => t.x + t.w)) - Math.min(...row.map(t => t.x));
      assert.ok(width >= previous - box.w * .04, 'circle must widen towards its center');
      previous = width;
    }
  }
});
