const DB_NAME = 'satellites';
const DB_VER  = 1;
const STORE   = 'tle';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VER); }
    catch (err) { reject(err); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error || new Error('indexeddb open failed'));
    req.onblocked = () => reject(new Error('indexeddb blocked'));
  }).catch((err) => { dbPromise = null; throw err; });
  return dbPromise;
}

function run(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r ? r.result : undefined);
    t.onabort    = () => reject(t.error || new Error('transaction aborted'));
    t.onerror    = () => reject(t.error || new Error('transaction failed'));
  }));
}

export async function cacheGet(key) {
  try {
    const v = await run('readonly', (s) => s.get(key));
    return v === undefined ? null : v;
  } catch { return null; }
}

export async function cacheSet(key, value) {
  try { await run('readwrite', (s) => s.put(value, key)); return true; }
  catch { return false; }
}

export async function cacheGetMany(keys) {
  const out = new Array(keys.length).fill(null);
  if (keys.length === 0) return out;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly');
      const s = t.objectStore(STORE);
      keys.forEach((k, i) => {
        const r = s.get(k);
        r.onsuccess = () => { if (r.result !== undefined) out[i] = r.result; };
      });
      t.oncomplete = resolve;
      t.onabort    = () => reject(t.error || new Error('transaction aborted'));
      t.onerror    = () => reject(t.error || new Error('transaction failed'));
    });
  } catch {}
  return out;
}

export function purgeLegacyCache() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('tle:')) localStorage.removeItem(k);
    }
  } catch {}
}
