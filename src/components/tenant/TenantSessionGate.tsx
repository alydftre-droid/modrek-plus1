/**
 * Tenant authentication isolation gate.
 *
 * Runs on every authenticated load. It asks the server to authorize the
 * current session for the tenant named by the hostname. On a teacher platform
 * this fails for any account that was created on Modrek Plus (or on another
 * teacher platform), and the session is terminated immediately — no data, no
 * membership, no auto-link.
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { usePlatform } from "@/hooks/usePlatform";
import {
  activateTenantSession,
  currentTenantSlug,
  isOfficialTenantHost,
  TENANT_DENY_MESSAGE_AR,
  type TenantDenyReason,
} from "@/lib/tenant";

export default function TenantSessionGate({ children }: { children: React.ReactNode }) {
  const { user, isHydrated, signOut } = useAuth();
  const { platform } = usePlatform();
  const queryClient = useQueryClient();
  const slug = currentTenantSlug();
  const official = isOfficialTenantHost();
  const [denied, setDenied] = useState<TenantDenyReason | null>(null);
  const activatedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isHydrated) return;
    if (!user) {
      activatedFor.current = null;
      setDenied(null);
      return;
    }
    const token = `${user.id}::${slug}`;
    if (activatedFor.current === token) return;
    activatedFor.current = token;

    let cancelled = false;
    (async () => {
      const result = await activateTenantSession(slug);
      if (cancelled) return;
      if (result.ok) {
        setDenied(null);
        return;
      }
      // The official platform must never regress: an activation hiccup there
      // is logged, not enforced. Teacher tenants are strict.
      if (official) {
        console.warn("[tenant] official activation failed:", result.reason);
        return;
      }
      setDenied(result.reason);
      queryClient.clear();
      try {
        await signOut();
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, slug, isHydrated, official, queryClient, signOut]);

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
          <button
            className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 font-semibold"
            onClick={() => {
              setDenied(null);
              activatedFor.current = null;
              window.location.assign("/auth");
            }}
          >
            إنشاء حساب على هذه المنصة
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
