import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const logAuthCallback = (message: string, details?: Record<string, unknown>) => {
  console.info(`[auth-callback] ${message}`, details || {});
};

/**
 * Dedicated OAuth callback handler.
 * Supports both Supabase auth flows:
 *  - PKCE: ?code=...    → exchangeCodeForSession
 *  - Implicit: #access_token=...&refresh_token=...  → setSession
 * Then redirects to "/" and lets the app router resolve the destination.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const finish = (path: string) => {
      if (cancelled) return;
      // Clean URL before navigating to avoid re-processing the hash/code
      try {
        window.history.replaceState(window.history.state, "", window.location.pathname);
      } catch {}
      navigate(path, { replace: true });
    };

    (async () => {
      try {
        const href = window.location.href;
        const url = new URL(href);
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(hash);

        logAuthCallback("callback_started", {
          pathname: url.pathname,
          search: url.search,
          hasHash: Boolean(window.location.hash),
        });

        const hashError = hashParams.get("error_description") || hashParams.get("error");
        const queryError = url.searchParams.get("error_description") || url.searchParams.get("error");
        if (hashError || queryError) {
          logAuthCallback("callback_error_detected", { error: hashError || queryError });
          setError(hashError || queryError);
          setTimeout(() => finish("/auth"), 1500);
          return;
        }

        // 1) Implicit flow: hash contains tokens
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          logAuthCallback("implicit_tokens_detected", {
            hasAccessToken: true,
            hasRefreshToken: true,
          });
          const { error: setErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setErr) throw setErr;
          const { data: afterSetSession } = await supabase.auth.getSession();
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem("post_oauth_redirect", "/dashboard");
          }
          logAuthCallback("session_created_from_hash", {
            redirectTo: "/dashboard",
            userId: afterSetSession.session?.user?.id ?? null,
          });
          finish("/dashboard");
          return;
        }

        // 2) PKCE flow: ?code=...
        const code = url.searchParams.get("code");
        if (code) {
          logAuthCallback("pkce_code_detected", { hasCode: true });
          const { data: exchanged, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) throw exErr;
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem("post_oauth_redirect", "/dashboard");
          }
          logAuthCallback("session_created_from_code", {
            redirectTo: "/dashboard",
            userId: exchanged.session?.user?.id ?? null,
          });
          finish("/dashboard");
          return;
        }

        // 3) No tokens — maybe session already established (refresh, page revisit)
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          logAuthCallback("existing_session_detected", {
            userId: data.session.user?.id ?? null,
            redirectTo: "/dashboard",
          });
          finish("/dashboard");
          return;
        }

        // Nothing to process
        logAuthCallback("no_session_and_no_tokens_redirecting_to_auth");
        finish("/auth");
      } catch (e: any) {
        console.error("Auth callback error:", e);
        logAuthCallback("callback_exception", {
          error: e?.message || "unknown_error",
        });
        if (!cancelled) {
          setError(e?.message || "تعذر إكمال تسجيل الدخول");
          setTimeout(() => finish("/auth"), 1800);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background" dir="rtl">
      <div className="flex flex-col items-center gap-4 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {error ? error : "جارٍ إكمال تسجيل الدخول..."}
        </p>
      </div>
    </div>
  );
}
