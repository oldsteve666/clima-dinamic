// IndexedDB wrapper con compressione dati e TTL
const DB_NAME = 'cm-weather-db';
const DB_VERSION = 1;
const STORE = 'data';

let dbPromise = null;

function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){
      reject(new Error('IndexedDB non supportato'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if(!req.result.objectStoreNames.contains(STORE)){
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function cacheGet(key, ttlMs = 10*60*1000){
  try{
    const db = await openDB();
    return new Promise((resolve)=>{
      const tx = db.transaction(STORE,'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const entry = req.result;
        if(!entry) return resolve(null);
        if(Date.now() - entry.ts > ttlMs) return resolve(null);
        resolve(entry.value);
      };
      req.onerror = () => resolve(null);
    });
  }catch(e){
    // fallback localStorage
    try{
      const raw = localStorage.getItem(`cm:${key}`);
      if(!raw) return null;
      const entry = JSON.parse(raw);
      if(Date.now() - entry.ts > ttlMs) return null;
      return entry.value;
    }catch(_){ return null; }
  }
}

export async function cacheSet(key, value){
  try{
    const db = await openDB();
    return new Promise((resolve)=>{
      const tx = db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put({value, ts:Date.now()}, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }catch(e){
    try{
      localStorage.setItem(`cm:${key}`, JSON.stringify({value, ts:Date.now()}));
    }catch(_){ /* quota exceeded */ }
  }
}

export async function cacheClear(){
  try{
    const db = await openDB();
    return new Promise((resolve)=>{
      const tx = db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }catch(e){ /* ignore */ }
  // clear localStorage too
  Object.keys(localStorage)
    .filter(k=>k.startsWith('cm:'))
    .forEach(k=>localStorage.removeItem(k));
}