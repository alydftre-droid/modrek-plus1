import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  finalizeGoogleOAuthAttempt,
  parseGoogleOAuthCallbackUrl,
  recordGoogleOAuthEvent,
} from "@/lib/googleOAuthDiagnostics";
import { withSupabaseTimeout } from "@/lib/supabaseQueryTimeout";

const POST_OAUTH_REDIRECT_KEY = "post_oauth_redirect";
const SUPABASE_STORAGE_KEY_PREFIX = "sb-";

let inFlightOAuthProcessing: Promise<OAuthProcessResult> | null = null;

const logOAuthProcess = (message: string, details?: Record<string, unknown>) => {
  console.info(`[oauth-process] ${message}`, details || {});
};

const readSupabasePersistedSessionKeys = () => {
  if (typeof window === "undefined") return [] as string[];

  return Object.keys(window.localStorage).filter((key) => key.startsWith(SUPABASE_STORAGE_KEY_PREFIX));
};

const cleanOAuthCallbackUrl = () => {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const hadSensitiveParams = [
    "code",
    "access_token",
    "refresh_token",
    "expires_at",
    "expires_in",
    "provider_token",
    "provider_refresh_token",
    "token_type",
    "type",
    "error",
    "error_description",
  ].some((key) => url.searchParams.has(key));

  const hadHash = Boolean(url.hash);
  if (!hadSensitiveParams && !hadHash) return;

  [
    "code",
    "access_token",
    "refresh_token",
    "expires_at",
    "expires_in",
    "provider_token",
    "provider_refresh_token",
    "token_type",
    "type",
    "error",
    "error_description",
  ].forEach((key) => url.searchParams.delete(key));

  url.hash = "";
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
};

export type OAuthProcessResult = {
  handled: boolean;
  session: Session | null;
  error: string | null;
};

export async function processSupabaseOAuthCallback(source: string, callbackUrl?: string): Promise<OAuthProcessResult> {
  if (inFlightOAuthProcessing) {
    return inFlightOAuthProcessing;
  }

  const snapshot = parseGoogleOAuthCallbackUrl(callbackUrl);
  const hasHashTokens = Boolean(snapshot.accessToken && snapshot.refreshToken);
  const hasCode = Boolean(snapshot.code);
  const hasCallbackError = Boolean(snapshot.error || snapshot.errorDescription);

  if (!snapshot.isGoogleReturn || (!hasHashTokens && !hasCode && !hasCallbackError)) {
    return { handled: false, session: null, error: null };
  }

  inFlightOAuthProcessing = (async () => {
    logOAuthProcess("callback_detected", {
      source,
      pathname: snapshot.pathname,
      hasHashTokens,
      hasCode,
      correlationId: snapshot.correlationId ?? null,
      fromAppUrlOpen: Boolean(callbackUrl),
    });

    if (hasCallbackError) {
      const errorMessage = snapshot.errorDescription || snapshot.error || "تعذر إكمال تسجيل الدخول";
      cleanOAuthCallbackUrl();
      finalizeGoogleOAuthAttempt({
        correlationId: snapshot.correlationId,
        source,
        type: "callback_error_detected",
        status: "failed",
        error: errorMessage,
      });
      logOAuthProcess("callback_error", {
        source,
        error: errorMessage,
      });
      return { handled: true, session: null, error: errorMessage };
    }

    recordGoogleOAuthEvent({
      correlationId: snapshot.correlationId,
      source,
      type: hasHashTokens ? "hash_tokens_detected" : "code_detected",
      status: "callback",
      details: {
        pathname: snapshot.pathname,
        has_access_token: hasHashTokens,
        has_refresh_token: hasHashTokens,
        has_code: hasCode,
      },
    });

    let sessionResult;
    try {
      sessionResult = await withSupabaseTimeout(
        hasHashTokens
          ? supabase.auth.setSession({
              access_token: snapshot.accessToken!,
              refresh_token: snapshot.refreshToken!,
            })
          : supabase.auth.exchangeCodeForSession(snapshot.code!),
        "تسجيل الدخول بواسطة Google",
        20000,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إكمال تسجيل الدخول بواسطة Google";
      finalizeGoogleOAuthAttempt({
        correlationId: snapshot.correlationId,
        source,
        type: "callback_timeout",
        status: "failed",
        error: message,
      });
      return { handled: true, session: null, error: message };
    }

    const sessionError = sessionResult.error;
    if (sessionError) {
      cleanOAuthCallbackUrl();
      finalizeGoogleOAuthAttempt({
        correlationId: snapshot.correlationId,
        source,
        type: hasHashTokens ? "hash_session_failed" : "code_exchange_failed",
        status: "failed",
        error: sessionError.message,
      });
      logOAuthProcess("session_creation_failed", {
        source,
        error: sessionError.message,
      });
      return { handled: true, session: null, error: sessionError.message };
    }

    const confirmedSession = sessionResult.data.session ?? (await supabase.auth.getSession()).data.session ?? null;
    const persistedSessionKeys = readSupabasePersistedSessionKeys();

    // Post-login destination is resolved from the user's role by the router
    // (see src/pages/Index.tsx). No email-based or hardcoded destination here.

    cleanOAuthCallbackUrl();
    finalizeGoogleOAuthAttempt({
      correlationId: snapshot.correlationId,
      source,
      type: hasHashTokens ? "hash_session_created" : "code_session_created",
      status: confirmedSession?.user ? "success" : "failed",
      details: {
        user_id: confirmedSession?.user?.id,
        has_session: Boolean(confirmedSession),
      },
      error: confirmedSession ? undefined : "لم يتم إنشاء جلسة تسجيل دخول صالحة",
    });
    logOAuthProcess("session_creation_completed", {
      source,
      hasSession: Boolean(confirmedSession),
      userId: confirmedSession?.user?.id ?? null,
      persistedSessionKeys,
      sessionStorageHasRedirect:
        typeof window !== "undefined" ? Boolean(window.sessionStorage.getItem(POST_OAUTH_REDIRECT_KEY)) : false,
    });

    return {
      handled: true,
      session: confirmedSession,
      error: confirmedSession ? null : "لم يتم إنشاء جلسة تسجيل دخول صالحة",
    };
  })();

  try {
    return await inFlightOAuthProcessing;
  } finally {
    inFlightOAuthProcessing = null;
  }
}
