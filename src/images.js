const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 80 * 1024 * 1024;
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => { img.src = ''; reject(new Error('图片加载超时')); }, 15000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('图片无法读取，请使用 JPG、PNG 或 WebP')); };
    img.src = src;
  });
}
export function blobDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
  });
}
export async function importImage(file, { maxEdge = 2000 } = {}) {
  if (!TYPES.includes(file.type)) throw new Error(`${file.name}：仅支持 JPG、PNG、WebP`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name}：请使用小于 20 MB 的图片`);
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (img.naturalWidth * img.naturalHeight > 60_000_000) throw new Error(`${file.name}：图片超过 6000 万像素，请先缩小`);
    const factor = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * factor)); canvas.height = Math.max(1, Math.round(img.naturalHeight * factor));
    // Keep standard ratios exact when downsampling (e.g. 2000 × 3000 becomes
    // 1332 × 1998, not 1333 × 2000 and a false compatibility warning).
    const standard = [[2,3],[3,2],[1,1]].find(([w,h]) => img.naturalWidth * h === img.naturalHeight * w);
    if (standard) {
      const units = Math.max(1, Math.floor(Math.min(canvas.width / standard[0], canvas.height / standard[1])));
      canvas.width = units * standard[0]; canvas.height = units * standard[1];
    }
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return { id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, '').slice(0,120), src: canvas.toDataURL('image/webp', .93), focusX: .5, focusY: .5 };
  } finally { URL.revokeObjectURL(url); }
}
// Projects opened from disk may only refer to their own embedded images or
// files explicitly selected by the user. They never trigger remote requests.
export function resolveImageFiles(items, files = []) {
  const imageFiles = files.filter(f => TYPES.includes(f.type));
  return items.map(item => {
    if (/^data:image\/(png|jpeg|webp);base64,/i.test(item.src)) return { ...item };
    const name = item.src.split('/').pop();
    const matches = imageFiles.filter(f => f.name === name);
    if (matches.length !== 1) throw new Error(`请将项目 JSON 与图片「${name}」一起拖入；同名图片请先改名。也可以使用保存项目生成的内嵌图片 JSON。`);
    return { ...item, file: matches[0] };
  });
}

export function resolveProjectImages(project, files = []) { return resolveImageFiles(project.images, files); }
