import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { normalizeProject, DEFAULTS, SHAPES } from '../src/model.js';
import { composition, subjectLayout } from '../src/shapes.js';
import { availableLevels, posterCapacity } from '../src/levels.js';
import { renderWall } from '../src/render.js';
import { renderProject } from '../scripts/render.mjs';
const box = { x: 40, y: 60, w: 900, h: 900 };

test('granularity and repetition validate, default safely and round-trip', () => {
  const make = subject => normalizeProject({ version: 1, images: [], subject });
  assert.equal(make().subject.granularity, 1); assert.equal(make().subject.repeat, false);
  for (const subject of [{granularity:0},{granularity:5},{granularity:2.5},{repeat:1},{repeat:'false'}]) assert.throws(() => make(subject));
  const p = make({granularity:4,repeat:true}); assert.deepEqual(normalizeProject(p),p);
});

test('every level packs all sources without cropping, overlaps or lost sources, with repetition opt-in', () => {
  for (const shape of SHAPES) for (const granularity of [2,3,4]) for (const repeat of [false,true]) for (const count of [0,1,3,18,100]) {
    const aspects = Array.from({length:count}, (_,i) => [.5,2/3,1,1.5,2][i%5]);
    const tiles = subjectLayout(count,box,{...DEFAULTS,gap:32},shape,aspects,granularity,repeat);
    if (!repeat) assert.equal(tiles.length,count); else if (count) assert.ok(tiles.length >= count && tiles.length <= 800);
    assert.equal(new Set(tiles.map(t=>t.index)).size,count);
    for(const [i,t] of tiles.entries()) {
      assert.ok(t.w>0&&t.h>0,`${shape}/${granularity}/${repeat}/${count}`);
      assert.ok(t.x>=box.x-1e-6&&t.y>=box.y-1e-6&&t.x+t.w<=box.x+box.w+1e-6&&t.y+t.h<=box.y+box.h+1e-6);
      assert.ok(Math.abs(t.w/t.h-aspects[t.index])<1e-6);
      assert.ok(!t.polygon);
      for(const other of tiles.slice(i+1)) assert.ok(Math.min(t.x+t.w,other.x+other.w)-Math.max(t.x,other.x)<1e-6 || Math.min(t.y+t.h,other.y+other.h)-Math.max(t.y,other.y)<1e-6);
    }
  }
});

test('higher detail creates smaller edge tiles and a size hierarchy, reproducibly', () => {
  for(const shape of ['heart','circle','arch']) {
    const coarse=subjectLayout(18,box,DEFAULTS,shape,[],1,true);
    const fine=subjectLayout(18,box,DEFAULTS,shape,[],4,true);
    assert.ok(Math.abs(fine.length-coarse.length)<216*.35,'size levels keep the same quantity tier');
    assert.ok(Math.min(...fine.map(t=>t.h))<Math.min(...coarse.map(t=>t.h)));
    assert.ok(Math.max(...fine.map(t=>t.h))/Math.min(...fine.map(t=>t.h))>2);
    assert.deepEqual(fine,subjectLayout(18,box,DEFAULTS,shape,[],4,true));
    assert.notDeepEqual(subjectLayout(48,box,DEFAULTS,shape,[],2),subjectLayout(48,box,DEFAULTS,shape,[],4));
  }
});

test('mosaic randomness changes geometry as well as repeated source order, and stays reproducible', () => {
  const aspects = Array(18).fill(2 / 3);
  for (const shape of ['heart','circle','square']) {
    const make = seed => subjectLayout(18, box, {...DEFAULTS,seed}, shape, aspects, 4, true);
    const first = make(233), second = make(234);
    assert.deepEqual(first,make(233));
    assert.notDeepEqual(first.map(({x,y,w,h})=>({x,y,w,h})),second.map(({x,y,w,h})=>({x,y,w,h})));
    assert.notDeepEqual(first.map(t=>t.index),second.map(t=>t.index));
    const frequency=aspects.map((_,i)=>first.filter(t=>t.index===i).length);
    assert.ok(Math.max(...frequency)-Math.min(...frequency)<=1);
    assert.equal(new Set(first.map(t=>Number(t.h.toFixed(6)))).size,4,'randomness must stay within four size levels');
  }
});

test('repeated images retain their corners and transparent exterior in detailed and film output', () => {
  const source=createCanvas(80,120),ctx=source.getContext('2d');
  const corners=[[0,0,'#f00000',[240,0,0,255]],[.5,0,'#00f000',[0,240,0,255]],[0,.5,'#0000f0',[0,0,240,255]],[.5,.5,'#f0f000',[240,240,0,255]]];
  for(const [x,y,color] of corners) { ctx.fillStyle=color;ctx.fillRect(x*80,y*120,40,60); }
  for(const shape of ['heart','circle','arch']) for(const template of ['mosaic','film']) {
    const p=normalizeProject({version:1,images:[{src:'one.png'}],subject:{shape,granularity:4,repeat:true,scale:1},base:{preset:'none'},settings:{template,gap:0}});
    const canvas=createCanvas(1,1),tiles=renderWall(canvas,p,[source],2),out=canvas.getContext('2d');
    for(const t of tiles)for(const [x,y,,color] of corners) assert.deepEqual([...out.getImageData(Math.floor((t.x+t.w*(x+.25))*2),Math.floor((t.y+t.h*(y+.25))*2),1,1).data],color);
    assert.equal(out.getImageData(0,0,1,1).data[3],0);
  }
});

