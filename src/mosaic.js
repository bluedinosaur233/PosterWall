import { random } from './layout.js';
import { heartSpans } from './heart.js';
function shuffle(values, rng) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function shapeSpans(shape, y, aspect) {
  if (shape === 'heart') return heartSpans(y);
  const width = shape === 'circle' ? Math.sqrt(Math.max(0, 1 - (2 * y - 1) ** 2))
    : shape === 'arch' && y < aspect / 2 ? Math.sqrt(Math.max(0, 1 - (y / (aspect / 2) - 1) ** 2)) : 1;
  return [[(1 - width) / 2, (1 + width) / 2]];
}
function ratioGroups(ratios) {
  const groups = [];
  ratios.forEach((ratio, index) => {
    let group = groups.find(g => Math.abs(g.ratio - ratio) < 1e-12);
    if (!group) { group = { ratio, indices: [] }; groups.push(group); }
    group.indices.push(index);
  });
  return groups.sort((a, b) => b.indices.length - a.indices.length);
}
function makeGrid(groups, rows, aspect, level, shape, seed) {
  const rng = random(seed), mean = groups.reduce((sum, g) => sum + g.ratio * g.indices.length, 0) / groups.reduce((sum, g) => sum + g.indices.length, 0);
  const halfCount = Math.max(level, Math.round(rows * aspect / mean / 2));
  const width = halfCount * mean * 2;
  const actualRows = Math.max(4, Math.round(width / aspect / 2) * 2), cols = halfCount * 2;
  const pool = shuffle(groups.flatMap((g,i)=>g.indices.map(()=>i)),rng);
  let cursor=0;
  const scaffolds = new Map();
  const bandHeight = Math.max(4, level + 1);
  const bandCount = Math.ceil((shape === 'circle' ? actualRows / 2 : actualRows) / bandHeight);
  if (groups.length > halfCount * bandCount) return { blocks: [], width, height: actualRows, complete: false, levels: 0 };
  const centerBand = Math.floor((shape === 'circle' ? actualRows / 2 - 1 : actualRows * .42) / bandHeight);
  const bandOrder = Array.from({ length: bandCount }, (_, i) => i)
    .sort((a, b) => Math.abs(a - centerBand) - Math.abs(b - centerBand));
  // Spread ratio families over central bands when a coarse grid cannot fit
  // every family in one row. Otherwise rare ratios force all tiers to be dense.
  const reserved = new Map();
  groups.forEach((_, group) => {
    const band = bandOrder[Math.floor(group / halfCount) % bandCount];
    if (!reserved.has(band)) reserved.set(band, []);
    reserved.get(band).push(group);
  });
  const grid = Array.from({length:actualRows}, (_,y) => {
    const band = Math.floor((shape === 'circle' ? Math.min(y, actualRows-1-y) : y) / bandHeight);
    if (!scaffolds.has(band)) {
      const counts=groups.map(()=>0);
      for (const group of reserved.get(band) ?? []) counts[group]++;
      for(let i=counts.reduce((a,b)=>a+b,0);i<halfCount;i++) counts[pool[cursor++%pool.length]]++;
      const runs=[];
      counts.forEach((count,group)=>{while(count){const n=Math.min(count,Math.max(4,level+1));runs.push(Array(n).fill(group));count-=n;}});
      const half = shuffle(runs, rng).flat(), columns = [...half, ...[...half].reverse()];
      const bandWidth=columns.reduce((sum,g)=>sum+groups[g].ratio,0), xs=[(width-bandWidth)/2];
      columns.forEach(group=>xs.push(xs.at(-1)+groups[group].ratio));
      scaffolds.set(band,{columns,xs});
    }
    return scaffolds.get(band);
  });
  const mask = new Uint8Array(cols * actualRows), totals = groups.map(() => 0);
  for (let y = 0; y < actualRows; y++) {
    const {columns,xs}=grid[y];
    const spans = shapeSpans(shape, (y + .5) / actualRows, aspect);
    for (let x = 0; x < cols; x++) {
      const center = (xs[x] + xs[x + 1]) / 2 / width;
      if (spans.some(([left, right]) => center >= left && center <= right)) {
        mask[y * cols + x] = 1; totals[columns[x]]++;
      }
    }
  }
  const occupied = new Uint8Array(mask.length), blocks = [], remaining = [...totals];
  const inside = (x, y, size) => {
    if (x + size > cols || y + size > actualRows) return false;
    const {columns,xs}=grid[y];
    for (let dx = 0; dx < size; dx++) {
      if (columns[x + dx] !== columns[x]) return false;
      for (let dy = 0; dy < size; dy++) {
        if (grid[y+dy].columns[x+dx] !== columns[x] || Math.abs(grid[y+dy].xs[x+dx]-xs[x+dx])>1e-10) return false;
        const at = (y + dy) * cols + x + dx;
        if (!mask[at] || occupied[at]) return false;
      }
    }
    return true;
  };
  const add = (x, y, size) => {
    const {columns,xs}=grid[y];
    blocks.push({ x: xs[x], y, w: groups[columns[x]].ratio * size, h: size, group: columns[x] });
    remaining[columns[x]] -= size * size - 1;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) occupied[(y + dy) * cols + x + dx] = 1;
  };
  const positions = shuffle(Array.from({ length: mask.length }, (_, i) => i), rng);
  const area = totals.reduce((a, b) => a + b, 0);
  for (let size = level; size >= 2; size--) {
    let used = 0;
    const quota = area * (level === 2 ? .55 : level === 3 ? .29 : .22);
    for (const at of positions) {
      const x = at % cols, y = Math.floor(at / cols), group = grid[y].columns[x];
      if (used >= quota) break;
      if (remaining[group] - size * size + 1 < groups[group].indices.length) continue;
      if (inside(x, y, size)) { add(x, y, size); used += size * size; }
    }
  }
  for (let y = 0; y < actualRows; y++) for (let x = 0; x < cols; x++) if (mask[y * cols + x] && !occupied[y * cols + x]) add(x, y, 1);
  const uses = groups.map(() => 0), orders = groups.map(g => shuffle(g.indices, rng));
  for (const block of shuffle(blocks, rng)) block.index = orders[block.group][uses[block.group]++ % orders[block.group].length];
  const left=Math.min(...blocks.map(t=>t.x)),right=Math.max(...blocks.map(t=>t.x+t.w));
  for(const block of blocks)block.x-=left;
  return { blocks, width:right-left, height: actualRows, complete: uses.every((n, i) => n >= groups[i].indices.length), levels: new Set(blocks.map(t => t.h)).size };
}
// The silhouette selects whole cells. Merging cells changes only the internal
// partition, so every template has a gapless, symmetric outline at every level.
export function mosaicLayout(ratios, shape, level, budget, seed, aspect) {
  const groups = ratioGroups(ratios), average = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const areaFactor = shape === 'circle' ? .785 : shape === 'heart' ? .65 : shape === 'arch' ? .9 : 1;
  const tileFactor = [0, 1, 1.65, 2.15, 2.75][level];
  const estimate = Math.sqrt(budget * average * tileFactor / aspect / areaFactor);
  let best;
  for (let step = -8; step <= 8; step++) {
    const plan = makeGrid(groups, Math.max(6, Math.round(estimate) + step), aspect, level, shape, seed);
    const distortion = Math.abs(plan.width / plan.height / aspect - 1);
    const score = Math.abs(plan.blocks.length - budget) / budget + (plan.complete ? 0 : 10) + (level - plan.levels) * 10
      + Math.max(0, distortion - .025) * (shape === 'circle' ? 100 : 8);
    if (!best || score < best.score) best = { ...plan, score };
  }
  return best;
}
