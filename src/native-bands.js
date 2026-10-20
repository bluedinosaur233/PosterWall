import { random } from './layout.js';
import { heartSpans } from './heart.js';

// A size means a shared image height. Width always follows the source ratio.
// Work in integer height units, then scale the entire composition once. Never
// justify an individual row or image: that would introduce unrequested sizes.
function profile(shape, y, aspect) {
  if (shape === 'heart') return heartSpans(y)[0] || [.5, .5];
  const width = shape === 'circle' ? Math.sqrt(Math.max(0, 1 - (2 * y - 1) ** 2))
    : shape === 'arch' && y < aspect / 2 ? Math.sqrt(Math.max(0, 1 - (y / (aspect / 2) - 1) ** 2)) : 1;
  return [(1 - width) / 2, (1 + width) / 2];
}

function shuffled(items, rng) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)); [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Choose how many whole sources belong in each fixed-height band. Rounding
// changes the outside steps, never the size of the posters inside a band.
function planBands(items, heights, shape, aspect, start, end, half, core = 0, refine = false, seed = 0) {
  const height = heights.reduce((a, b) => a + b, 0) + core;
  const fullHeight = height / (end - start), fullWidth = fullHeight * aspect;
  let y = core;
  const bands = heights.map(h => {
    const t = start + (y + h / 2) / fullHeight;
    let [left, right] = profile(shape, t, aspect);
    if (half) right = Math.min(.5, right);
    const band = { h, y, left, right, target: Math.max(.05, right - left) * fullWidth };
    y += h; return band;
  });
  const weights = bands.map(b => b.target / b.h), total = weights.reduce((a, b) => a + b, 0);
  const remaining = items.length - bands.length;
  const counts = weights.map(w => 1 + Math.floor(remaining * w / total));
  const fractions = weights.map((w, i) => ({ i, f: remaining * w / total % 1 })).sort((a, b) => b.f - a.f);
  for (let n = items.length - counts.reduce((a, b) => a + b, 0), i = 0; i < n; i++) counts[fractions[i].i]++;
  const cache = new Map();
  function blocks(row, at, n, geometry = false) {
    const key = `${row}/${at}/${n}`;
    if (!geometry && cache.has(key)) return { width: cache.get(key) };
    const h = bands[row].h, used = new Set(), result = [];
    let width = 0;
    for (let i = 0; i < n; i++) {
      if (used.has(i)) continue;
      const stack = [items[at + i]];
      // Only equal-aspect sources can stack without creating new widths or
      // padding. Keep the first tile full-height so every band size is present.
      if (i && h > 1 && (at + i + row) % 3 !== 0) {
        const max = h % 2 === 0 ? 2 : h === 3 ? 3 : 1;
        const matches = [];
        for (let j = i + 1; j < n && matches.length < max - 1; j++) {
          if (!used.has(j) && Math.abs(items[at + j].aspect - items[at + i].aspect) < 1e-12) matches.push(j);
        }
        if (matches.length === max - 1) for (const j of matches) { stack.push(items[at + j]); used.add(j); }
      }
      const w = items[at + i].aspect * h / stack.length;
      width += w;
      if (geometry) result.push({ stack, w });
    }
    cache.set(key, width); return { blocks: result, width };
  }
  const cost = (row, at, n) => Math.log(blocks(row, at, n).width / bands[row].target) ** 2;
  const totalCost = () => {
    let at = 0, score = 0, width = 0, worst = 0, previous = null;
    counts.forEach((n, row) => {
      const mismatch = cost(row, at, n), w = blocks(row, at, n).width;
      score += mismatch * 8 / bands.length; worst = Math.max(worst, mismatch);
      if (previous && shape === 'circle' && end === .5 && w < previous) score += Math.log(previous / w) ** 2 * 200;
      if (previous && shape === 'heart' && start + bands[row].y / fullHeight > .3 && w > previous) score += Math.log(w / previous) ** 2 * 200;
      previous = w;
      width = Math.max(width, half ? (w + (.5 - bands[row].right) * fullWidth) * 2 : w); at += n;
    });
    const ratio = width / fullHeight / aspect;
    return score + worst * 8 + Math.log(ratio) ** 2 * (shape === 'circle' ? 1000 : 30)
      + (shape === 'circle' ? Math.max(0, Math.abs(ratio - 1) - .025) ** 2 * 100000 : 0);
  };
  for (let pass = 0; pass < 3; pass++) {
    let at = 0, changed = false;
    for (let row = 0; row < counts.length - 1; row++) {
      const n = counts[row], m = counts[row + 1];
      let best = totalCost(), change = 0;
      for (const delta of [-1, 1]) if (n + delta > 0 && m - delta > 0) {
        counts[row] = n + delta; counts[row + 1] = m - delta;
        const score = totalCost();
        counts[row] = n; counts[row + 1] = m;
        if (score < best) { best = score; change = delta; }
      }
      counts[row] += change; counts[row + 1] -= change; at += counts[row]; changed ||= change !== 0;
    }
    if (!changed) break;
  }
  if (refine && items.length <= 120) {
    let states = new Map([[0, { score: 0, counts: [], width: 0, maxWidth: 0 }]]);
    for (let row = 0; row < bands.length; row++) {
      const next = new Map(), left = bands.length - row - 1;
      for (const [at, state] of states) {
        const last = items.length - at - left;
        for (let n = left ? 1 : last; n <= last; n++) {
          const width = blocks(row, at, n).width, mismatch = cost(row, at, n);
          let score = state.score + mismatch + mismatch ** 2 * 8;
          if (state.width && shape === 'circle' && width < state.width) score += Math.log(state.width / width) ** 2 * 50;
          if (state.width && shape === 'heart' && start + bands[row].y / fullHeight > .3 && width > state.width) score += Math.log(width / state.width) ** 2 * 50;
          const maxWidth = Math.max(state.maxWidth, half ? (width + (.5 - bands[row].right) * fullWidth) * 2 : width);
          if (!left) score += Math.log(maxWidth / fullWidth) ** 2 * 60;
          if (!next.has(at + n) || score < next.get(at + n).score) next.set(at + n, { score, counts: [...state.counts, n], width, maxWidth });
        }
      }
      states = next;
    }
    const result = states.get(items.length);
    if (result) counts.splice(0, counts.length, ...result.counts);
  }
  let at = 0;
  const tiles = [];
  for (const [row, band] of bands.entries()) {
    const n = counts[row], { blocks: packed, width } = blocks(row, at, n, true);
    // Heart shoulders have an open center notch. All other bands meet their
    // center axis or are centered around it, so the connected body has no holes.
    let x = half ? (band.right - .5) * fullWidth - width : -width / 2;
    for (const block of shuffled(packed, random(seed ^ Math.imul(row + 1, 2654435761)))) {
      const h = band.h / block.stack.length;
      block.stack.forEach((item, i) => tiles.push({ index: item.index, x, y: band.y + i * h, w: block.w, h, level: h }));
      x += block.w;
    }
    at += n;
  }
  const minX = Math.min(...tiles.map(t => t.x)), maxX = Math.max(...tiles.map(t => t.x + t.w));
  const width = half ? -minX * 2 : maxX - minX;
  return { tiles, score: totalCost(), height, fullHeight, width, heights };
}

function bands(items, shape, aspect, level, seed, { start = 0, end = 1, half = false, core = 0, required = [] } = {}) {
  if (!items.length) return { tiles: [], height: core };
  const rng = random(seed), sizes = Array.from({ length: Math.min(level, items.length) }, (_, i) => i + 1);
  const needed = required.length ? required : sizes;
  const candidates = [];
  const maxRows = Math.min(items.length, Math.ceil(Math.sqrt(items.length) * 2.4 + level));
  for (let rows = Math.max(1, needed.length); rows <= maxRows; rows++) {
    const tried = new Set();
    for (let variation = 0; variation < 4; variation++) {
      const heights = shuffled([...needed, ...Array.from({ length: rows - needed.length }, () => sizes[Math.floor(rng() ** 1.4 * sizes.length)])], rng);
      // Put smaller bands near the curved perimeter, but keep seeded variation
      // inside. A single source still has exactly one size.
      if (shape !== 'square' && shape !== 'portrait' && shape !== 'landscape') {
        const sizes = [...heights].sort((a, b) => b - a);
        const positions = heights.map((_, i) => i).sort((a, b) => {
          const center = shape === 'heart' ? .42 : 1;
          return Math.abs((a + .5) / rows - center) - Math.abs((b + .5) / rows - center);
        });
        positions.forEach((position, i) => { heights[position] = sizes[i]; });
      }
      const key = heights.join(',');
      if (tried.has(key)) continue;
      tried.add(key);
      const plan = planBands(items, heights, shape, aspect, start, end, half, core, false, seed);
      candidates.push(plan);
      candidates.sort((a, b) => a.score - b.score);
      if (candidates.length > (half && shape === 'circle' ? 3 : 1)) candidates.pop();
    }
  }
  return candidates.map(candidate => planBands(items, candidate.heights, shape, aspect, start, end, half, core, true, seed)).sort((a, b) => a.score - b.score)[0];
}

function pairsOf(items) {
  const pending = new Map(), pairs = [];
  for (const item of items) {
    const key = item.aspect.toPrecision(12);
    if (pending.has(key)) { pairs.push([pending.get(key), item]); pending.delete(key); }
    else pending.set(key, item);
  }
  return { pairs, unmatched: [...pending.values()] };
}

export function availableLevels(ratios, shape, repeat, requested = null) {
  if (!ratios.length) return 4;
  if (repeat) {
    const { value, step } = posterCapacity(ratios.length, shape, true, requested);
    return Math.min(4, value / step);
  }
  if (shape !== 'circle') return Math.min(4, ratios.length);
  const { pairs, unmatched } = pairsOf(ratios.map((aspect, index) => ({ aspect, index })));
  return Math.min(4, pairs.length + Number(unmatched.length > 0));
}

export function posterCapacity(sourceCount, shape, repeat, requested = null) {
  const step = repeat ? shape === 'heart' ? 2 : shape === 'circle' ? 4 : 1 : 1;
  const min = repeat ? Math.max(step, sourceCount * step) : 1;
  const max = repeat ? 600 : Math.max(1, sourceCount);
  const value = Math.max(min, Math.min(max, Math.round((requested ?? (repeat ? 216 : sourceCount)) / step) * step));
  return { min, max, step, value: sourceCount ? value : 0 };
}

function uniqueCircle(items, aspect, level, seed) {
  const { pairs, unmatched } = pairsOf(items);
  const count = Math.min(level, pairs.length + Number(unmatched.length > 0));
  if (!pairs.length) {
    const width = unmatched.reduce((sum, item) => sum + item.aspect, 0);
    let x = -width / 2;
    return unmatched.map(item => { const t = { index: item.index, x, y: 0, w: item.aspect, h: 1, level: 1 }; x += t.w; return t; });
  }
  let best;
  for (const coreHeight of unmatched.length ? Array.from({length:count}, (_,i)=>i+1) : [0]) {
    const required = Array.from({ length: count }, (_, i) => i + 1).filter(h => h !== coreHeight);
    const top = bands(pairs.map(([item], index) => ({ ...item, index })), 'circle', aspect, count, seed, { end: .5, required });
    const coreWidth = unmatched.reduce((sum, item) => sum + item.aspect * coreHeight, 0), height = top.height * 2 + coreHeight;
    const width = Math.max(coreWidth, top.width);
    let score = Math.log(width / height / aspect) ** 2 * 50;
    if (coreHeight) score += Math.log(coreWidth / width) ** 2 * 10;
    const edges = [...new Set(top.tiles.flatMap(t => [t.y, t.y + t.h]))].sort((a,b)=>a-b);
    for (let i=1;i<edges.length;i++) {
      const y=(edges[i]+edges[i-1])/2, row=top.tiles.filter(t=>t.y<y&&t.y+t.h>y);
      const actual=Math.max(...row.map(t=>t.x+t.w))-Math.min(...row.map(t=>t.x));
      const target=height*aspect*Math.sqrt(Math.max(.01,1-(2*y/height-1)**2));
      score+=Math.log(actual/target)**2/edges.length;
    }
    if (!best || score < best.score) best={top,coreHeight,coreWidth,score};
  }
  const {top,coreHeight,coreWidth}=best;
  let x=-coreWidth/2;
  const center=unmatched.map(item=>{const t={index:item.index,x,y:-coreHeight/2,w:item.aspect*coreHeight,h:coreHeight,level:coreHeight};x+=t.w;return t;});
  return [...center,...top.tiles.flatMap(t=>{
    const y=t.y-top.height-coreHeight/2;
    return [{...t,index:pairs[t.index][0].index,y},{...t,index:pairs[t.index][1].index,y:-y-t.h}];
  })];
}

function uniqueHeart(items, aspect, level, seed) {
  const { pairs } = pairsOf(items);
  const shoulders = pairs.slice(0, Math.min(pairs.length, Math.floor(items.length / 8)));
  const used = new Set(shoulders.flat().map(item => item.index));
  const bodyItems = items.filter(item => !used.has(item.index));
  const body = bands(bodyItems, 'heart', aspect, level, seed, { start: .18 });
  if (!shoulders.length) return body.tiles;
  const first = body.tiles.filter(t => t.y === 0), width = Math.max(...first.map(t => t.x + t.w)) * 2;
  const capWidth = shoulders.reduce((sum, [item]) => sum + item.aspect, 0);
  let x = -Math.max(width / 2, capWidth + .25);
  const cap = shoulders.flatMap(([left, right]) => {
    const t = { x, y: -1, w: left.aspect, h: 1, level: 1 }; x += t.w;
    return [{ ...t, index: left.index }, { ...t, index: right.index, x: -t.x - t.w }];
  });
  return [...cap, ...body.tiles];
}

export function levelLayout(count, box, settings, shape, ratios, level, repeat, posterCount) {
  if (!count) return [];
  level = Math.min(level, availableLevels(ratios, shape, repeat, posterCount));
  const rng = random(settings.seed ^ 0x51ed270b), aspect = box.w / box.h;
  let items = ratios.map((aspect, index) => ({ aspect, index })), tiles;
  if (repeat) {
    const sections = shape === 'heart' ? 2 : shape === 'circle' ? 4 : 1;
    const copies = posterCapacity(count, shape, true, posterCount).value / sections;
    const expanded = [];
    while (expanded.length < copies) expanded.push(...shuffled(items, rng).slice(0, copies - expanded.length));
    const region = bands(expanded.map((item, index) => ({ ...item, index })), shape, aspect, level, settings.seed,
      { half: sections > 1, end: sections === 4 ? .5 : 1 });
    const assignments = [expanded.map(item => item.index)], buckets = new Map();
    expanded.forEach((item, i) => {
      const key = item.aspect.toPrecision(12);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(i);
    });
    for (let section = 1; section < sections; section++) {
      const assignment = [...assignments[0]];
      for (const positions of buckets.values()) {
        const sources = shuffled(positions.map(i => expanded[i].index), rng);
        positions.forEach((position, i) => { assignment[position] = sources[i]; });
      }
      assignments.push(assignment);
    }
    tiles = region.tiles.flatMap(t => Array.from({ length: sections }, (_, section) => ({
      ...t, index: assignments[section][t.index],
      x: section % 2 ? -t.x - t.w : t.x,
      y: sections === 4 ? (section >= 2 ? region.height - t.y - t.h : t.y - region.height) : t.y,
    })));
  } else {
    items = shuffled(items, rng);
    tiles = shape === 'circle' ? uniqueCircle(items, aspect, level, settings.seed)
      : shape === 'heart' ? uniqueHeart(items, aspect, level, settings.seed)
        : bands(items, shape, aspect, level, settings.seed).tiles;
  }
  const minX = Math.min(...tiles.map(t => t.x)), maxX = Math.max(...tiles.map(t => t.x + t.w));
  const minY = Math.min(...tiles.map(t => t.y)), maxY = Math.max(...tiles.map(t => t.y + t.h));
  const unit = Math.min(box.w / (maxX - minX), box.h / (maxY - minY));
  const x = box.x + (box.w - (maxX - minX) * unit) / 2 - minX * unit;
  const y = box.y + (box.h - (maxY - minY) * unit) / 2 - minY * unit;
  // A shared proportional inset preserves the palette even for explicit gaps.
  const shrink = 1 - Math.min(.18, (settings.gap || 0) / unit / Math.max(.1, Math.min(...ratios)));
  return tiles.map((t, instance) => ({ ...t, instance,
    x: x + (t.x + t.w * (1 - shrink) / 2) * unit,
    y: y + (t.y + t.h * (1 - shrink) / 2) * unit,
    w: t.w * unit * shrink, h: t.h * unit * shrink,
  }));
}
