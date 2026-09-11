/**
 * Tenant authentication isolation gate.
 *
 * Runs on every authenticated load. It asks the server to authorize the
 * current session for the tenant named by the hostname. On a teacher platform
 * this fails for any account that was created on Modrek Plus (or on another
 * teacher platform), and the session is terminated immediately — no data, no
 * membership, no auto-link.
 *
 * Availability contract (root cause of the endless-spinner bug):
 *  - On the official Modrek Plus host, activation is advisory only, so it runs
 *    in the background and NEVER gates rendering.
 *  - On a teacher platform, activation must succeed before rendering, but it is
 *    time-boxed and retried; a failure shows an explicit retry screen instead
 *    of an infinite spinner.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { usePlatform } from "@/hooks/usePlatform";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withSupabaseTimeout } from "@/lib/supabaseQueryTimeout";
import {
  activateTenantSession,
  currentTenantSlug,
  isOfficialTenantHost,
  TENANT_DENY_MESSAGE_AR,
  type TenantDenyReason,
} from "@/lib/tenant";

const ACTIVATION_TIMEOUT_MS = 8000;
const ACTIVATION_ATTEMPTS = 2;

export default function TenantSessionGate({ children }: { children: React.ReactNode }) {
  const { user, isHydrated, signOut } = useAuth();
  const { platform } = usePlatform();
  const queryClient = useQueryClient();
  const slug = currentTenantSlug();
  const official = isOfficialTenantHost();
  const [denied, setDenied] = useState<TenantDenyReason | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const activatedFor = useRef<string | null>(null);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    activatedFor.current = null;
    setUnavailable(false);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (!user) {
      activatedFor.current = null;
      setReadyFor(null);
      setDenied(null);
      setUnavailable(false);
      return;
    }
    const token = `${user.id}::${slug}`;
    if (activatedFor.current === token) return;
    activatedFor.current = token;

    let cancelled = false;
    (async () => {
      let lastError: unknown = null;

      for (let tries = 0; tries < ACTIVATION_ATTEMPTS; tries += 1) {
        try {
          const result = await withSupabaseTimeout(
            activateTenantSession(slug),
            "جلسة المنصة",
            ACTIVATION_TIMEOUT_MS,
          );
          if (cancelled) return;

          if (result.ok === true) {
            setDenied(null);
            setUnavailable(false);
            setReadyFor(token);
            return;
          }

          const reason = (result as { ok: false; reason: TenantDenyReason }).reason;
          // The official platform must never regress: an activation hiccup there
          // is logged, not enforced. Teacher tenants are strict.
          if (official) {
            console.warn("[tenant] official activation failed:", reason);
            setReadyFor(token);
            return;
          }
          setDenied(reason);
          queryClient.clear();
          try {
            await signOut();
          } catch {
            /* ignore */
          }
          return;
        } catch (error) {
          // Network/timeout failure — not an authorization decision. Retry once
          // before giving the user a visible, actionable state.
          lastError = error;
          if (cancelled) return;
          if (tries + 1 < ACTIVATION_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, 700));
          }
        }
      }

      if (cancelled) return;
      console.error("[tenant] activation unavailable", lastError);
      if (official) {
        // Official host: activation is advisory, so never block the platform.
        setReadyFor(token);
        return;
      }
      setUnavailable(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, slug, isHydrated, official, queryClient, signOut, attempt]);

  if (denied) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center p-6 bg-background"
      >
        <div className="max-w-md w-full rounded-2xl border bg-card p-6 text-center space-y-4 shadow-sm">
          <h1 className="text-xl font-bold text-foreground">
            {platform?.name || slug}
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            {TENANT_DENY_MESSAGE_AR[denied]}
          </p>
          <p className="text-xs text-muted-foreground">
            حسابات مدرك Plus وحسابات المنصات الأخرى لا تعمل على هذه المنصة.
          </p>
          <Button
            className="w-full"
            onClick={() => {
              setDenied(null);
              activatedFor.current = null;
              window.location.assign("/auth");
            }}
          >
            إنشاء حساب على هذه المنصة
          </Button>
        </div>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full rounded-2xl border bg-card p-6 text-center space-y-4 shadow-sm">
          <h1 className="text-lg font-bold text-foreground">تعذر الاتصال بالمنصة</h1>
          <p className="text-muted-foreground leading-relaxed text-sm">
            لم نستطع تجهيز جلستك على هذه المنصة الآن. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.
          </p>
          <Button className="w-full" onClick={retry}>
            <RefreshCw className="h-4 w-4 ml-2" />
            إعادة المحاولة
          </Button>
        </div>
      </div>
    );
  }

  // Official Modrek Plus renders immediately; only teacher platforms wait for a
  // server-side authorization decision.
  const activeToken = user && !official ? `${user.id}::${slug}` : null;
  if (activeToken && readyFor !== activeToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" aria-label="جاري تأمين جلسة المنصة">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
