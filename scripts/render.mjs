#!/usr/bin/env node
import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname, extname, basename } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { normalizeProject, MAX_IMAGES, dimensions, projectAssets, selectedImages } from '../src/model.js';
import { renderWall } from '../src/render.js';
const MIME = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp' };
export async function renderProject({ input, images, output = 'output/posterwall.png', scale = '2', template, ratio, title, seed, font, shape, granularity, levels, count, repeat, crop, 'tile-ratio': tileRatio, base: basePreset, background, mat, shadow, 'subject-scale': subjectScale, project: projectOutput } = {}) {
  if (!!input === !!images) throw new Error('请提供 --input 项目.json 或 --images 图片文件夹，二选一');
  let project, base;
  if (input) {
    if ((await stat(input)).size > 80 * 1024 * 1024) throw new Error('项目超过 80 MB');
    project = JSON.parse(await readFile(input, 'utf8')); base = dirname(resolve(input));
  } else {
    base = resolve(images);
    const files = (await readdir(base, { withFileTypes: true })).filter(f => f.isFile() && MIME[extname(f.name).toLowerCase()]).map(f => f.name).sort((a,b) => a.localeCompare(b, 'en', { numeric: true }));
    if (!files.length) throw new Error('文件夹中没有 JPG、PNG 或 WebP 图片');
    if (files.length > MAX_IMAGES) throw new Error(`最多 ${MAX_IMAGES} 张，请缩小图片集合`);
    project = { version: 1, settings: {}, images: files.map((name,i) => ({ id: `image-${i + 1}`, title: basename(name, extname(name)), src: name })) };
  }
  project.settings ??= {};
  for (const [key, value] of Object.entries({ template, ratio, title, seed: seed === undefined ? undefined : Number(seed) })) if (value !== undefined) project.settings[key] = value;
  if (title !== undefined) project.settings.showHeader = true;
  project.subject ??= {}; project.base ??= {};
  if (count !== undefined) project.subject.count = Number(count);
  if (repeat !== undefined) project.subject.repeat = repeat;
  if (crop !== undefined) project.subject.crop = crop;
  if (tileRatio !== undefined) project.subject.tileRatio = tileRatio;
  if (levels !== undefined && granularity !== undefined && Number(levels) !== Number(granularity)) throw new Error('--levels 与旧参数 --granularity 的值不一致');
  if (levels !== undefined || granularity !== undefined) project.subject.granularity = Number(levels ?? granularity);
  if (shape !== undefined) project.subject.shape = shape;
  if (subjectScale !== undefined) project.subject.scale = Number(subjectScale);
  if (basePreset !== undefined) project.base.preset = basePreset;
  if (mat !== undefined) project.base.mat = Number(mat);
  if (shadow !== undefined) project.base.shadow = shadow;
  if (background !== undefined) project.base.background = { src: resolve(background), title: basename(background) };
  project = normalizeProject(project);
  if (!project.images.length) throw new Error('项目没有图片');
  if (!selectedImages(project).length) throw new Error('请先勾选素材');
  const multiplier = Number(scale), size = dimensions(project.settings, multiplier);
  const extension = extname(output).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(extension)) throw new Error('--output 扩展名必须为 .png 或 .jpg');
  if (project.base.preset === 'none' && extension !== '.png') throw new Error('无底座请使用 PNG，以保留透明背景');
  if (input && resolve(input) === resolve(output)) throw new Error('输出不能覆盖输入项目');
  if (projectOutput && (resolve(projectOutput) === resolve(output) || (input && resolve(projectOutput) === resolve(input)))) throw new Error('项目输出路径必须与输入和海报输出不同');
  if (font && !GlobalFonts.registerFromPath(resolve(font), 'PosterWall CJK')) throw new Error('字体加载失败，请提供 TTF / OTF / TTC 文件');
  const loaded = [], portable = structuredClone(project);
  const portableAssets = projectAssets(portable);
  for (const [i, item] of projectAssets(project).entries()) {
    let buffer, mime;
    if (item.src.startsWith('data:')) {
      const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z\d+/=\s]+)$/i.exec(item.src);
      if (!match) throw new Error(`图片 data URL 无效：${item.title}`);
      buffer = Buffer.from(match[2], 'base64'); mime = match[1];
    } else {
      const file = resolve(base, item.src); mime = MIME[extname(file).toLowerCase()];
      if (!mime) throw new Error(`不支持的图片类型：${item.src}`);
      if (file === resolve(output) || (projectOutput && file === resolve(projectOutput))) throw new Error('输出不能覆盖源图片');
      if ((await stat(file)).size > 20 * 1024 * 1024) throw new Error(`图片超过 20 MB：${item.title}`);
      buffer = await readFile(file);
    }
    if (buffer.length > 20 * 1024 * 1024) throw new Error(`图片超过 20 MB：${item.title}`);
    const image = await loadImage(buffer);
    if (image.width * image.height > 60_000_000) throw new Error(`图片超过 6000 万像素：${item.title}`);
    loaded.push(image); portableAssets[i].src = `data:image/${mime};base64,${buffer.toString('base64')}`;
  }
  const portableJSON = projectOutput ? JSON.stringify(portable, null, 2) + '\n' : null;
  if (portableJSON && Buffer.byteLength(portableJSON) > 80 * 1024 * 1024) throw new Error('可移植项目超过 80 MB，请减少素材');
  const canvas = createCanvas(1, 1); renderWall(canvas, project, loaded.slice(0, project.images.length), multiplier, project.base.background ? loaded.at(-1) : null);
  const data = extension === '.png' ? await canvas.encode('png') : await canvas.encode('jpeg', 96);
  await mkdir(dirname(resolve(output)), { recursive: true }); await writeFile(output, data);
  if (projectOutput) { await mkdir(dirname(resolve(projectOutput)), { recursive: true }); await writeFile(projectOutput, portableJSON); }
  return { output: resolve(output), ...size, images: selectedImages(project).length, bytes: data.length, project: projectOutput ? resolve(projectOutput) : undefined };
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    const { values } = parseArgs({ options: Object.fromEntries(['input', 'images', 'output', 'scale', 'template', 'ratio', 'title', 'seed', 'font', 'shape', 'tile-ratio', 'count', 'levels', 'granularity', 'base', 'background', 'mat', 'subject-scale', 'project'].map(key => [key, { type: 'string' }]).concat([['help', { type: 'boolean', short: 'h' }], ['shadow', { type: 'boolean' }], ['repeat', { type: 'boolean' }], ['crop', { type: 'boolean' }]])) });
    if (values.help) console.log(`PosterWall — deterministic, browser-free image export\n\nnode scripts/render.mjs --images ./my-posters --output output/wall.png\nnode scripts/render.mjs --images ./my-images --title "我的年度片单" --project output/wall.posterwall.json\n\n--scale 1|2|3  --ratio portrait|square|story|landscape\n--shape square|portrait|landscape|heart|circle|arch\n--tile-ratio native|portrait|landscape|square  --crop\n--base none|white|paper|black|gallery  --background ./photo.jpg\n--levels 1|2|3|4  --count 216  --repeat  --subject-scale 0.82  --shadow\n--seed 233  --font ./NotoSansCJK-Regular.ttc\n\nPaths in JSON resolve relative to the JSON file. No network access is performed.\n--project writes a portable JSON with embedded images for the web editor.\nExisting output files are overwritten; source images and input JSON are protected.`);
    else console.log(JSON.stringify(await renderProject(values), null, 2));
  } catch (error) { console.error(`PosterWall: ${error.message}`); process.exitCode = 1; }
}
