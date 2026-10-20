export { fitImage } from './layout.js';
import { dimensions } from './model.js';
import { levelLayout } from './levels.js';
const layouts = new Map();

export function subjectLayout(count, box, settings, shape, aspects = [], granularity = 1, repeat = false, posterCount = null) {
  if (!repeat && posterCount !== null) count = Math.min(count, posterCount);
  const ratios = Array.from({ length: count }, (_, i) => aspects[i] || 2 / 3);
  const key = JSON.stringify([box, settings.seed, settings.gap, shape, ratios, granularity, repeat, posterCount]);
  if (!layouts.has(key)) {
    if (layouts.size >= 24) layouts.delete(layouts.keys().next().value);
    layouts.set(key, levelLayout(count, box, settings, shape, ratios, granularity, repeat, posterCount));
  }
  return layouts.get(key).map(tile => ({ ...tile }));
}

export function composition(project) {
  const { width, height } = dimensions(project.settings);
  const { subject, base, settings: s } = project;
  const frame = base.preset === 'gallery' ? 28 : 0;
  const mat = base.preset === 'none' ? 0 : base.mat;
  const margin = s.padding + mat + frame;
  const textHeight = s.showHeader ? [[s.eyebrow,16],[s.title,40],[s.subtitle,21],[s.signature,16]].reduce((total,[value,size]) => total + (value ? size + 16 : 0), 0) : 0;
  const area = { x: margin, y: margin, w: width - 2 * margin, h: height - 2 * margin - textHeight };
  const aspect = subject.shape === 'portrait' || subject.shape === 'arch' ? 2 / 3 : subject.shape === 'landscape' ? 3 / 2 : subject.shape === 'heart' ? 1.12 : 1;
  const w = Math.min(area.w, area.h * aspect) * subject.scale, h = w / aspect;
  const box = { x: area.x + (area.w - w) * subject.x, y: area.y + (area.h - h) * subject.y, w, h };
  return { box, area, textHeight, frame, mat, width, height };
}
