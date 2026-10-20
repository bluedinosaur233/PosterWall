export function random(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function fitImage(box, aspect) {
  const w = Math.min(box.w, box.h * aspect), h = w / aspect;
  return { ...box, x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

// Build a slicing tree from native image ratios, then scale the whole tree.
// Internal splits meet edge to edge instead of putting narrow posters in wide cells.
function rectangularLayout(ratios, box, settings) {
  const rng = random(settings.seed), gap = Math.min(settings.gap, Math.min(box.w, box.h) / (Math.sqrt(ratios.length) * 6));
  function join(a, b, horizontal) { return { a, b, horizontal, aspect: horizontal ? a.aspect + b.aspect : 1 / (1 / a.aspect + 1 / b.aspect) }; }
  const leaf = index => ({ index, aspect: ratios[index] });
  function mosaic(start, n, aspect) {
    if (n === 1) return leaf(start);
    const first = Math.max(1, Math.min(n - 1, Math.round(n * (.38 + rng() * .24))));
    const fraction = first / n, horizontal = aspect > .78 + (rng() - .5) * .2;
    return join(mosaic(start, first, horizontal ? aspect * fraction : aspect / fraction), mosaic(start + first, n - first, horizontal ? aspect * (1 - fraction) : aspect / (1 - fraction)), horizontal);
  }
  function grid(start, count, area) {
    const rows = Math.ceil(count / settings.columns), base = Math.floor(count / rows), plans = [];
    let index = start;
    const spacing = gap / area.w;
    for (let row = 0; row < rows; row++) {
      const n = base + (row < count % rows ? 1 : 0);
      const h = (1 - spacing * (n - 1)) / ratios.slice(index, index + n).reduce((a, b) => a + b, 0);
      plans.push({ start: index, n, h }); index += n;
    }
    const height = plans.reduce((total, p) => total + p.h, spacing * (rows - 1));
    const unit = Math.min(area.w, area.h / height), tiles = [];
    let y = area.y + (area.h - height * unit) / 2;
    for (const p of plans) {
      let x = area.x + (area.w - unit) / 2;
      for (let i = p.start; i < p.start + p.n; i++) {
        const w = ratios[i] * p.h * unit;
        tiles.push({ index: i, x, y, w, h: p.h * unit }); x += w + spacing * unit;
      }
      y += (p.h + spacing) * unit;
    }
    return tiles;
  }
  const count = ratios.length;
  if (settings.template === 'editorial' && count > 1) {
    if (!gap) {
      const tail = grid(1, count - 1, { x: 0, y: 0, w: 1, h: count * 10 });
      const tailHeight = Math.max(...tail.map(t => t.y + t.h)) - Math.min(...tail.map(t => t.y));
      const tailWidth = Math.max(...tail.map(t => t.x + t.w)) - Math.min(...tail.map(t => t.x));
      const tailAspect = tailWidth / tailHeight;
      const area = fitImage(box, ratios[0] + tailAspect), w = ratios[0] * area.h;
      return [{ index: 0, ...area, w }, ...grid(1, count - 1, { x: area.x + w, y: area.y, w: area.w - w, h: area.h })];
    }
    const w = (box.w - gap) * .44;
    return [fitImage({ index: 0, ...box, w }, ratios[0]), ...grid(1, count - 1, { x: box.x + w + gap, y: box.y, w: box.w - w - gap, h: box.h })];
  }
  if (settings.template !== 'mosaic') return grid(0, count, box);
  let tree;
  if (settings.template === 'mosaic') {
    const target = box.w / box.h;
    for (let i = 0; i < 48; i++) {
      const candidate = mosaic(0, count, target);
      if (!tree || Math.abs(Math.log(candidate.aspect / target)) < Math.abs(Math.log(tree.aspect / target))) tree = candidate;
    }
  }
  const tiles = [];
  function place(node, area) {
    if (node.index !== undefined) { tiles.push(fitImage({ index: node.index, ...area }, node.aspect)); return; }
    const localGap = Math.min(gap, (node.horizontal ? area.w : area.h) * .12);
    if (node.horizontal) {
      const h = Math.min(area.h, (area.w - localGap) / (node.a.aspect + node.b.aspect));
      const w = h * (node.a.aspect + node.b.aspect) + localGap;
      const x = area.x + (area.w - w) / 2, y = area.y + (area.h - h) / 2;
      place(node.a, { x, y, w: node.a.aspect * h, h });
      place(node.b, { x: x + node.a.aspect * h + localGap, y, w: node.b.aspect * h, h });
    } else {
      const w = Math.min(area.w, (area.h - localGap) / (1 / node.a.aspect + 1 / node.b.aspect));
      const h = w / node.a.aspect + w / node.b.aspect + localGap;
      const x = area.x + (area.w - w) / 2, y = area.y + (area.h - h) / 2;
      place(node.a, { x, y, w, h: w / node.a.aspect });
      place(node.b, { x, y: y + w / node.a.aspect + localGap, w, h: w / node.b.aspect });
    }
  }
  place(tree, box);
  return tiles.sort((a, b) => a.index - b.index);
}

export function layout(count, box, settings, aspects = []) {
  if (!count) return [];
  const ratios = Array.from({ length: count }, (_, i) => aspects[i] || 2 / 3);
  return rectangularLayout(ratios, box, settings);
}
