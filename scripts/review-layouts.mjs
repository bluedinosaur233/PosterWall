// Visual regression sheet: npm run review-layouts. Uses generated cover designs.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFile, mkdir } from 'node:fs/promises';
import { createDemoProject } from '../src/demo.js';
import { normalizeProject, SHAPES } from '../src/model.js';
import { renderWall } from '../src/render.js';
import { fixedQuantityOptions, TILE_RATIOS } from '../src/fixed-layout.js';
const project = createDemoProject(createCanvas);
const images = await Promise.all(project.images.map(i => loadImage(i.src)));
await mkdir('output',{recursive:true});
const times=[];
for (const tileRatio of Object.keys(TILE_RATIOS)) for (let tier=0;tier<6;tier++) {
  const cell=260,rowHeight=290, sheet=createCanvas(cell*6,rowHeight*4),ctx=sheet.getContext('2d');
  ctx.fillStyle='#eee';ctx.fillRect(0,0,sheet.width,sheet.height);
  for(let level=1;level<=4;level++)for(const [column,shape] of SHAPES.entries()) {
    const subject={shape,granularity:level,tileRatio,repeat:true,crop:true,scale:.88};
    const count=fixedQuantityOptions(subject)[tier];
    if(count==null)continue;
    const p=normalizeProject({...project,settings:{...project.settings,ratio:'square',padding:32,showHeader:false},subject:{...subject,count},base:{preset:'white'}});
    const canvas=createCanvas(1,1),start=performance.now(),tiles=renderWall(canvas,p,images,1);times.push(performance.now()-start);
    const x=column*cell,y=(level-1)*rowHeight;
    ctx.drawImage(canvas,x+6,y+28,cell-12,cell-12);ctx.fillStyle='#222';ctx.font='14px sans-serif';
    ctx.fillText(`${shape} / L${level} / ${tiles.length}`,x+12,y+20);
  }
  await writeFile(`output/layout-review-${tileRatio}-${tier+1}.jpg`,sheet.toBuffer('image/jpeg'));
}
console.log(JSON.stringify({compositions:times.length,maxMs:+Math.max(...times).toFixed(1),averageMs:+(times.reduce((a,b)=>a+b)/times.length).toFixed(1)}));
