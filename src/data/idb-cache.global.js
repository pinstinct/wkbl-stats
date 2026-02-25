/**
 * IndexedDB caching layer for database files (global script version).
 *
 * Browser runtime uses this file via a classic <script> tag so db.js can
 * access window.IDBCache without ESM parsing errors.
 */

const DB_NAME = "wkbl-cache";
const DB_VERSION = 1;
const STORE_NAME = "db-files";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const idb = request.result;
      if (!idb.objectStoreNames.contains(STORE_NAME)) {
        idb.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function saveToCache(key, buffer, etag) {
  return openDB().then(
    (idb) =>
      new Promise((resolve, reject) => {
        const tx = idb.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.put({ buffer, etag, timestamp: Date.now() }, key);
        tx.oncomplete = () => {
          idb.close();
          resolve();
        };
        tx.onerror = () => {
          idb.close();
          reject(tx.error);
        };
      }),
  );
}

function loadFromCache(key) {
  return openDB().then(
    (idb) =>
      new Promise((resolve, reject) => {
        const tx = idb.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => {
          idb.close();
          const result = request.result;
          if (!result) return resolve(null);
          resolve({ buffer: result.buffer, etag: result.etag || null });
        };
        request.onerror = () => {
          idb.close();
          reject(request.error);
        };
      }),
  );
}

function clearCache(key) {
  return openDB().then(
    (idb) =>
      new Promise((resolve, reject) => {
        const tx = idb.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.delete(key);
        tx.oncomplete = () => {
          idb.close();
          resolve();
        };
        tx.onerror = () => {
          idb.close();
          reject(tx.error);
        };
      }),
  );
}

if (typeof window !== "undefined") {
  window.IDBCache = { saveToCache, loadFromCache, clearCache };
}