test('CLI repetition stores each asset once and portable export reproduces exactly', async () => {
  const dir=await mkdtemp(join(tmpdir(),'posterwall-repeat-'));
  try {
    const canvas=createCanvas(80,120);canvas.getContext('2d').fillRect(0,0,80,120);
    await writeFile(join(dir,'one.png'),await canvas.encode('png'));
    await writeFile(join(dir,'input.json'),JSON.stringify({version:1,images:[{src:'one.png'}],base:{preset:'none'}}));
    const first=await renderProject({input:join(dir,'input.json'),output:join(dir,'first.png'),shape:'heart',levels:'4',count:'300',repeat:true,scale:'1',project:join(dir,'portable.json')});
    const portable=JSON.parse(await readFile(first.project,'utf8'));
    assert.equal(portable.images.length,1);assert.equal(portable.subject.granularity,4);assert.equal(portable.subject.repeat,true);assert.equal(portable.subject.count,300);
    await renderProject({input:first.project,output:join(dir,'second.png'),scale:'1'});
    assert.deepEqual(await readFile(first.output),await readFile(join(dir,'second.png')));
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('zero-gap level bands stay connected and PNGs have no enclosed transparent holes', () => {
  assert.equal(DEFAULTS.gap, 0);
  for (const shape of SHAPES) for (const level of [2, 3, 4]) {
    const aspects = Array.from({length:18}, (_,i) => [.55, 2/3, .75, 1, 1.5][i%5]);
    const tiles = subjectLayout(18, box, DEFAULTS, shape, aspects, level, true);
    if (['square','portrait','landscape'].includes(shape)) {
      // Fixed heights and arbitrary native ratios can leave steps at the outer
      // edge. Inside every band, whole posters must touch without any gaps.
      const edges=[...new Set(tiles.flatMap(t=>[t.y,t.y+t.h]))].sort((a,b)=>a-b);
      for(let i=1;i<edges.length;i++) {
        if(edges[i]-edges[i-1]<1e-7)continue;
        const y=(edges[i]+edges[i-1])/2;
        const row=tiles.filter(t=>y>t.y&&y<t.y+t.h).sort((a,b)=>a.x-b.x);
        for(let j=1;j<row.length;j++)assert.ok(Math.abs(row[j].x-row[j-1].x-row[j-1].w)<1e-6,'internal gap');
      }
    }
  }
  const source = createCanvas(80,120);
  source.getContext('2d').fillRect(0,0,80,120);
  for (const shape of ['heart','circle','arch']) for (const scale of [1,2,3]) {
    const p=normalizeProject({version:1,images:[{src:'opaque.png'}],subject:{shape,granularity:4,repeat:true},base:{preset:'none'}});
    const canvas=createCanvas(1,1); renderWall(canvas,p,[source],scale);
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    const visited=new Uint8Array(canvas.width*canvas.height), queue=new Int32Array(visited.length);
    let head=0, tail=1;visited[0]=1;
    while(head<tail) {
      const at=queue[head++],x=at%canvas.width,y=Math.floor(at/canvas.width);
      for(const next of [x?at-1:-1,x<canvas.width-1?at+1:-1,y?at-canvas.width:-1,y<canvas.height-1?at+canvas.width:-1]) {
        if(next>=0&&!visited[next]&&pixels[next*4+3]===0){visited[next]=1;queue[tail++]=next;}
      }
    }
    for(let i=0;i<visited.length;i++) {
      const alpha=pixels[i*4+3];
      assert.ok(alpha===0||alpha===255, 'shared image edges must not create translucent hairlines');
      assert.ok(alpha||visited[i], `${shape}/${scale}: enclosed transparent gap`);
    }
  }
});

test('levels are exact height palettes for uniform and mixed aspect sources, including level one', () => {
  for(const shape of SHAPES)for(const repeat of [false,true])for(const level of [1,2,3,4])for(const uniform of [false,true]) {
    const aspects=Array.from({length:18},(_,i)=>uniform?2/3:[.5,2/3,1,1.5,2][i%5]);
    const tiles=subjectLayout(18,box,DEFAULTS,shape,aspects,level,repeat);
    const heights=[...new Set(tiles.map(t=>+t.h.toFixed(6)))].sort((a,b)=>a-b);
    assert.equal(heights.length,level,`${shape}/${repeat}/${level}: unexpected size count`);
    for(const height of heights)assert.ok(Math.abs(height/heights[0]-Math.round(height/heights[0]))<1e-5,'sizes must use fixed multiples');
    if(uniform)assert.equal(new Set(tiles.map(t=>+t.w.toFixed(6))).size,level);
  }
  const unmatched=Array.from({length:18},(_,i)=>.6+i*.017);
  assert.equal(availableLevels(unmatched,'circle',false),1,'unpaired circle sources require a shared core height');
  assert.equal(availableLevels(unmatched,'circle',true),4);
  for(const shape of SHAPES)assert.equal(subjectLayout(1,box,DEFAULTS,shape,[.67],4,false).length,1);
});

test('random heart variants keep a centered notch, two shoulders and a centered tip', () => {
  const aspects=Array.from({length:18},(_,i)=>[.63,.67,.7,.75][i%4]);
  for(const seed of [0,233,234,1000]) {
    const tiles=subjectLayout(18,box,{...DEFAULTS,seed},'heart',aspects,4,true);
    const left=Math.min(...tiles.map(t=>t.x)),top=Math.min(...tiles.map(t=>t.y));
    const width=Math.max(...tiles.map(t=>t.x+t.w))-left,height=Math.max(...tiles.map(t=>t.y+t.h))-top;
    const at=(x,y)=>tiles.some(t=>left+x*width>=t.x-1e-8&&left+x*width<t.x+t.w+1e-8&&top+y*height>=t.y&&top+y*height<t.y+t.h);
    assert.ok(at(.3,.08)&&at(.7,.08),'both shoulders must be present');
    assert.ok(!at(.5,.06)&&at(.5,.3),'center notch must end above the body');
    assert.ok(!at(.15,.8)&&!at(.85,.8),'lower sides must taper');
    const tip=tiles.filter(t=>t.y+t.h>top+height*.96);
    const tipCenter=(Math.min(...tip.map(t=>t.x))+Math.max(...tip.map(t=>t.x+t.w)))/2;
    assert.ok(Math.abs((tipCenter-left)/width-.5)<.08,'tip must remain centered');
  }
});

test('heart outline is exactly symmetric at every vertical boundary, for all levels and seeds', () => {
  for (const repeat of [false,true]) for (const level of [1,2,3,4]) for (const seed of [0,233,234,1000]) for (const count of [1,3,18,49,100]) {
    const aspects=Array.from({length:count},(_,i)=>[.5,2/3,.68,1,1.5][i%5]);
    const tiles=subjectLayout(count,box,{...DEFAULTS,seed},'heart',aspects,level,repeat);
    const boundaries=[...new Set(tiles.flatMap(t=>[t.y,t.y+t.h]))].sort((a,b)=>a-b);
    for(let i=1;i<boundaries.length;i++) {
      if(boundaries[i]-boundaries[i-1]<1e-7)continue;
      const y=(boundaries[i]+boundaries[i-1])/2;
      const ranges=tiles.filter(t=>y>t.y&&y<t.y+t.h).map(t=>[t.x,t.x+t.w]).sort((a,b)=>a[0]-b[0]);
      const spans=[];
      for(const range of ranges) {
        if(spans.length&&range[0]<=spans.at(-1)[1]+1e-7)spans.at(-1)[1]=Math.max(spans.at(-1)[1],range[1]);
        else spans.push([...range]);
      }
      const center2=2*box.x+box.w;
      for(let j=0;j<spans.length;j++) {
        const mirror=spans[spans.length-1-j];
        assert.ok(Math.abs(spans[j][0]+mirror[1]-center2)<1e-6, `${repeat}/${level}/${seed}/${count}: asymmetric left edge`);
        assert.ok(Math.abs(spans[j][1]+mirror[0]-center2)<1e-6, `${repeat}/${level}/${seed}/${count}: asymmetric right edge`);
      }
    }
  }
});

test('transparent heart export is pixel symmetric at every scale and off-center placement', () => {
  const sources=[createCanvas(60,90),createCanvas(68,100),createCanvas(60,90)];
  for(const source of sources)source.getContext('2d').fillRect(0,0,source.width,source.height);
  for(const scale of [1,2,3]) for(const repeat of [false,true]) {
    const p=normalizeProject({version:1,images:sources.map((_,i)=>({src:`${i}.png`})),subject:{shape:'heart',granularity:4,repeat,scale:.73,x:.17},base:{preset:'none'}});
    const canvas=createCanvas(1,1);renderWall(canvas,p,sources,scale);
    const {box:b}=composition(p),center=Math.round((b.x+b.w/2)*scale);
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<center;x++) {
      const mirror=2*center-1-x;
      if(mirror>=canvas.width)continue;
      assert.equal(pixels[(y*canvas.width+x)*4+3],pixels[(y*canvas.width+mirror)*4+3], `${repeat}/${scale}: alpha outline differs at ${x},${y}`);
    }
  }
});
