import { supabase } from "@/integrations/supabase/client";

type SyncScope = "auth" | "tables" | "rls";

// External-sync was a one-way mirror from the Lovable Cloud project to the
// production project. The app now runs directly on the production project,
// so the mirror is unnecessary. Calls fall back to the env-driven URL; if
// the function isn't deployed there, the request simply 404s and is ignored.
const CANONICAL_SYNC_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const CANONICAL_SYNC_SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string;

const pendingScopes = new Set<SyncScope>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let inflightPromise: Promise<void> | null = null;

async function callExternalSync(scope: SyncScope) {
  const [{ data: sessionData }, url, anonKey] = await Promise.all([
    supabase.auth.getSession(),
    Promise.resolve(CANONICAL_SYNC_SUPABASE_URL),
    Promise.resolve(CANONICAL_SYNC_SUPABASE_ANON),
  ]);

  if (!url || !anonKey) return;

  await fetch(`${url}/functions/v1/external-sync?only=${scope}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      ...(sessionData.session?.access_token ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {}),
    },
    body: JSON.stringify({ source: "client-sync", scope }),
  });
}

async function flushPendingScopes() {
  if (inflightPromise || pendingScopes.size === 0) return inflightPromise ?? Promise.resolve();

  const scopes = Array.from(pendingScopes);
  pendingScopes.clear();

  inflightPromise = (async () => {
    for (const scope of scopes) {
      try {
        await callExternalSync(scope);
      } catch (error) {
        console.warn("external sync request failed", { scope, error });
      }
    }
  })().finally(() => {
    inflightPromise = null;
    if (pendingScopes.size > 0) {
      queueExternalSync(Array.from(pendingScopes));
    }
  });

  return inflightPromise;
}

export function queueExternalSync(scopes: SyncScope[] = ["tables"], immediate = false) {
  scopes.forEach((scope) => pendingScopes.add(scope));

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (immediate) {
    void flushPendingScopes();
    return;
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPendingScopes();
  }, 1200);
}