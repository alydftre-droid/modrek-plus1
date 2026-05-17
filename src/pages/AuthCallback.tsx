import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getPendingGoogleOAuthAttempt, parseGoogleOAuthCallbackUrl } from "@/lib/googleOAuthDiagnostics";
import { processSupabaseOAuthCallback } from "@/lib/processSupabaseOAuthCallback";
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
  const { user, session, isLoading, isHydrated, isRoleResolved, isAuthReady } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const redirectedRef = useRef(false);
  const processedRef = useRef(false);
  const waitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const snapshot = parseGoogleOAuthCallbackUrl();

    logAuthCallback("callback_page_observed", {
      isLoading,
      isHydrated,
      isRoleResolved,
      isAuthReady,
      hasUser: Boolean(user),
      hasSession: Boolean(session),
      pathname: typeof window !== "undefined" ? window.location.pathname : null,
      hasCode: Boolean(snapshot.code),
      hasAccessToken: Boolean(snapshot.accessToken),
      hasRefreshToken: Boolean(snapshot.refreshToken),
      error: snapshot.errorDescription || snapshot.error || null,
      hasPendingAttempt: Boolean(getPendingGoogleOAuthAttempt()),
    });

    if (redirectedRef.current) return;

    if (!processedRef.current) {
      processedRef.current = true;
      void processSupabaseOAuthCallback("auth_callback_page").then((result) => {
        if (result.error) {
          setError(result.error);
        }
      });
    }

    if (waitTimerRef.current) {
      window.clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }

    if (!isAuthReady) {
      logAuthCallback("callback_waiting_for_auth_hydration", {
        isLoading,
        isHydrated,
        isRoleResolved,
        isAuthReady,
        hasUser: Boolean(user),
        hasSession: Boolean(session),
      });
      return;
    }

    if (user && session) {
      redirectedRef.current = true;
      logAuthCallback("callback_session_ready", {
        userId: user.id,
        redirectTo: "/dashboard",
        sessionStorageHasRedirect:
          typeof window !== "undefined" ? Boolean(window.sessionStorage.getItem("post_oauth_redirect")) : false,
      });
      navigate("/dashboard", { replace: true });
      return;
    }

    const hasTokensInUrl = Boolean(snapshot.code || snapshot.accessToken || snapshot.refreshToken);
    const hasPendingAttempt = Boolean(getPendingGoogleOAuthAttempt());

    if (hasTokensInUrl || hasPendingAttempt) {
      logAuthCallback("callback_auth_ready_but_waiting_for_session_commit", {
        hasTokensInUrl,
        hasPendingAttempt,
        isLoading,
        isHydrated,
        isRoleResolved,
        isAuthReady,
      });

      waitTimerRef.current = window.setTimeout(() => {
        if (redirectedRef.current) return;
        setError("تعذر تثبيت جلسة تسجيل الدخول بعد الرجوع من Google");
      }, 6000);

      return () => {
        if (waitTimerRef.current) {
          window.clearTimeout(waitTimerRef.current);
          waitTimerRef.current = null;
        }
      };
    }

    if (error && !hasPendingAttempt) {
      redirectedRef.current = true;
      window.setTimeout(() => navigate("/auth", { replace: true }), 1600);
      return;
    }

    if (!snapshot.code && !snapshot.accessToken && !snapshot.refreshToken) {
      redirectedRef.current = true;
      logAuthCallback("callback_missing_tokens_after_auth_ready", {
        redirectTo: "/auth",
      });
      navigate("/auth", { replace: true });
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (redirectedRef.current) return;
      redirectedRef.current = true;
      setError("تعذر استعادة جلسة تسجيل الدخول");
      logAuthCallback("callback_session_timeout", {
        redirectTo: "/auth",
      });
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [error, isAuthReady, isHydrated, isLoading, isRoleResolved, navigate, session, user]);

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
