import { dimensions, normalizeProject } from './model.js';
import { random } from './layout.js';
import { composition, fitImage, subjectLayout } from './shapes.js';
import { fixedLayout, incompatibleImages, TILE_LABELS } from './fixed-layout.js';
const FONT = '"PosterWall CJK", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
function text(ctx, value, x, y, maxWidth, size, color, weight = 400) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${FONT}`;
  while (ctx.measureText(value).width > maxWidth && size > 10) { size -= 1; ctx.font = `${weight} ${size}px ${FONT}`; }
  ctx.fillText(value, x, y, maxWidth);
}
export function cover(ctx, image, tile, focusX = .5, focusY = .5) {
  const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
  const scale = Math.max(tile.w / iw, tile.h / ih), sw = tile.w / scale, sh = tile.h / scale;
  ctx.drawImage(image, (iw - sw) * focusX, (ih - sh) * focusY, sw, sh, tile.x, tile.y, tile.w, tile.h);
}
const PALETTES = {
  none: { background: null, mat: null, ink: '#222222' },
  white: { background: '#ffffff', mat: '#ffffff', ink: '#222222' },
  paper: { background: '#f2eee6', mat: '#f8f5ee', ink: '#39352f' },
  black: { background: '#202020', mat: '#303030', ink: '#f5f5f5' },
  gallery: { background: '#f7f7f5', mat: '#ffffff', ink: '#222222' },
};
export function renderWall(canvas, input, loadedImages, scale = 1, loadedBackground = null) {
  const project = normalizeProject(input), s = project.settings, mount = project.base;
  const colors = PALETTES[mount.preset], geometry = composition(project);
  const { box, frame, width: baseWidth, height: baseHeight, textHeight, mat } = geometry;
  const size = dimensions(s, scale);
  canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (colors.background) { ctx.fillStyle = colors.background; ctx.fillRect(0, 0, baseWidth, baseHeight); }
  if (mount.background) {
    if (!loadedBackground) throw new Error('背景图未加载');
    cover(ctx, loadedBackground, {x:0,y:0,w:baseWidth,h:baseHeight}, mount.background.focusX, mount.background.focusY);
  } else if (mount.preset === 'paper') {
    const rng = random(617);
    for (let i=0;i<14000;i++) {
      ctx.fillStyle = i%2 ? '#ffffff30' : '#554a3910';
      ctx.fillRect(rng()*baseWidth,rng()*baseHeight,.8+rng(),.8+rng());
    }
  }
  const aspects = loadedImages.map(img => (img.naturalWidth || img.width) / (img.naturalHeight || img.height));
  const incompatible = incompatibleImages(aspects, project.subject);
  if (incompatible.length) throw new Error(`${incompatible.length} 张图片不符合 ${TILE_LABELS[project.subject.tileRatio]}。请更换图片比例或开启「允许裁切」。`);
  const slots = project.subject.tileRatio === 'native'
    ? subjectLayout(project.images.length, box, s, project.subject.shape, aspects, project.subject.granularity, project.subject.repeat, project.subject.count)
    : fixedLayout(project.images.length, box, project.subject, s.seed);
  const symmetricSnap = center => value => {
    const offset = (value - center) * scale;
    return Math.round(center * scale) + Math.sign(offset) * Math.round(Math.abs(offset) + 1e-9);
  };
  const snapX = ['heart', 'circle'].includes(project.subject.shape) ? symmetricSnap(box.x + box.w / 2) : value => Math.round(value * scale);
  const snapY = project.subject.shape === 'circle' ? symmetricSnap(box.y + box.h / 2) : value => Math.round(value * scale);
  // A rectangular mount sits behind the arrangement; the art itself is never masked.
  if (mount.preset !== 'none' && slots.length && (mat || mount.shadow)) {
    const left = Math.min(...slots.map(t => t.x)), top = Math.min(...slots.map(t => t.y));
    const right = Math.max(...slots.map(t => t.x + t.w)), bottom = Math.max(...slots.map(t => t.y + t.h));
    ctx.save();
    if (mount.shadow) { ctx.shadowColor = '#00000030'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10; }
    ctx.fillStyle = colors.mat; ctx.fillRect(left - mat, top - mat, right - left + mat * 2, bottom - top + mat * 2); ctx.restore();
  }
  const tiles = [];
  for (const slot of slots) {
    const item = project.images[slot.index], img = loadedImages[slot.index];
    if (!img) throw new Error(`图片未加载：${item.title}`);
    let tile = slot;
    // Shared edges snap to the same output pixel, preventing hairline alpha
    // seams from separate subpixel draws. Every source is still drawn in full.
    const x = snapX(tile.x), y = snapY(tile.y);
    const right = snapX(tile.x + tile.w), bottom = snapY(tile.y + tile.h);
    const outputTile = { x: x / scale, y: y / scale, w: (right - x) / scale, h: (bottom - y) / scale };
    if (project.subject.crop && project.subject.tileRatio !== 'native') cover(ctx, img, outputTile, item.focusX, item.focusY);
    else ctx.drawImage(img, outputTile.x, outputTile.y, outputTile.w, outputTile.h);
    tiles.push(tile);
    if (s.showCaptions) {
      const labelHeight = Math.min(52, tile.h * .24), gradient = ctx.createLinearGradient(0, tile.y + tile.h - labelHeight * 2, 0, tile.y + tile.h);
      gradient.addColorStop(0, '#00000000'); gradient.addColorStop(1, '#000000c9');
      ctx.fillStyle = gradient; ctx.fillRect(tile.x, tile.y + tile.h - labelHeight * 2, tile.w, labelHeight * 2);
      text(ctx, item.title, tile.x + 10, tile.y + tile.h - 12, Math.max(10, tile.w - 20), Math.min(20, labelHeight * .6), '#ffffff', 500);
    }
  }
  if(textHeight) {
    const textX=baseWidth/2,max=baseWidth-2*(s.padding+frame+mat);
    let y=baseHeight-s.padding-frame-mat-textHeight;
    if(mount.background){ctx.fillStyle=colors.mat;ctx.fillRect(s.padding+frame,y-12,baseWidth-2*(s.padding+frame),textHeight+12);}
    ctx.textAlign='center';
    for(const [value,fontSize,weight] of [[s.eyebrow,16,500],[s.title,40,600],[s.subtitle,21,400],[s.signature,16,400]]) {
      if(!value)continue;y+=fontSize;text(ctx,value,textX,y,max,fontSize,colors.ink,weight);y+=16;
    }
    ctx.textAlign='left';
  }
  if(frame) {
    ctx.fillStyle='#222222';ctx.fillRect(0,0,baseWidth,frame);ctx.fillRect(0,baseHeight-frame,baseWidth,frame);ctx.fillRect(0,0,frame,baseHeight);ctx.fillRect(baseWidth-frame,0,frame,baseHeight);
    ctx.strokeStyle='#00000025';ctx.lineWidth=2;ctx.strokeRect(frame+3,frame+3,baseWidth-2*frame-6,baseHeight-2*frame-6);
  }
  return tiles;
}
