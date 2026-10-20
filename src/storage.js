const database = () => new Promise((resolve, reject) => {
  if (!globalThis.indexedDB) return reject(new Error('浏览器不支持本地草稿'));
  const request = indexedDB.open('posterwall', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('projects');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => resolve(request.result);
});
export async function readDraft() {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const request = tx.objectStore('projects').get('draft');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
export async function writeDraft(project) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put(project, 'draft');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
