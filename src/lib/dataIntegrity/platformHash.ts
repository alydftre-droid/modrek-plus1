// Deterministic hash of a user's critical data snapshot.
// -----------------------------------------------------------------------------
// The same input MUST produce the same hash on Web, PWA and Android. That
// means:
//   - Keys are sorted alphabetically before serialization.
//   - Numbers are coerced to Number(x) to avoid "1" vs 1 drift.
//   - Booleans and nulls are preserved as-is.
//
// We hash a compact "snapshot" object built from the wallet balance, active
// subscription count, and unread notification count. The client asks the
// `integrity-check` edge function for the SAME snapshot computed server-side
// and compares hashes. Mismatch = client cache is stale → refetch everything.

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  const t = typeof value;
  if (t === "number") return Number.isFinite(value as number) ? String(value) : "null";
  if (t === "boolean" || t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
  }
  return "null";
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface IntegritySnapshot {
  wallet_balance: number | null;
  active_subscriptions: number;
  unread_notifications: number;
}

export async function hashSnapshot(snap: IntegritySnapshot): Promise<string> {
  return sha256Hex(stableStringify(snap));
}
