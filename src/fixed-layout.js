import { FIXED_TEMPLATES } from './fixed-templates.js';
import { random } from './layout.js';

export const TILE_RATIOS = { portrait: 2 / 3, landscape: 3 / 2, square: 1 };
export const TILE_LABELS = { portrait: '2:3', landscape: '3:2', square: '1:1' };
const plansFor = subject => FIXED_TEMPLATES[`${subject.tileRatio}/${subject.shape}/${subject.granularity}`] ?? [];
export function fixedCounts(subject, sourceCount = 200) {
  return [...new Set(plansFor(subject).map(p => p.tiles.length))].filter(n => n <= Math.min(sourceCount, 200)).sort((a, b) => a - b);
}
const nearest = (values, target) => values.reduce((best, n) => Math.abs(n - target) < Math.abs(best - target) ? n : best);
export function fixedQuantityOptions(subject) {
  return fixedCounts(subject);
}
export function fixedQuantityState(subject, sourceCount) {
  const counts = fixedQuantityOptions(subject);
  const available = counts.filter(n => n <= sourceCount);
  let selected = null;
  if (sourceCount && counts.length) {
    // Keep an existing selection when repeat is switched off, even if it is
    // now disabled. Switching repeat back on unlocks that exact composition.
    selected = counts.includes(subject.count) ? subject.count
      : subject.count == null ? (available.at(-1) ?? counts[0])
      : nearest(subject.repeat || !available.length ? counts : available, subject.count);
  }
  return { selected, options: counts.map(count => ({ count, disabled: !sourceCount || (!subject.repeat && count > sourceCount) })) };
}
export function incompatibleImages(ratios, subject, indices = null) {
  if (subject.tileRatio === 'native' || subject.crop) return [];
  const count = subject.count ?? fixedQuantityState(subject, ratios.length).selected;
  const used = indices ? [...new Set(indices)] : ratios.slice(0, count ?? ratios.length).map((_, i) => i);
  return used.filter(i => Math.abs(ratios[i] - TILE_RATIOS[subject.tileRatio]) > 1e-8);
}

// Assign art after geometry. Every source has a fixed, balanced quota; nearby
// repeats have a much higher cost than distant repeats. Large tiles are placed
// first so the same cover cannot dominate several focal points.
export function distributeSources(tiles, sourceCount, seed) {
  const rng = random(seed ^ 0x6fa821), order = Array.from({ length: sourceCount }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const remaining = Array(sourceCount).fill(Math.floor(tiles.length / sourceCount));
  for (let i = 0; i < tiles.length % sourceCount; i++) remaining[order[i]]++;
  const positions = Array.from({ length: sourceCount }, () => []), areas = Array(sourceCount).fill(0);
  const entries = tiles.map((tile, i) => ({ ...tile, i, jitter: rng() }));
  const neighbors = tiles.map(() => []);
  for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) {
    const a = tiles[i], b = tiles[j];
    const dx = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
    const dy = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
    if (dx < 1e-7 && dy < 1e-7) { neighbors[i].push(j); neighbors[j].push(i); }
  }
  const assignments = Array(tiles.length).fill(-1);
  entries.sort((a, b) => b.w * b.h - a.w * a.h || a.jitter - b.jitter);
  const totalArea = tiles.reduce((sum, t) => sum + t.w * t.h, 0);
  for (const tile of entries) {
    let best, bestScore = Infinity;
    for (const index of order) {
      if (!remaining[index]) continue;
      let score = neighbors[tile.i].filter(i => assignments[i] === index).length * 1e6;
      for (const other of positions[index]) {
        const distance = ((tile.x + tile.w / 2 - other.x - other.w / 2) ** 2 + (tile.y + tile.h / 2 - other.y - other.h / 2) ** 2) / totalArea;
        score += 1 / Math.max(.0001, distance);
      }
      score += areas[index] / totalArea * 100 + rng() * .01;
      if (score < bestScore) { bestScore = score; best = index; }
    }
    assignments[tile.i] = best; remaining[best]--; positions[best].push(tile); areas[best] += tile.w * tile.h;
  }
  // Resolve unlucky final quota choices with swaps, keeping the quotas exact.
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < tiles.length; i++) {
    const source = assignments[i];
    const old = neighbors[i].filter(j => assignments[j] === source).length;
    if (!old) continue;
    for (const { i: j } of entries) {
      if (assignments[j] === source || neighbors[i].includes(j)) continue;
      const other = assignments[j];
      const before = old + neighbors[j].filter(k => assignments[k] === other).length;
      const after = neighbors[i].filter(k => assignments[k] === other).length + neighbors[j].filter(k => assignments[k] === source).length;
      if (after < before) { assignments[i] = other; assignments[j] = source; break; }
    }
  }
  return tiles.map((tile, i) => ({ ...tile, index: assignments[i], instance: i }));
}

export function fixedLayout(sourceCount, box, subject, seed) {
  if (!sourceCount) return [];
  const count = subject.count ?? fixedQuantityState(subject, sourceCount).selected;
  if (!subject.repeat && count > sourceCount) throw new Error(`此档需要 ${count} 张素材，当前 ${sourceCount} 张。请添加图片或允许重复。`);
  return distributeSources(fixedGeometry(box, subject, seed, count), Math.min(sourceCount, count), seed);
}

export function fixedGeometry(box, subject, seed, count = subject.count) {
  const candidates = plansFor(subject).filter(p => p.tiles.length === count && count <= 200);
  if (!candidates.length) throw new Error('当前数量与此模板不兼容，请选择可用数量档位。');
  const rng = random(seed), plan = candidates[Math.floor(rng() * candidates.length)], ratio = TILE_RATIOS[subject.tileRatio];
  const unit = Math.min(box.w / (plan.w * ratio), box.h / plan.h), left = box.x + (box.w - plan.w * ratio * unit) / 2, top = box.y + (box.h - plan.h * unit) / 2;
  const palette = [...new Set(plan.tiles.map(t => t[2]))].sort((a, b) => a - b);
  const flipX = rng() > .5, flipY = ['square', 'portrait', 'landscape', 'circle'].includes(subject.shape) && rng() > .5;
  const tiles = plan.tiles.map(([x, y, size]) => ({ x: left + (flipX ? plan.w - x - size : x) * ratio * unit,
    y: top + (flipY ? plan.h - y - size : y) * unit, w: size * ratio * unit, h: size * unit, level: palette.indexOf(size) + 1 }));
  return tiles;
}
