import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { parseGoogleOAuthCallbackUrl } from "@/lib/googleOAuthDiagnostics";
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
  const { user, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const redirectedRef = useRef(false);

  useEffect(() => {
    const snapshot = parseGoogleOAuthCallbackUrl();

    logAuthCallback("callback_page_observed", {
      isLoading,
      hasUser: Boolean(user),
      pathname: typeof window !== "undefined" ? window.location.pathname : null,
      hasCode: Boolean(snapshot.code),
      hasAccessToken: Boolean(snapshot.accessToken),
      hasRefreshToken: Boolean(snapshot.refreshToken),
      error: snapshot.errorDescription || snapshot.error || null,
    });

    if (redirectedRef.current) return;

    if (snapshot.error || snapshot.errorDescription) {
      redirectedRef.current = true;
      setError(snapshot.errorDescription || snapshot.error || "تعذر إكمال تسجيل الدخول");
      window.setTimeout(() => navigate("/auth", { replace: true }), 1600);
      return;
    }

    if (isLoading) {
      return;
    }

    if (user) {
      redirectedRef.current = true;
      logAuthCallback("callback_session_ready", {
        userId: user.id,
        redirectTo: "/dashboard",
      });
      navigate("/dashboard", { replace: true });
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
      navigate("/auth", { replace: true });
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [isLoading, navigate, user]);

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
