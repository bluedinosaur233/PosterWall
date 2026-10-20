// Generate the finite, reviewable template catalogue used by the web editor.
import { writeFile } from 'node:fs/promises';
import { random } from '../src/layout.js';
import { shapeSpans } from '../src/mosaic.js';
import { selectQuantityPresets } from '../src/quantity-presets.js';

const ratios = { portrait: 2 / 3, landscape: 3 / 2, square: 1 };
const shapes = { square: 1, portrait: 2 / 3, landscape: 3 / 2, heart: 1.12, circle: 1, arch: 2 / 3 };
const catalogue = {};
const gcd = (a, b) => b ? gcd(b, a % b) : a;
function store(key, w, h, tiles) {
  const sizes = new Set(tiles.map(t => t[2])), level = sizes.size;
  if (level > 4 || !level || tiles.length > 200) return;
  const contrast = Math.max(...sizes) / Math.min(...sizes);
  if (contrast > [0, 1, 4, 6, 8][level]) return;
  const largest = Math.max(...sizes) ** 2 / (w * h);
  if (level >= 3 && largest > (level === 4 ? .4 : .45)) return;
  if (/\/(heart|circle|arch)$/.test(key) && tiles.length < 12) return;
  if (tiles.length > 80 && largest > .18) return;
  const group = catalogue[`${key}/${level}`] ??= new Map();
  const previous = group.get(tiles.length);
  // Keep a few geometrically different versions at each capacity.
  const quality = contrast + largest * 40;
  if (previous?.length >= 3 && previous.at(-1).quality <= quality) return;
  const plan = { w, h, tiles, quality };
  if (!previous) group.set(tiles.length, [plan]);
  else if (!previous.some(p => JSON.stringify(p.tiles) === JSON.stringify(tiles))) { previous.push(plan); previous.sort((a,b)=>a.quality-b.quality); if(previous.length>3)previous.pop(); }
}
function rectangle(key, p, q) {
  for (let k = 1; k <= 35; k++) {
    const w = p * k, h = q * k;
    if (w * h > 200) break;
    store(key, w, h, Array.from({ length: w * h }, (_, i) => [i % w, Math.floor(i / w), 1]));
  }
  // Two-size templates can also start with a coarse grid and subdivide a
  // scattered subset. This fills intermediate capacities for wide/tall boxes.
  for (let k = 1; p * q * k * k < 200; k++) for (let variant = 0; variant < 6; variant++) {
    const cols = p * k, rows = q * k, rng = random(801 + variant * 197 + k);
    const coarse = Array.from({ length: cols * rows }, (_, i) => [i % cols * 2, Math.floor(i / cols) * 2, 2]);
    for (let i = coarse.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [coarse[i], coarse[j]] = [coarse[j], coarse[i]]; }
    const fine = [];
    while (coarse.length > 1 && coarse.length + fine.length + 3 <= 200) {
      const [x, y] = coarse.pop();
      fine.push([x, y, 1], [x + 1, y, 1], [x, y + 1, 1], [x + 1, y + 1, 1]);
      store(key, cols * 2, rows * 2, [...coarse, ...fine]);
    }
  }
  // A compact 12-poster, four-size composition, without a dominant full-height
  // tile. The 1/2/3/5 square palette retains exactly four image sizes.
  const twelve = [[0,0,5],[5,0,5],[10,0,2],[10,2,2],[10,4,2],[0,5,3],[3,5,3],[6,5,3],[9,5,1],[9,6,2],[11,6,1],[11,7,1]];
  if(p===3&&q===2)store(key,12,8,twelve);
  if(p===2&&q===3)store(key,8,12,twelve.map(([x,y,s])=>[y,x,s]));
  for(let k=1;k<=44;k++) {
    const w=p*k,h=q*k;if(w*h>900)break;
    for(let level=2;level<=4;level++)for(let variant=0;variant<8;variant++) {
      const rng=random(233+variant*197+k),mask=new Uint8Array(w*h).fill(1),tiles=[],positions=Array.from({length:w*h},(_,i)=>i);
      for(let i=positions.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[positions[i],positions[j]]=[positions[j],positions[i]];}
      for(let size=level;size>=2;size--) {
        let used=0;
        for(const at of positions) {
          if(used>w*h*(level===2?.55:level===3?.29:.22))break;
          const x=at%w,y=Math.floor(at/w);if(x+size>w||y+size>h)continue;
          let free=true;for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++)free&&=mask[(y+dy)*w+x+dx]===1;
          if(!free)continue;tiles.push([x,y,size]);used+=size*size;
          for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++)mask[(y+dy)*w+x+dx]=0;
        }
      }
      for(let i=0;i<mask.length;i++)if(mask[i])tiles.push([i%w,Math.floor(i/w),1]);
      if(new Set(tiles.map(t=>t[2])).size===level)store(key,w,h,tiles);
    }
  }
  // Euclidean square tilings have perfectly straight boundaries. Splitting
  // complete squares adds hierarchy without changing any outside edge.
  for (let variant = 0; variant < 60; variant++) {
    const rng = random(233 + variant), scale = 96, w = p * scale, h = q * scale;
    let tiles = [];
    function fill(x, y, width, height) {
      if (!width || !height) return;
      const side = Math.min(width, height);
      tiles.push([x, y, side]);
      if (width > height) fill(x + side, y, width - side, height);
      else if (height > width) fill(x, y + side, width, height - side);
    }
    fill(0, 0, w, h);
    store(key, w, h, tiles);
    while (tiles.length < 200) {
      const candidates = [];
      const frequencies = new Map();
      for (const tile of tiles) frequencies.set(tile[2], (frequencies.get(tile[2]) ?? 0) + 1);
      for (let i = 0; i < tiles.length; i++) for (const division of [2, 3]) {
        const size = tiles[i][2] / division;
        if (size < 1 || !Number.isInteger(size)) continue;
        const sizeCount = frequencies.size - Number(frequencies.get(tiles[i][2]) === 1) + Number(!frequencies.has(size));
        if (sizeCount <= 4) candidates.push({ i, division, weight: tiles[i][2] ** (variant % 3 === 0 ? 1.8 : .4) });
      }
      if (!candidates.length) break;
      let draw = rng() * candidates.reduce((sum, c) => sum + c.weight, 0);
      const chosen = candidates.find(c => (draw -= c.weight) <= 0) ?? candidates.at(-1);
      const [x, y, side] = tiles[chosen.i], size = side / chosen.division;
      const children = Array.from({ length: chosen.division ** 2 }, (_, j) => [x + j % chosen.division * size, y + Math.floor(j / chosen.division) * size, size]);
      tiles = [...tiles.slice(0, chosen.i), ...children, ...tiles.slice(chosen.i + 1)];
      store(key, w, h, tiles);
    }
  }
}
function curved(key, shape, ratio, aspect) {
  // Odd as well as even grids provide intermediate capacities. The cell mask
  // remains symmetric about its center, irrespective of the number of cells.
  for (let h = 4; h <= 40; h++) {
    const w = Math.max(3, Math.round(h * aspect / ratio));
    if (shape === 'circle' && Math.abs(w * ratio / h - 1) > .035) continue;
    for (let level = 1; level <= 4; level++) for (let variant = 0; variant < 12; variant++) {
      const rng = random(233 + variant * 197 + h), mask = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (shapeSpans(shape, (y + .5) / h, aspect).some(([l, r]) => (x + .5) / w >= l && (x + .5) / w <= r)) mask[y * w + x] = 1;
      }
      // A coarse grid must still show the heart's notch and both shoulders.
      // Some even-width grids otherwise sample straight across the notch.
      if (shape === 'heart') {
        const top = [...mask.slice(0, w)], left = top.indexOf(1), right = top.lastIndexOf(1);
        if (w < 5 || left < 0 || !top.slice(left, right + 1).includes(0)) continue;
      }
      const area = mask.reduce((a, b) => a + b, 0), tiles = [], positions = Array.from({ length: mask.length }, (_, i) => i);
      for (let i = positions.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [positions[i], positions[j]] = [positions[j], positions[i]]; }
      for (let size = level; size >= 2; size--) {
        let used = 0;
        for (const at of positions) {
          if (used > area * (level === 2 ? .55 : level === 3 ? .29 : .22)) break;
          const x = at % w, y = Math.floor(at / w);
          if (x + size > w || y + size > h) continue;
          let free = true;
          for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) free &&= mask[(y + dy) * w + x + dx] === 1;
          if (!free) continue;
          tiles.push([x, y, size]); used += size * size;
          for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) mask[(y + dy) * w + x + dx] = 0;
        }
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) tiles.push([x, y, 1]);
      if (new Set(tiles.map(t => t[2])).size === level) store(key, w, h, tiles);
    }
  }
}
for (const [format, ratio] of Object.entries(ratios)) for (const [shape, aspect] of Object.entries(shapes)) {
  const key = `${format}/${shape}`;
  if (['square', 'portrait', 'landscape'].includes(shape)) {
    const numerator = Math.round(aspect / ratio * 36), divisor = gcd(numerator, 36);
    rectangle(key, numerator / divisor, 36 / divisor);
  } else curved(key, shape, ratio, aspect);
}
const output = {};
for (const [key, plans] of Object.entries(catalogue)) {
  const counts = [...plans.keys()].sort((a, b) => a - b);
  const keep = selectQuantityPresets(counts);
  if (keep.length < 6 && !key.endsWith('/1')) throw new Error(`Not enough capacities: ${key}`);
  output[key] = keep.flatMap(n => plans.get(n)).map(({quality,...plan})=>plan);
}
await writeFile('src/fixed-templates.js', `// Generated by scripts/build-templates.mjs. Whole square cells; no image data.\nexport const FIXED_TEMPLATES = ${JSON.stringify(output)};\n`);
console.log(JSON.stringify({ families: Object.keys(output).length, templates: Object.values(output).flat().length }));
