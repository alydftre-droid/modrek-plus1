// Central cache-version buster.
// -----------------------------------------------------------------------------
// Bump DATA_SCHEMA_VERSION whenever any query-key shape, RPC contract, or
// persisted schema changes in a way that would make old cached rows
// incompatible with new client code. The next load will wipe the persisted
// React Query cache (`mp-rq-cache-v1`) and any stale storage buckets we own.
//
// This value is also the `buster` passed to PersistQueryClientProvider — see
// src/App.tsx.
export const DATA_SCHEMA_VERSION = "exam-submit-resilient-production-20260720-v5";

const BUSTER_STORAGE_KEY = "mp-data-schema-version";

/**
 * Runs synchronously on app boot. If the stored version differs from
 * DATA_SCHEMA_VERSION, wipe React-Query persisted cache and legacy caches
 * that we own. Never touches auth tokens, service-worker messaging caches,
 * or third-party (Firebase Messaging / OneSignal) caches.
 */
export function enforceDataSchemaVersion(): void {
  if (typeof window === "undefined") return;
  try {
    const stored = window.localStorage.getItem(BUSTER_STORAGE_KEY);
    if (stored === DATA_SCHEMA_VERSION) return;

    window.localStorage.removeItem("mp-rq-cache-v1");
    window.localStorage.removeItem("mp-rq-cache-v2");
    window.localStorage.removeItem("mp-rq-cache-v3");
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("exam-active-attempt-")) window.localStorage.removeItem(key);
    }
    window.localStorage.setItem(BUSTER_STORAGE_KEY, DATA_SCHEMA_VERSION);
  } catch {
    // storage unavailable — non-fatal
  }
}
