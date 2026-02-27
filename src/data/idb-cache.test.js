import { describe, expect, it, beforeEach, vi } from "vitest";

import { saveToCache, loadFromCache, clearCache } from "./idb-cache.js";

// Mock IndexedDB using a simple in-memory store
function createMockIDB() {
  const stores = {};

  const mockObjectStore = (name) => {
    if (!stores[name]) stores[name] = {};
    const store = stores[name];
    return {
      put(value, key) {
        store[key] = value;
        return { set onsuccess(fn) {}, set onerror(fn) {} };
      },
      get(key) {
        const req = { result: store[key] || undefined };
        // onsuccess will be called synchronously in our mock
        return {
          get result() {
            return req.result;
          },
          set onsuccess(fn) {
            fn();
          },
          set onerror(fn) {},
        };
      },
      delete(key) {
        delete store[key];
        return { set onsuccess(fn) {}, set onerror(fn) {} };
      },
    };
  };

  const mockTransaction = (storeName, mode) => {
    const os = mockObjectStore(storeName);
    return {
      objectStore: () => os,
      set oncomplete(fn) {
        fn();
      },
      set onerror(fn) {},
    };
  };

  const mockDb = {
    transaction: mockTransaction,
    close: vi.fn(),
    objectStoreNames: { contains: () => true },
    createObjectStore: vi.fn(),
  };

  globalThis.indexedDB = {
    open: () => {
      const req = { result: mockDb };
      return {
        get result() {
          return req.result;
        },
        set onupgradeneeded(fn) {},
        set onsuccess(fn) {
          fn();
        },
        set onerror(fn) {},
      };
    },
  };

  return { stores, mockDb };
}

describe("idb-cache", () => {
  beforeEach(() => {
    createMockIDB();
  });

  it("returns null on cache miss", async () => {
    const result = await loadFromCache("nonexistent");
    expect(result).toBeNull();
  });

  it("saves and loads a buffer with etag", async () => {
    const buffer = new ArrayBuffer(8);
    await saveToCache("test-key", buffer, '"abc123"');

    const result = await loadFromCache("test-key");
    expect(result).not.toBeNull();
    expect(result.buffer).toBe(buffer);
    expect(result.etag).toBe('"abc123"');
  });

  it("saves with null etag", async () => {
    const buffer = new ArrayBuffer(4);
    await saveToCache("test-key", buffer, null);

    const result = await loadFromCache("test-key");
    expect(result).not.toBeNull();
    expect(result.etag).toBeNull();
  });

  it("clears a cached entry", async () => {
    const buffer = new ArrayBuffer(4);
    await saveToCache("to-clear", buffer, '"etag"');
    await clearCache("to-clear");

    const result = await loadFromCache("to-clear");
    expect(result).toBeNull();
  });

  it("overwrites existing cache entry", async () => {
    const buf1 = new ArrayBuffer(4);
    const buf2 = new ArrayBuffer(8);
    await saveToCache("key", buf1, '"v1"');
    await saveToCache("key", buf2, '"v2"');

    const result = await loadFromCache("key");
    expect(result.buffer).toBe(buf2);
    expect(result.etag).toBe('"v2"');
  });

  it("rejects on openDB error", async () => {
    const openError = new Error("open fail");
    globalThis.indexedDB = {
      open: () => ({
        get result() {
          return null;
        },
        set onupgradeneeded(_fn) {},
        set onsuccess(_fn) {},
        set onerror(fn) {
          fn();
        },
        get error() {
          return openError;
        },
      }),
    };

    await expect(saveToCache("key", new ArrayBuffer(4), "etag")).rejects.toBe(
      openError,
    );
    await expect(loadFromCache("key")).rejects.toBe(openError);
    await expect(clearCache("key")).rejects.toBe(openError);
  });

  it("creates object store on upgrade", async () => {
    const createObjectStore = vi.fn();
    const mockDb = {
      transaction: (name) => ({
        objectStore: () => ({
          put() {
            return {};
          },
        }),
        set oncomplete(fn) {
          fn();
        },
        set onerror(_fn) {},
      }),
      close: vi.fn(),
      objectStoreNames: { contains: () => false },
      createObjectStore,
    };
    globalThis.indexedDB = {
      open: () => ({
        get result() {
          return mockDb;
        },
        set onupgradeneeded(fn) {
          fn();
        },
        set onsuccess(fn) {
          fn();
        },
        set onerror(_fn) {},
      }),
    };

    await saveToCache("key", new ArrayBuffer(4), "etag");
    expect(createObjectStore).toHaveBeenCalledWith("db-files");
  });

  it("rejects on saveToCache transaction error", async () => {
    const txError = new Error("tx write fail");
    const mockDb = {
      transaction: () => ({
        objectStore: () => ({
          put() {
            return {};
          },
        }),
        set oncomplete(_fn) {},
        set onerror(fn) {
          fn();
        },
        get error() {
          return txError;
        },
      }),
      close: vi.fn(),
      objectStoreNames: { contains: () => true },
    };
    globalThis.indexedDB = {
      open: () => ({
        get result() {
          return mockDb;
        },
        set onupgradeneeded(_fn) {},
        set onsuccess(fn) {
          fn();
        },
        set onerror(_fn) {},
      }),
    };

    await expect(saveToCache("key", new ArrayBuffer(4), "etag")).rejects.toBe(
      txError,
    );
  });

  it("rejects on loadFromCache request error", async () => {
    const reqError = new Error("req read fail");
    const mockDb = {
      transaction: () => ({
        objectStore: () => ({
          get() {
            return {
              get result() {
                return undefined;
              },
              set onsuccess(_fn) {},
              set onerror(fn) {
                fn();
              },
              get error() {
                return reqError;
              },
            };
          },
        }),
        set oncomplete(_fn) {},
        set onerror(_fn) {},
      }),
      close: vi.fn(),
      objectStoreNames: { contains: () => true },
    };
    globalThis.indexedDB = {
      open: () => ({
        get result() {
          return mockDb;
        },
        set onupgradeneeded(_fn) {},
        set onsuccess(fn) {
          fn();
        },
        set onerror(_fn) {},
      }),
    };

    await expect(loadFromCache("key")).rejects.toBe(reqError);
  });

  it("rejects on clearCache transaction error", async () => {
    const txError = new Error("tx clear fail");
    const mockDb = {
      transaction: () => ({
        objectStore: () => ({
          delete() {
            return {};
          },
        }),
        set oncomplete(_fn) {},
        set onerror(fn) {
          fn();
        },
        get error() {
          return txError;
        },
      }),
      close: vi.fn(),
      objectStoreNames: { contains: () => true },
    };
    globalThis.indexedDB = {
      open: () => ({
        get result() {
          return mockDb;
        },
        set onupgradeneeded(_fn) {},
        set onsuccess(fn) {
          fn();
        },
        set onerror(_fn) {},
      }),
    };

    await expect(clearCache("key")).rejects.toBe(txError);
  });

  it("handles multiple keys independently", async () => {
    const buf1 = new ArrayBuffer(4);
    const buf2 = new ArrayBuffer(8);
    await saveToCache("core", buf1, '"e1"');
    await saveToCache("detail", buf2, '"e2"');

    const r1 = await loadFromCache("core");
    const r2 = await loadFromCache("detail");
    expect(r1.buffer).toBe(buf1);
    expect(r2.buffer).toBe(buf2);
  });
});
