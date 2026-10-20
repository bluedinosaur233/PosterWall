import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { normalizeProject, SHAPES } from '../src/model.js';
import { fixedLayout, fixedQuantityOptions, fixedQuantityState, fixedCounts, TILE_RATIOS } from '../src/fixed-layout.js';
import { FIXED_TEMPLATES } from '../src/fixed-templates.js';
import { renderWall } from '../src/render.js';
const aspects = { square: 1, portrait: 2 / 3, landscape: 1.5, heart: 1.12, circle: 1, arch: 2 / 3 };
const boxFor = shape => ({ x: 12, y: 20, w: 600 * aspects[shape], h: 600 });

function assertRectangle(tiles, shape) {
  const left = Math.min(...tiles.map(t => t.x)), right = Math.max(...tiles.map(t => t.x + t.w));
  const top = Math.min(...tiles.map(t => t.y)), bottom = Math.max(...tiles.map(t => t.y + t.h));
  assert.ok(Math.abs((right - left) / (bottom - top) - aspects[shape]) < 1e-8, 'exact requested outer aspect');
  assert.ok(Math.abs(tiles.reduce((s,t)=>s+t.w*t.h,0) - (right-left)*(bottom-top)) < 1e-6, 'whole rectangle must be filled');
  const ys = [...new Set(tiles.flatMap(t=>[t.y,t.y+t.h]))].sort((a,b)=>a-b);
  for(let i=1;i<ys.length;i++) {
    if(ys[i]-ys[i-1]<1e-7)continue;
    const y=(ys[i]+ys[i-1])/2, row=tiles.filter(t=>t.y<y&&t.y+t.h>y).sort((a,b)=>a.x-b.x);
    assert.ok(Math.abs(row[0].x-left)<1e-7 && Math.abs(row.at(-1).x+row.at(-1).w-right)<1e-7, 'straight side edges at every height');
    for(let j=1;j<row.length;j++)assert.ok(Math.abs(row[j].x-row[j-1].x-row[j-1].w)<1e-7,'no gaps or overlaps');
  }
}
test('fixed rectangular templates have exact outlines and exact size counts for all three source formats', () => {
  for(const tileRatio of Object.keys(TILE_RATIOS)) for(const shape of ['square','portrait','landscape']) for(const granularity of [1,2,3,4]) {
    const subject={tileRatio,shape,granularity,repeat:false};
    const counts=fixedCounts(subject,100);
    assert.ok(counts.length);
    for(const count of counts) {
      const tiles=fixedLayout(100,boxFor(shape),{...subject,count},233);
      assert.equal(tiles.length,count);assert.equal(new Set(tiles.map(t=>t.index)).size,count);
      assert.equal(new Set(tiles.map(t=>+t.h.toFixed(7))).size,granularity);
      for(const t of tiles) assert.ok(Math.abs(t.w/t.h-TILE_RATIOS[tileRatio])<1e-8);
      assertRectangle(tiles,shape);
    }
  }
});

test('every family offers six stable exact capacities up to 200, except geometrically limited one-size rectangles', () => {
  for(const tileRatio of Object.keys(TILE_RATIOS)) for(const shape of SHAPES) for(const granularity of [1,2,3,4]) {
    const subject={tileRatio,shape,granularity,repeat:false,count:null}, counts=fixedQuantityOptions(subject);
    const limited = granularity===1 && ['square','portrait','landscape'].includes(shape) && aspects[shape]!==TILE_RATIOS[tileRatio];
    assert.equal(counts.length,limited ? (aspects[shape]*TILE_RATIOS[tileRatio]===1 && shape!=='square' && tileRatio!=='square' ? 2 : 5) : 6);
    assert.deepEqual(counts,[...new Set(counts)].sort((a,b)=>a-b));
    assert.ok(counts[0]<=36 && counts.at(-1)>=144 && counts.at(-1)<=200);
    const locked=fixedQuantityState(subject,18), unlocked=fixedQuantityState({...subject,repeat:true},18);
    assert.deepEqual(locked.options.map(o=>o.count),counts);
    assert.deepEqual(unlocked.options.map(o=>o.count),counts);
    assert.equal(unlocked.selected,locked.selected,'repeat must not change the default density');
    for(const option of locked.options)assert.equal(option.disabled,option.count>18);
    assert.ok(unlocked.options.every(o=>!o.disabled));
    assert.ok(fixedQuantityState({...subject,repeat:true},0).options.every(o=>o.disabled));
    const count=counts.at(-1), state=fixedQuantityState({...subject,count},18);
    assert.equal(state.selected,count,'turning repeat off retains the chosen count');
    assert.throws(()=>fixedLayout(18,boxFor(shape),{...subject,count},233),/允许重复/);
    assert.equal(fixedLayout(18,boxFor(shape),{...subject,count,repeat:true},233).length,count);
    assert.ok(counts.includes(fixedQuantityState({...subject,count:600,repeat:true},18).selected),'old large density migrates to an available preset');
  }
});

