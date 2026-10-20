import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { normalizeProject, SHAPES, BASE_PRESETS, TEMPLATES, RATIOS, projectAssets } from '../src/model.js';
import { composition, subjectLayout } from '../src/shapes.js';
import { renderWall } from '../src/render.js';
import { renderProject } from '../scripts/render.mjs';
import { resolveImageFiles } from '../src/images.js';
const image = { id: 'one', src: 'one.png' };
const make = (subject={},base={},settings={}) => normalizeProject({version:1,settings,subject,base,images:[image]});

test('layers normalize independently and reject unsafe background sources', () => {
  const p=make({shape:'heart',scale:.75},{preset:'paper',background:{src:'background.jpg',focusX:.2}});
  assert.equal(p.subject.shape,'heart');assert.equal(p.base.background.focusX,.2);
  assert.deepEqual(normalizeProject(p),p);
  for(const subject of [{shape:'star'}, {scale:1.1}, {x:-1}, {y:NaN}])assert.throws(()=>make(subject));
  for(const base of [{preset:'unknown'}, {mat:81}, {shadow:'true'}, {background:{src:'https://example.com/a.jpg'}}, {background:{src:'data:image/svg+xml;base64,AAAA'}}, {background:{src:'a.jpg',focusX:3}}])assert.throws(()=>make({},base));
  assert.equal(projectAssets(p).length,2);
  const resolved=resolveImageFiles(projectAssets(p),[{name:'one.png',type:'image/png'},{name:'background.jpg',type:'image/jpeg'}]);
  assert.equal(resolved[1].file.name,'background.jpg');
  assert.throws(()=>resolveImageFiles(projectAssets(p),[{name:'one.png',type:'image/png'}]),/background.jpg/);
});
test('subject and mat stay within every canvas even at extreme placement and margins', () => {
  for(const shape of SHAPES)for(const ratio of Object.keys(RATIOS))for(const preset of BASE_PRESETS)for(const scale of [.3,1])for(const x of [0,1])for(const y of [0,1]) {
    const p=make({shape,scale,x,y},{preset,mat:80},{ratio,padding:100,showHeader:true,title:'Title',subtitle:'Subtitle',eyebrow:'Archive',signature:'Name'});
    const g=composition(p),b=g.box;
    assert.ok(b.w>0&&b.h>0);
    assert.ok(b.x-g.mat>=g.frame-1e-6&&b.y-g.mat>=g.frame-1e-6);
    assert.ok(b.x+b.w+g.mat<=g.width-g.frame+1e-6);
    assert.ok(b.y+b.h+g.mat<=g.height-g.frame-g.textHeight+1e-6);
  }
});
test('whole rectangular tiles preserve aspect ratios, indices, bounds and separation at every density', () => {
  for(const shape of SHAPES)for(const template of TEMPLATES)for(const count of [0,1,2,3,7,18,49,100])for(const gap of [0,32]) {
    const p=make({shape,scale:.3},{mat:80},{template,gap});const box=composition(p).box;
    const aspects=Array.from({length:count},(_,i)=>[.5,2/3,1,1.5,2][i%5]);
    const tiles=subjectLayout(count,box,p.settings,shape,aspects);
    assert.equal(tiles.length,count);assert.equal(new Set(tiles.map(t=>t.index)).size,count);
    for(const t of tiles) {
      assert.ok(t.w>0&&t.h>0,`${shape}/${template}/${count}`);
      assert.ok(t.x>=box.x-1e-6&&t.y>=box.y-1e-6);
      assert.ok(t.x+t.w<=box.x+box.w+1e-6&&t.y+t.h<=box.y+box.h+1e-6);
      assert.ok(!t.polygon, 'posters must remain rectangles');
      assert.ok(Math.abs(t.w/t.h-aspects[t.index])<1e-6, 'source aspect ratio changed');
      for(const other of tiles)if(t.index!==other.index)assert.ok(Math.min(t.x+t.w,other.x+other.w)-Math.max(t.x,other.x)<1e-6||Math.min(t.y+t.h,other.y+other.h)-Math.max(t.y,other.y)<1e-6,'overlapping posters');
    }
    assert.deepEqual(tiles,subjectLayout(count,box,p.settings,shape,aspects));
  }
});
test('all four source corners survive rendering, including at silhouette edges and in film frames', () => {
  const sources=Array.from({length:100},(_,i)=>{
    const c=createCanvas([60,80,120,180,240][i%5],120),ctx=c.getContext('2d');
    for(const [x,y,g,b] of [[0,0,10,20],[.5,0,80,20],[0,.5,10,200],[.5,.5,80,200]]) {
      ctx.fillStyle=`rgb(${50+i},${g},${b})`;ctx.fillRect(x*c.width,y*c.height,c.width/2,c.height/2);
    }
    return c;
  });
  for(const shape of SHAPES)for(const template of TEMPLATES)for(const count of [18,100]) {
    const p=make({shape,scale:1},{preset:'none',mat:80,shadow:true},{template,gap:8});
    p.images=Array.from({length:count},(_,i)=>({...image,id:`i${i}`}));
    const canvas=createCanvas(1,1),tiles=renderWall(canvas,p,sources.slice(0,count),1),ctx=canvas.getContext('2d');
    for(const tile of tiles)for(const [x,y,g,b] of [[.15,.15,10,20],[.85,.15,80,20],[.15,.85,10,200],[.85,.85,80,200]]) {
      assert.deepEqual([...ctx.getImageData(Math.floor(tile.x+tile.w*x),Math.floor(tile.y+tile.h*y),1,1).data],[50+tile.index,g,b,255],`${shape}/${template}/${count}: image ${tile.index} corner missing`);
    }
    assert.equal(ctx.getImageData(5,5,1,1).data[3],0);
    if(shape==='heart')assert.equal(ctx.getImageData(canvas.width/2,Math.min(...tiles.map(t=>t.y))+5,1,1).data[3],0,'heart notch must be empty');
  }
});
test('no base produces real PNG alpha and portable projects preserve it', async () => {
  const dir=await mkdtemp(join(tmpdir(),'posterwall-alpha-'));
  try {
    const c=createCanvas(60,90),ctx=c.getContext('2d');ctx.fillStyle='#ee1122';ctx.fillRect(0,0,60,90);ctx.clearRect(20,30,20,30);
    await writeFile(join(dir,'one.png'),await c.encode('png'));
    const p=make({shape:'heart'},{preset:'none',mat:80,shadow:true,background:{src:'unused.png'}});
    assert.equal(p.base.background,null);
    await writeFile(join(dir,'input.json'),JSON.stringify(p));
    await renderProject({input:join(dir,'input.json'),output:join(dir,'one-out.png'),scale:'1',project:join(dir,'portable.json')});
    await renderProject({input:join(dir,'portable.json'),output:join(dir,'two-out.png'),scale:'1'});
    assert.deepEqual(await readFile(join(dir,'one-out.png')),await readFile(join(dir,'two-out.png')));
    const saved=JSON.parse(await readFile(join(dir,'portable.json'),'utf8'));assert.equal(saved.base.preset,'none');
    const result=await loadImage(await readFile(join(dir,'one-out.png'))),out=createCanvas(result.width,result.height);out.getContext('2d').drawImage(result,0,0);
    assert.equal(out.getContext('2d').getImageData(10,10,1,1).data[3],0);
    assert.equal(out.getContext('2d').getImageData(result.width/2,result.height/2,1,1).data[3],0,'transparent source pixels must also survive');
    await assert.rejects(renderProject({input:join(dir,'input.json'),output:join(dir,'out.jpg')}),/PNG/);
    const empty=createCanvas(1,1);renderWall(empty,{...p,images:[]},[]);
    assert.ok(empty.getContext('2d').getImageData(0,0,empty.width,empty.height).data.every(v=>v===0));
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('background crop, subject, and portable project survive CLI round trips', async () => {
  const dir=await mkdtemp(join(tmpdir(),'posterwall-layers-'));
  try {
    const source=createCanvas(100,100);source.getContext('2d').fillStyle='#eedd55';source.getContext('2d').fillRect(0,0,100,100);
    await writeFile(join(dir,'one.png'),await source.encode('png'));
    const bg=createCanvas(400,100),ctx=bg.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,200,100);ctx.fillStyle='#0000ff';ctx.fillRect(200,0,200,100);
    await writeFile(join(dir,'bg.png'),await bg.encode('png'));
    const p=make({shape:'heart',scale:.65},{background:{src:'bg.png',focusX:1,focusY:.5},mat:24});
    await writeFile(join(dir,'input.json'),JSON.stringify(p));
    const first=await renderProject({input:join(dir,'input.json'),output:join(dir,'first.png'),scale:'1',project:join(dir,'portable.json')});
    const portable=normalizeProject(JSON.parse(await readFile(join(dir,'portable.json'),'utf8')));
    assert.ok(projectAssets(portable).every(i=>i.src.startsWith('data:image/')));
    assert.equal(portable.base.background.focusX,1);assert.equal(portable.subject.shape,'heart');
    await renderProject({input:join(dir,'portable.json'),output:join(dir,'second.png'),scale:'1'});
    assert.deepEqual(await readFile(first.output),await readFile(join(dir,'second.png')));
    const rendered=await loadImage(await readFile(first.output)),canvas=createCanvas(1080,1350);canvas.getContext('2d').drawImage(rendered,0,0);
    assert.deepEqual([...canvas.getContext('2d').getImageData(10,10,1,1).data],[0,0,255,255]);
    await assert.rejects(renderProject({input:join(dir,'input.json'),output:join(dir,'bg.png')}),/覆盖源图片/);
    assert.throws(()=>renderWall(createCanvas(1,1),p,[source],1),/背景图未加载/);
    const overridden=await renderProject({input:join(dir,'input.json'),output:join(dir,'override.jpg'),scale:'1',shape:'arch',base:'gallery',background:join(dir,'bg.png'),mat:'30','subject-scale':'.7',shadow:true,project:join(dir,'override.json')});
    const result=JSON.parse(await readFile(overridden.project,'utf8'));assert.equal(result.subject.shape,'arch');assert.equal(result.base.preset,'gallery');assert.equal(result.base.mat,30);
  } finally {await rm(dir,{recursive:true,force:true});}
});
