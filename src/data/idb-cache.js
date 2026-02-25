/**
 * IndexedDB caching layer for database files.
 *
 * Stores ArrayBuffer data with ETag metadata for conditional re-fetching.
 * Used as both a global script (for db.js) and ES module (for tests).
 */

const DB_NAME = "wkbl-cache";
const DB_VERSION = 1;
const STORE_NAME = "db-files";

/**
 * Open (or create) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
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

/**
 * Save a database file to IndexedDB cache.
 * @param {string} key - Cache key (e.g., "wkbl-core", "wkbl-detail")
 * @param {ArrayBuffer} buffer - The file data
 * @param {string|null} etag - ETag from the server response
 * @returns {Promise<void>}
 */
export async function saveToCache(key, buffer, etag) {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
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
  });
}

/**
 * Load a cached database file from IndexedDB.
 * @param {string} key - Cache key
 * @returns {Promise<{buffer: ArrayBuffer, etag: string|null}|null>}
 */
export async function loadFromCache(key) {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
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
  });
}

/**
 * Remove a cached entry.
 * @param {string} key - Cache key
 * @returns {Promise<void>}
 */
export async function clearCache(key) {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
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
  });
}

// Global export for non-module script usage (db.js)
if (typeof window !== "undefined") {
  window.IDBCache = { saveToCache, loadFromCache, clearCache };
}
