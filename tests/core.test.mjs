import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { DEFAULTS, RATIOS, TEMPLATES, BASE_PRESETS, normalizeProject, dimensions } from '../src/model.js';
import { layout } from '../src/layout.js';
import { cover, renderWall } from '../src/render.js';
import { resolveProjectImages } from '../src/images.js';
import { renderProject } from '../scripts/render.mjs';
const image = { id: 'one', title: 'One', src: './one.png' };
const project = (settings = {}, images = [image]) => normalizeProject({ version: 1, settings, images });
test('all layouts contain each image once, remain positive, stay within bounds, and do not overlap', () => {
  for (const template of TEMPLATES) for (const [width, height] of Object.values(RATIOS)) for (const count of [0,1,2,3,5,18,49,100]) for (const columns of [2,4,8]) for (const gap of [0,8,32]) {
    const box = { x: 100, y: 248, w: width - 200, h: height - 320 };
    const tiles = layout(count, box, { ...DEFAULTS, template, columns, gap, seed: count });
    assert.equal(tiles.length, count); assert.equal(new Set(tiles.map(t => t.index)).size, count);
    for (const t of tiles) {
      assert.ok(t.w > 0 && t.h > 0, JSON.stringify({ template, count, t }));
      assert.ok(t.x >= box.x - 1e-6 && t.y >= box.y - 1e-6);
      assert.ok(t.x + t.w <= box.x + box.w + 1e-6 && t.y + t.h <= box.y + box.h + 1e-6);
      for (const other of tiles) if (t.index !== other.index) assert.ok(Math.min(t.x+t.w,other.x+other.w)-Math.max(t.x,other.x) < 1e-6 || Math.min(t.y+t.h,other.y+other.h)-Math.max(t.y,other.y) < 1e-6, 'overlapping images');
    }
  }
});
test('seeded layout reproduces exactly and a different seed changes placement', () => {
  const box = { x: 48, y: 248, w: 984, h: 1030 };
  assert.deepEqual(layout(18, box, DEFAULTS), layout(18, box, DEFAULTS));
  assert.notDeepEqual(layout(18, box, DEFAULTS), layout(18, box, { ...DEFAULTS, seed: 234 }));
});
test('project validation rejects incompatible, unsafe, duplicate, and out-of-range inputs', () => {
  assert.equal(project().settings.template, 'mosaic');
  assert.equal(project().images[0].focusX, .5);
  for (const settings of [{ template: 'no' }, { gap: -1 }, { columns: 2.2 }, { seed: NaN }, { showHeader: 'false' }, { title: 'x'.repeat(81) }]) assert.throws(() => project(settings));
  for (const src of ['https://example.com/a.jpg', '//example.com/a.jpg', 'file:///secret', 'javascript:alert(1)', 'data:image/svg+xml;base64,AAAA']) assert.throws(() => project({}, [{ ...image, src }]));
  assert.throws(() => project({}, [image, image])); assert.throws(() => project({}, [{ ...image, focusX: 2 }]));
  assert.throws(() => normalizeProject({ version: 2, images: [] }));
  assert.throws(() => dimensions(DEFAULTS, 9));
  assert.deepEqual(dimensions(DEFAULTS, 3), { width: 3240, height: 4050 });
});
test('disk projects require selected image files and reject ambiguous basenames', () => {
  assert.throws(() => resolveProjectImages(project(), []), /一起拖入/);
  const file = { name: 'one.png', type: 'image/png' };
  assert.equal(resolveProjectImages(project(), [file])[0].file, file);
  assert.throws(() => resolveProjectImages(project(), [file, file]), /同名/);
  assert.equal(resolveProjectImages(project({}, [{ ...image, src: 'data:image/png;base64,AAAA' }]))[0].src, 'data:image/png;base64,AAAA');
});
test('crop focus selects opposite ends without stretching the image', () => {
  const source = createCanvas(200,100), ctx = source.getContext('2d');
  ctx.fillStyle = '#ff0000'; ctx.fillRect(0,0,100,100); ctx.fillStyle = '#0000ff'; ctx.fillRect(100,0,100,100);
  const result = createCanvas(50,100), out = result.getContext('2d');
  cover(out, source, {x:0,y:0,w:50,h:100}, 0, .5);
  assert.deepEqual([...out.getImageData(25,50,1,1).data], [255,0,0,255]);
  cover(out, source, {x:0,y:0,w:50,h:100}, 1, .5);
  assert.deepEqual([...out.getImageData(25,50,1,1).data], [0,0,255,255]);
});
test('CLI renders PNG and JPEG and portable projects reproduce pixel-identical output', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'posterwall-test-'));
  try {
    const canvas = createCanvas(120,180); canvas.getContext('2d').fillRect(0,0,120,180);
    await writeFile(join(temp,'one.png'), await canvas.encode('png'));
    await writeFile(join(temp,'input.json'), JSON.stringify(project({ title:'TEST', subtitle:'', showHeader:false })));
    const first = await renderProject({ input:join(temp,'input.json'), output:join(temp,'one-out.png'), project:join(temp,'portable.json'), scale:'1' });
    assert.equal(first.width,1080); assert.equal(first.height,1350);
    const png = await readFile(first.output); assert.equal(png.subarray(1,4).toString(),'PNG');
    await renderProject({ input:join(temp,'portable.json'), output:join(temp,'two-out.png'), scale:'1' });
    assert.deepEqual(await readFile(join(temp,'two-out.png')),png);
    const portable = normalizeProject(JSON.parse(await readFile(join(temp,'portable.json'),'utf8')));
    assert.match(portable.images[0].src,/^data:image\/png;base64,/);
    const second = await renderProject({ input:join(temp,'input.json'), output:join(temp,'out.jpg'), scale:'1', template:'film' });
    assert.equal((await readFile(second.output)).subarray(0,2).toString('hex'),'ffd8');
    assert.equal((await loadImage(await readFile(second.output))).height,1350);
    await assert.rejects(renderProject({ input:join(temp,'input.json'), output:join(temp,'one.png') }), /覆盖源图片/);
    await assert.rejects(renderProject({ input:join(temp,'input.json'), images:temp }), /二选一/);
  } finally { await rm(temp,{recursive:true,force:true}); }
});
test('all arrangement/base combinations render at exact dimensions including a dense collection', () => {
  const img = createCanvas(12,18); img.getContext('2d').fillRect(0,0,12,18);
  for (const template of TEMPLATES) for (const preset of BASE_PRESETS) {
    const p = project({template,columns:2,gap:32,showCaptions:true},Array.from({length:100},(_,i)=>({...image,id:`i${i}`})));
    p.base.preset=preset;
    const canvas = createCanvas(1,1); renderWall(canvas,p,p.images.map(()=>img),1);
    assert.equal(canvas.width,1080); assert.equal(canvas.height,1350);
    assert.equal(canvas.getContext('2d').getImageData(0,0,1,1).data[3],preset==='none'?0:255);
  }
});
