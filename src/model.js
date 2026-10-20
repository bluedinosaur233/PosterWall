export const VERSION = 1;
export const MAX_IMAGES = 100;
export const TEMPLATES = ['mosaic', 'grid', 'film', 'editorial'];
export const SHAPES = ['square', 'portrait', 'landscape', 'heart', 'circle', 'arch'];
export const BASE_PRESETS = ['none', 'white', 'paper', 'black', 'gallery'];
export const SUBJECT_DEFAULTS = { shape: 'square', granularity: 1, count: null, repeat: false, tileRatio: 'native', crop: false, scale: .82, x: .5, y: .5 };
export const BASE_DEFAULTS = { preset: 'white', mat: 0, shadow: false, background: null };
export const RATIOS = { portrait: [1080, 1350], square: [1080, 1080], story: [1080, 1920], landscape: [1920, 1080] };
export const THEMES = {
  paper: { background: '#f4f1e9', foreground: '#242721', muted: '#77796f', accent: '#bf593d' },
  ink: { background: '#19201f', foreground: '#f1efe6', muted: '#a4aea6', accent: '#c9e6a2' },
  sage: { background: '#dce4d7', foreground: '#2d3d31', muted: '#667262', accent: '#556b44' },
  blush: { background: '#eedbd5', foreground: '#533e3b', muted: '#94716b', accent: '#a94c41' },
};
export const DEFAULTS = {
  template: 'mosaic', ratio: 'portrait', theme: 'paper', title: '',
  subtitle: '', signature: '',
  eyebrow: '', gap: 0, padding: 48, columns: 4, seed: 233,
  showHeader: false, showCaptions: false,
};
const enumValue = (value, values, fallback, key) => {
  if (value === undefined) return fallback;
  if (!values.includes(value)) throw new Error(`${key} 的值无效：${value}`);
  return value;
};
const numberValue = (value, min, max, fallback, key) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${key} 必须在 ${min}–${max} 之间`);
  return value;
};
const stringValue = (value, fallback, max, key) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > max) throw new Error(`${key} 必须是最多 ${max} 字的文本`);
  return value;
};
export function normalizeImage(item, defaultId, defaultTitle) {
  if (!item || typeof item !== 'object' || typeof item.src !== 'string' || !item.src.trim()) throw new Error(`${defaultTitle}缺少 src`);
  if (/^(?:javascript|file|blob):/i.test(item.src) || (/^[a-z][a-z\d+.-]*:/i.test(item.src) && !/^data:image\/(?:png|jpeg|webp);base64,/i.test(item.src))) throw new Error(`${defaultTitle}请使用本地路径或 PNG/JPEG/WebP data URL`);
  if (item.src.startsWith('//') || item.src.includes('\\')) throw new Error('图片路径格式无效');
  return {
    id: stringValue(item.id, defaultId, 100, 'id'),
    title: stringValue(item.title, defaultTitle, 120, 'image.title'),
    src: item.src,
    focusX: numberValue(item.focusX, 0, 1, .5, 'focusX'),
    focusY: numberValue(item.focusY, 0, 1, .5, 'focusY'),
  };
}
export function projectAssets(project) {
  return project.base?.background ? [...project.images, project.base.background] : [...project.images];
}
export function normalizeProject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('项目必须是 JSON 对象');
  if (input.version !== VERSION) throw new Error('不支持此项目版本，请使用 version: 1');
  const s = input.settings ?? {};
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('settings 必须是对象');
  const settings = {
    template: enumValue(s.template, TEMPLATES, DEFAULTS.template, 'template'),
    ratio: enumValue(s.ratio, Object.keys(RATIOS), DEFAULTS.ratio, 'ratio'),
    theme: enumValue(s.theme, Object.keys(THEMES), DEFAULTS.theme, 'theme'),
    title: stringValue(s.title, DEFAULTS.title, 80, 'title'),
    subtitle: stringValue(s.subtitle, DEFAULTS.subtitle, 160, 'subtitle'),
    signature: stringValue(s.signature, DEFAULTS.signature, 80, 'signature'),
    eyebrow: stringValue(s.eyebrow, DEFAULTS.eyebrow, 80, 'eyebrow'),
    gap: numberValue(s.gap, 0, 32, DEFAULTS.gap, 'gap'),
    padding: numberValue(s.padding, 16, 100, DEFAULTS.padding, 'padding'),
    columns: numberValue(s.columns, 2, 8, DEFAULTS.columns, 'columns'),
    seed: numberValue(s.seed, 0, 4294967295, DEFAULTS.seed, 'seed'),
  };
  for (const key of ['showHeader', 'showCaptions']) {
    if (s[key] !== undefined && typeof s[key] !== 'boolean') throw new Error(`${key} 必须为布尔值`);
    settings[key] = s[key] ?? DEFAULTS[key];
  }
  if (!Number.isInteger(settings.columns) || !Number.isInteger(settings.seed)) throw new Error('columns 和 seed 必须为整数');
  if (!Array.isArray(input.images) || input.images.length > MAX_IMAGES) throw new Error(`images 必须是数组，最多 ${MAX_IMAGES} 张`);
  const images = input.images.map((item, i) => normalizeImage(item, `image-${i + 1}`, `作品 ${i + 1}`));
  if (new Set(images.map(i => i.id)).size !== images.length) throw new Error('图片 id 不能重复');
  const sub = input.subject ?? {}, mount = input.base ?? {};
  for (const [key, value] of [['subject', sub], ['base', mount]]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${key} 必须是对象`);
  }
  if (sub.repeat !== undefined && typeof sub.repeat !== 'boolean') throw new Error('subject.repeat 必须为布尔值');
  if (sub.crop !== undefined && typeof sub.crop !== 'boolean') throw new Error('subject.crop 必须为布尔值');
  const subject = {
    shape: enumValue(sub.shape, SHAPES, SUBJECT_DEFAULTS.shape, 'subject.shape'),
    repeat: sub.repeat ?? SUBJECT_DEFAULTS.repeat,
    tileRatio: enumValue(sub.tileRatio, ['native', 'portrait', 'landscape', 'square'], 'native', 'subject.tileRatio'),
    crop: sub.crop ?? false,
    granularity: numberValue(sub.granularity, 1, 4, SUBJECT_DEFAULTS.granularity, 'subject.granularity'),
    count: sub.count == null ? null : numberValue(sub.count, 1, 600, null, 'subject.count'),
    scale: numberValue(sub.scale, .3, 1, SUBJECT_DEFAULTS.scale, 'subject.scale'),
    x: numberValue(sub.x, 0, 1, .5, 'subject.x'),
    y: numberValue(sub.y, 0, 1, .5, 'subject.y'),
  };
  if (!Number.isInteger(subject.granularity)) throw new Error('subject.granularity 必须为整数');
  if (subject.count !== null && !Number.isInteger(subject.count)) throw new Error('subject.count 必须为整数');
  if (mount.shadow !== undefined && typeof mount.shadow !== 'boolean') throw new Error('base.shadow 必须是布尔值');
  const base = {
    preset: enumValue(mount.preset, BASE_PRESETS, BASE_DEFAULTS.preset, 'base.preset'),
    mat: numberValue(mount.mat, 0, 80, BASE_DEFAULTS.mat, 'base.mat'),
    shadow: mount.shadow ?? BASE_DEFAULTS.shadow,
    background: mount.background == null ? null : normalizeImage(mount.background, 'background', '背景图'),
  };
  if (base.preset === 'none') base.background = null;
  return { version: VERSION, settings, subject, base, images };
}
export function dimensions(settings, scale = 1) {
  if (![1, 2, 3].includes(scale)) throw new Error('导出倍率必须是 1、2 或 3');
  const [w, h] = RATIOS[settings.ratio];
  return { width: w * scale, height: h * scale };
}
