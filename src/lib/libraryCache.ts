// Lightweight IndexedDB cache for the student library.
//
// Stores raw PDF blobs so re-opening a book is instant and offline-safe,
// plus rendered page JPEGs so navigation never re-runs pdf.js twice for the
// same page. Zero external dependencies — one small object store.

const DB_NAME = "modrek-library";
const DB_VERSION = 1;
const PDF_STORE = "pdf-blobs";
const PAGE_STORE = "page-images";
const COVER_STORE = "cover-images";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("no-indexeddb"));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PDF_STORE)) db.createObjectStore(PDF_STORE);
      if (!db.objectStoreNames.contains(PAGE_STORE)) db.createObjectStore(PAGE_STORE);
      if (!db.objectStoreNames.contains(COVER_STORE)) db.createObjectStore(COVER_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function txGet<T = unknown>(store: string, key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function txPut(store: string, key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* best-effort cache; ignore quota/private-mode failures */
  }
}

async function txDeletePrefix(store: string, prefix: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(store, "readwrite");
      const objStore = tx.objectStore(store);
      const req = objStore.openKeyCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) {
          objStore.delete(cursor.key);
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

export const libraryCache = {
  getPdf: (bookId: string) => txGet<Blob>(PDF_STORE, bookId),
  putPdf: (bookId: string, blob: Blob) => txPut(PDF_STORE, bookId, blob),
  getPage: (bookId: string, page: number) => txGet<string>(PAGE_STORE, `${bookId}:${page}`),
  putPage: (bookId: string, page: number, dataUrl: string) => txPut(PAGE_STORE, `${bookId}:${page}`, dataUrl),
  getCover: (bookId: string) => txGet<string>(COVER_STORE, bookId),
  putCover: (bookId: string, dataUrl: string) => txPut(COVER_STORE, bookId, dataUrl),
  evictBook: async (bookId: string) => {
    await Promise.all([
      txPut(PDF_STORE, bookId, undefined as unknown as Blob).catch(() => undefined),
      txDeletePrefix(PAGE_STORE, `${bookId}:`),
      txPut(COVER_STORE, bookId, undefined as unknown as string).catch(() => undefined),
    ]);
    // best-effort explicit deletes
    try {
      const db = await openDb();
      const tx = db.transaction([PDF_STORE, COVER_STORE], "readwrite");
      tx.objectStore(PDF_STORE).delete(bookId);
      tx.objectStore(COVER_STORE).delete(bookId);
    } catch {
      /* ignore */
    }
  },
};
