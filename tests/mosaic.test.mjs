import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, SHAPES } from '../src/model.js';
import { subjectLayout } from '../src/shapes.js';
import { COUNT_PRESETS } from '../src/levels.js';
import { shapeSpans } from '../src/mosaic.js';
const aspectOf = shape => shape === 'heart' ? 1.12 : ['portrait','arch'].includes(shape) ? 2/3 : shape === 'landscape' ? 1.5 : 1;

test('all fixed tiers preserve whole images, dense coverage and intended silhouettes', () => {
  const small = Array(18).fill(2/3); small[8] = 12/17; small[13] = .68;
  const varied = [...Array(40).fill(2/3), .68, 12/17, 273/365, 260/381, 259/384, 257/387, .705, .879];
  for (const ratios of [small, varied]) for (const shape of SHAPES) for (const level of [1,2,3,4]) {
    let previousCount = 0;
    for (const count of COUNT_PRESETS) {
      const aspect = aspectOf(shape), box = {x:0,y:0,w:600*aspect,h:600};
      const tiles = subjectLayout(ratios.length,box,DEFAULTS,shape,ratios,level,true,count);
      assert.ok(tiles.length > previousCount, `${shape}/${level}: more dense tiers must add posters`); previousCount = tiles.length;
      assert.equal(new Set(tiles.map(t=>t.index)).size,ratios.length);
      assert.equal(new Set(tiles.map(t=>+t.h.toFixed(6))).size,level);
      for (const tile of tiles) assert.ok(Math.abs(tile.w/tile.h-ratios[tile.index])<1e-8);
      // Compare raster coverage with the intended outline. This catches
      // symmetric but wrong outlines such as hourglasses, crosses and ovals.
      const x0=Math.min(...tiles.map(t=>t.x)), y0=Math.min(...tiles.map(t=>t.y));
      const width=Math.max(...tiles.map(t=>t.x+t.w))-x0,height=Math.max(...tiles.map(t=>t.y+t.h))-y0;
      let intersection=0,union=0;
      for(let y=0;y<40;y++)for(let x=0;x<40;x++) {
        const nx=(x+.5)/40,ny=(y+.5)/40;
        const expected=shapeSpans(shape,ny,aspect).some(([l,r])=>nx>=l&&nx<=r);
        const actual=tiles.some(t=>x0+nx*width>=t.x&&x0+nx*width<t.x+t.w&&y0+ny*height>=t.y&&y0+ny*height<t.y+t.h);
        intersection+=expected&&actual;union+=expected||actual;
      }
      assert.ok(intersection/union>.86,`${shape}/${level}/${count}: silhouette overlap ${intersection/union}`);
      const ys=[...new Set(tiles.flatMap(t=>[t.y,t.y+t.h]))].sort((a,b)=>a-b);
      for(let i=1;i<ys.length;i++) {
        if(ys[i]-ys[i-1]<1e-7)continue;
        const y=(ys[i]+ys[i-1])/2,row=tiles.filter(t=>y>t.y&&y<t.y+t.h).sort((a,b)=>a.x-b.x);
        let gaps=0;
        for(let j=1;j<row.length;j++) {const gap=row[j].x-row[j-1].x-row[j-1].w;assert.ok(gap>=-1e-6,'overlap');if(gap>1e-6)gaps++;}
        assert.ok(gaps<=(shape==='heart'&&y<y0+height*.2?1:0),'internal empty gap');
      }
    }
  }
});

test('template variants interlock size levels within rows and stay fast', () => {
  const ratios=Array(18).fill(2/3), start=performance.now();
  for(const shape of SHAPES)for(const count of COUNT_PRESETS) {
    const tiles=subjectLayout(18,{x:0,y:0,w:600*aspectOf(shape),h:600},{...DEFAULTS,seed:904},shape,ratios,4,true,count);
    let mixed=0,rows=0;
    const y0=Math.min(...tiles.map(t=>t.y)),bottom=Math.max(...tiles.map(t=>t.y+t.h));
    for(let y=y0;y<bottom;y+=(bottom-y0)/30) {
      const heights=new Set(tiles.filter(t=>y>t.y&&y<t.y+t.h).map(t=>t.level));
      if(heights.size){rows++;mixed+=heights.size>1;}
    }
    assert.ok(mixed/rows>.55, `${shape}/${count}: sizes must interlock instead of forming uniform bands`);
  }
  assert.ok(performance.now()-start<5000,'fixed template generation must avoid multi-second searches per change');
});