test('all catalogue variants retain exact levels, source proportions and symmetric, gapless outlines', () => {
  for(const [key,plans] of Object.entries(FIXED_TEMPLATES)) {
    const [tileRatio,shape,level]=key.split('/');
    for(const plan of plans) {
      assert.ok(plan.tiles.length<=200,key);
      assert.equal(new Set(plan.tiles.map(t=>t[2])).size,Number(level),key);
      const tiles=plan.tiles.map(([x,y,s])=>({x:x*TILE_RATIOS[tileRatio],y,w:s*TILE_RATIOS[tileRatio],h:s}));
      if(['square','portrait','landscape'].includes(shape))assertRectangle(tiles,shape);
      else {
        const mask=new Uint8Array(plan.w*plan.h);
        for(const [x,y,s] of plan.tiles)for(let yy=y;yy<y+s;yy++)for(let xx=x;xx<x+s;xx++) {
          assert.ok(xx>=0&&xx<plan.w&&yy>=0&&yy<plan.h,key);
          assert.equal(mask[yy*plan.w+xx],0,'no overlaps');mask[yy*plan.w+xx]=1;
        }
        for(let y=0;y<plan.h;y++)for(let x=0;x<plan.w;x++) {
          assert.equal(mask[y*plan.w+x],mask[y*plan.w+plan.w-1-x],`${key}: left/right symmetry`);
          if(shape==='circle')assert.equal(mask[y*plan.w+x],mask[(plan.h-1-y)*plan.w+x],`${key}: top/bottom symmetry`);
        }
        if(shape==='heart') {
          const top=[...mask.slice(0,plan.w)], left=top.indexOf(1),right=top.lastIndexOf(1);
          assert.ok(top.slice(left,right+1).includes(0),'even the smallest heart must retain its notch');
        }
        for(let y=0;y<plan.h;y++) {
          const row=[...mask.slice(y*plan.w,(y+1)*plan.w)],left=row.indexOf(1),right=row.lastIndexOf(1);
          if(left<0)continue;
          // A heart's upper notch is the only allowed break in a filled row.
          if(shape!=='heart'||y>=plan.h/2)assert.ok(row.slice(left,right+1).every(Boolean),'no internal gaps');
        }
      }
    }
  }
});

test('repetition balances every source and avoids adjacent duplicates in every fixed shape and tier', () => {
  const start=performance.now();
  for(const tileRatio of Object.keys(TILE_RATIOS)) for(const shape of SHAPES) for(const granularity of [1,2,3,4]) {
    const subject={tileRatio,shape,granularity,repeat:true};
    for(const count of fixedQuantityOptions(subject)) {
    const tiles=fixedLayout(48,boxFor(shape),{tileRatio,shape,granularity,repeat:true,count},233);
    assert.equal(tiles.length,count,'the number on each button is the exact rendered count');
    const uses=Array.from({length:Math.min(48,count)},(_,i)=>tiles.filter(t=>t.index===i).length);
    assert.ok(Math.min(...uses)>0);assert.ok(Math.max(...uses)-Math.min(...uses)<=1,'rare source proportions cannot cause excess reuse');
    assert.equal(new Set(tiles.map(t=>+t.h.toFixed(7))).size,granularity);
    for(let i=0;i<tiles.length;i++) for(let j=i+1;j<tiles.length;j++) {
      const a=tiles[i],b=tiles[j];if(a.index!==b.index)continue;
      const dx=Math.max(a.x,b.x)-Math.min(a.x+a.w,b.x+b.w),dy=Math.max(a.y,b.y)-Math.min(a.y+a.h,b.y+b.h);
      assert.ok(dx>1e-7||dy>1e-7,'same cover must not touch itself, including at a corner');
    }
    if(['square','portrait','landscape'].includes(shape))assertRectangle(tiles,shape);
    }
  }
  assert.ok(performance.now()-start<10000,'catalogue selection and source distribution must remain interactive');
});

test('fixed transparent exports retain straight edges, exact curve symmetry and no internal alpha holes', () => {
  const source=createCanvas(60,90);source.getContext('2d').fillRect(0,0,60,90);
  for(const shape of ['square','heart','circle']) {
    const subject={shape,tileRatio:'portrait',granularity:4,repeat:true};
    const p=normalizeProject({version:1,images:[{src:'one.png'}],subject:{...subject,count:fixedQuantityOptions(subject).at(-1)},settings:{ratio:'square'},base:{preset:'none'}});
    const canvas=createCanvas(1,1),tiles=renderWall(canvas,p,[source],1),{data}=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
    const alpha=(x,y)=>data[(y*canvas.width+x)*4+3];
    let left=canvas.width,right=0,top=canvas.height,bottom=0;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++) {
      const a=alpha(x,y);assert.ok(a===0||a===255,'no translucent seams');
      if(a){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      if(shape!=='square')assert.equal(a,alpha(canvas.width-1-x,y),'left/right outline symmetry');
      if(shape==='circle')assert.equal(a,alpha(x,canvas.height-1-y),'top/bottom outline symmetry');
    }
    if(shape==='square')for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)assert.equal(alpha(x,y),255,'no rectangular gaps');
    assert.ok(tiles.length);assert.equal(alpha(0,0),0);
  }
});

test('incompatible images require explicit cropping and fixed project settings round-trip', () => {
  const sources=[createCanvas(60,90),createCanvas(68,100)];
  for(const source of sources){source.getContext('2d').fillStyle='#f00';source.getContext('2d').fillRect(0,0,source.width,source.height);}
  const make=crop=>normalizeProject({version:1,images:sources.map((_,i)=>({src:`${i}.png`})),subject:{tileRatio:'portrait',shape:'square',granularity:4,repeat:true,count:80,crop},base:{preset:'none'}});
  assert.throws(()=>renderWall(createCanvas(1,1),make(false),sources),/允许裁切/);
  const canvas=createCanvas(1,1),p=make(true);renderWall(canvas,p,sources);
  assert.deepEqual(normalizeProject(p),p);
  assert.equal(canvas.getContext('2d').getImageData(0,0,1,1).data[3],0);
  assert.throws(()=>normalizeProject({...p,subject:{...p.subject,crop:1}}));
  assert.throws(()=>normalizeProject({...p,subject:{...p.subject,tileRatio:'arbitrary'}}));
  assert.deepEqual(fixedCounts({tileRatio:'portrait',shape:'square',granularity:4},1),[]);
});
