// Wave-4 Cache Guard
// -----------------------------------------------------------------------------
// React Query cache is persisted to localStorage via
// @tanstack/query-sync-storage-persister. localStorage only stores strings, so
// values are JSON.stringify'd on write and JSON.parse'd on read. Any value that
// does NOT survive that round trip becomes silently corrupted:
//
//   - Map      -> serializes to "{}", loses .get/.set/.has -> ".get is not a function"
//   - Set      -> serializes to "{}", loses .has/.size     -> ".has is not a function"
//   - Date     -> serializes to ISO string, loses .getTime -> ".getTime is not a function"
//   - File/Blob-> serializes to "{}", unusable
//   - class instances -> lose their prototype/methods
//
// This causes the SAME bundle to render differently between fresh loads (Web on
// a new browser) vs returning loads (PWA/Android that already have a cache).
// This is the #1 source of Web vs Mobile data drift.
//
// isJsonSafe() returns false if the value contains any non-plain, non-primitive
// data anywhere in its tree, so those queries are NEVER written to localStorage.
// They still run normally in memory; only persistence is skipped.
//
// See src/App.tsx -> dehydrateOptions.shouldDehydrateQuery.

const MAX_DEPTH = 8;

export function isJsonSafe(value: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH) return true; // trust deep-nested primitives

  if (value === null || value === undefined) return true;

  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (t === "function" || t === "symbol" || t === "bigint") return false;

  if (t !== "object") return false;

  // Reject any typed non-plain object that loses semantics through JSON.
  if (value instanceof Map) return false;
  if (value instanceof Set) return false;
  if (value instanceof Date) return false;
  if (typeof File !== "undefined" && value instanceof File) return false;
  if (typeof Blob !== "undefined" && value instanceof Blob) return false;
  if (typeof FormData !== "undefined" && value instanceof FormData) return false;
  if (typeof ArrayBuffer !== "undefined" && (value instanceof ArrayBuffer || ArrayBuffer.isView(value as any))) return false;
  if (value instanceof Error) return false;
  if (value instanceof RegExp) return false;
  if (value instanceof Promise) return false;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isJsonSafe(item, depth + 1)) return false;
    }
    return true;
  }

  // Only plain objects survive JSON.stringify + JSON.parse cleanly.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;

  for (const key of Object.keys(value as object)) {
    if (!isJsonSafe((value as any)[key], depth + 1)) return false;
  }
  return true;
}

/**
 * Query-key patterns that must NEVER be persisted, independent of their data
 * shape. These are either auth-sensitive or must always be fresh from the
 * server so Web and Mobile stay in perfect sync.
 */
const NEVER_PERSIST_PATTERNS: RegExp[] = [
  /auth|session|user-session|token|secret|jwt/i,
  // Wallet / earnings / withdrawals must always be live (Web = Mobile).
  /wallet|earning|withdrawal|deposit|commission|balance/i,
  // Subscriptions / purchases / group purchases must be live.
  /subscription|purchase|paywall|access-tier/i,
  // Notifications counters must be live.
  /notification|unread|inbox/i,
  // Realtime-driven exam attempts / messages must be live.
  /attempt|exam-answer|exam-review|live-session|support-message|teacher-message|ai-message/i,
  // Dev report screens are always live per project memory.
  /dev-student|dev-teacher|developer-/i,
];

export function shouldPersistQueryKey(queryKey: unknown): boolean {
  const key = JSON.stringify(queryKey ?? "");
  return !NEVER_PERSIST_PATTERNS.some((rx) => rx.test(key));
}
