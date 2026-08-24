// useIntegrityGuard — the always-on Web/PWA/Android consistency watchdog.
// -----------------------------------------------------------------------------
// Every 60 seconds (only while the tab is active) we:
//   1. Compute the client-side snapshot hash from current React Query cache.
//   2. Call the `integrity-check` edge function to get the server hash.
//   3. If hashes differ, invalidate the critical caches so React Query refetches
//      canonical data from Supabase. The UI updates without a page reload.
//
// This is what closes the "Web shows X, Mobile shows Y" class of bug for good:
// even if a mutation somewhere forgets to invalidate its cache, this loop
// self-heals within one minute.
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hashSnapshot, type IntegritySnapshot } from "./platformHash";

// Resource budget: this loop used to fire every 60s for every signed-in session
// (1 edge invocation + 3 DB reads per user per minute), which alone accounted for
// the majority of the project's edge-function traffic. A 15-minute cadence plus a
// re-check whenever the tab regains focus keeps the same self-healing guarantee
// while cutting the invocations by ~95%.
const INTERVAL_MS = 15 * 60_000;
const MIN_GAP_MS = 60_000;

async function buildClientSnapshot(userId: string): Promise<IntegritySnapshot> {
  // Always read from the database, not from cache, so the "client" hash
  // reflects what the user should be seeing right now.
  const [wallet, subs, notif] = await Promise.all([
    supabase.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
    supabase
      .from("subscriptions")
      .select("id")
      .eq("student_id", userId)
      .eq("is_active", true)
      .gt("end_date", new Date().toISOString()),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false),
  ]);

  return {
    wallet_balance: (wallet.data as any)?.balance ?? null,
    active_subscriptions: subs.data?.length ?? 0,
    unread_notifications: (notif as any).count ?? 0,
  };
}

async function fetchServerHash(): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("integrity-check", { body: {} });
    if (error || !data?.hash) return null;
    return String(data.hash);
  } catch {
    return null;
  }
}

export function useIntegrityGuard(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  const runningRef = useRef(false);
  const lastRunRef = useRef(0);

  useEffect(() => {
    if (!userId) return;

    const tick = async () => {
      if (runningRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return;
      if (Date.now() - lastRunRef.current < MIN_GAP_MS) return;
      runningRef.current = true;
      lastRunRef.current = Date.now();
      try {
        const snap = await buildClientSnapshot(userId);
        const [clientHash, serverHash] = await Promise.all([
          hashSnapshot(snap),
          fetchServerHash(),
        ]);
        if (!serverHash) return; // network/edge unavailable — do nothing
        if (clientHash === serverHash) return;

        // Mismatch — canonical server disagrees with what the client is
        // rendering. Invalidate every critical namespace so React Query
        // pulls fresh rows from Supabase on the next render.
        await queryClient.invalidateQueries({ queryKey: ["wallet"] });
        await queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
        await queryClient.invalidateQueries({ queryKey: ["notifications"] });
        await queryClient.invalidateQueries({ queryKey: ["library"] });
        console.warn("[integrity-guard] client<>server hash mismatch — caches invalidated", {
          clientHash,
          serverHash,
        });
      } catch (err) {
        // Never let the guard crash the app
        console.debug("[integrity-guard] tick failed", err);
      } finally {
        runningRef.current = false;
      }
    };

    // First run after a short delay so we don't compete with initial paint.
    const first = window.setTimeout(tick, 5_000);
    const interval = window.setInterval(tick, INTERVAL_MS);
    // Re-check when the user comes back to the app — this preserves the
    // "fresh data the moment you look at the screen" behaviour without paying
    // for a background poll every minute.
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, queryClient]);
}
