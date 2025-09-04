/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

const DB_NAME = 'co-drawing-db';
const STORE_NAME = 'history';
const DB_VERSION = 1;

export interface HistoryRecord {
  id: number;
  dataUrl: string;
  createdAt?: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  const t = db.transaction(STORE_NAME, mode);
  return { t, store: t.objectStore(STORE_NAME) } as const;
}

export async function addHistoryItem(item: { id: number; dataUrl: string }): Promise<void> {
  const db = await openDb();
  const { t, store } = tx(db, 'readwrite');
  const fullItem: HistoryRecord = { ...item, createdAt: Date.now() };
  await new Promise<void>((resolve, reject) => {
    const req = store.put(fullItem);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  t.commit?.();
  db.close();
}

export async function getAllHistoryItems(): Promise<HistoryRecord[]> {
  try {
    const db = await openDb();
    const { t, store } = tx(db, 'readonly');
    const idx = store.index('createdAt');
    const items: HistoryRecord[] = await new Promise((resolve, reject) => {
      const req = idx.getAll();
      req.onsuccess = () => resolve(req.result as any);
      req.onerror = () => reject(req.error);
    });
    t.commit?.();
    db.close();
    return items;
  } catch (e) {
    console.error('Failed to fetch history items from DB:', e);
    return [];
  }
}

export async function deleteHistoryItem(id: number): Promise<void> {
  const db = await openDb();
  const { t, store } = tx(db, 'readwrite');
  await new Promise<void>((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  t.commit?.();
  db.close();
}

export async function clearHistory(): Promise<void> {
  const db = await openDb();
  const { t, store } = tx(db, 'readwrite');
  await new Promise<void>((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  t.commit?.();
  db.close();
}
