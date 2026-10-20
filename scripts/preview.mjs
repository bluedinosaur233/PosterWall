import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFile } from 'node:fs/promises';
import { createDemoProject } from '../src/demo.js';
import { renderWall } from '../src/render.js';

const project = createDemoProject(createCanvas);
const images = await Promise.all(project.images.map(item => loadImage(item.src)));
const preview = createCanvas(1560, 820), ctx = preview.getContext('2d');
ctx.fillStyle = '#f0efec'; ctx.fillRect(0, 0, preview.width, preview.height);
ctx.fillStyle = '#242424'; ctx.font = 'bold 35px sans-serif'; ctx.fillText('PosterWall', 40, 63);
const variants = [
  { shape: 'square', count: 48, preset: 'gallery', label: 'SQUARE / 48' },
  { shape: 'heart', count: 47, preset: 'white', label: 'HEART / 47' },
  { shape: 'circle', count: 47, preset: 'black', label: 'CIRCLE / 47' },
];
for (const [index, variant] of variants.entries()) {
  const canvas = createCanvas(1, 1);
  renderWall(canvas, { ...project, subject: { ...project.subject, shape: variant.shape, count: variant.count }, base: { preset: variant.preset } }, images);
  const x = 40 + index * 510;
  ctx.drawImage(canvas, x, 108, 460, 575);
  ctx.fillStyle = '#4b4b4b'; ctx.font = '16px sans-serif'; ctx.fillText(variant.label, x, 721);
}
await writeFile('docs/preview.png', preview.toBuffer('image/png'));
console.log('Generated docs/preview.png');
