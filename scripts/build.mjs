import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const path of ['index.html', 'src']) await cp(path, `dist/${path}`, { recursive: true });
await mkdir('dist/public', { recursive: true });
await cp('public/icon.svg', 'dist/public/icon.svg');
console.log('Built dist/ — deploy this directory at any URL prefix.');
