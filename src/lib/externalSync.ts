import { supabase } from "@/integrations/supabase/client";

type SyncScope = "auth" | "tables" | "rls";

const pendingScopes = new Set<SyncScope>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let inflightPromise: Promise<void> | null = null;

async function callExternalSync(scope: SyncScope) {
  const [{ data: sessionData }, url, anonKey] = await Promise.all([
    supabase.auth.getSession(),
    Promise.resolve(import.meta.env.VITE_SUPABASE_URL as string | undefined),
    Promise.resolve(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined),
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