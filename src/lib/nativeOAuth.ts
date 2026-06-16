/**
 * Native (Capacitor) Google Sign-In — REAL native flow.
 *
 * Uses @codetrix-studio/capacitor-google-auth which wraps the official
 * Google Identity (Credential Manager / Google Sign-In SDK) on Android
 * and the native Google Sign-In on iOS. The user NEVER leaves the app —
 * no Chrome, no Custom Tabs, no system browser.
 *
 * Flow:
 *   1. GoogleAuth.signIn()  → returns Google idToken in-app
 *   2. supabase.auth.signInWithIdToken({ provider:'google', token })
 *      → exchanges idToken for a Supabase session
 *   3. We return { access_token, refresh_token } so the caller can do
 *      supabase.auth.setSession(tokens) (compatible with existing useAuth).
 *
 * The web fallback is kept ONLY for non-native runtimes (browser preview)
 * — it still uses the supabase OAuth redirect.
 */

import { supabase } from "@/integrations/supabase/client";

type Provider = "google" | "apple" | "azure";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type Tokens = { access_token: string; refresh_token: string };

type Result =
  | { tokens: Tokens; error: null }
  | { tokens?: undefined; error: Error };

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * REAL native Google sign-in. Opens the system account picker UI provided
 * by Google Play Services directly inside the app — no WebView, no browser.
 */
async function signInWithGoogleNative(): Promise<Result> {
  try {
    // Dynamic import so web bundles don't try to resolve the native module
    const mod: any = await import("@codetrix-studio/capacitor-google-auth");
    const GoogleAuth = mod.GoogleAuth;

    if (!GoogleAuth) {
      return { error: new Error("إضافة Google Auth غير مثبتة في التطبيق") };
    }

    // initialize() is required on web; on Android/iOS it reads config from
    // capacitor.config.ts (plugins.GoogleAuth.serverClientId). Calling it
    // is safe and idempotent.
    try {
      await GoogleAuth.initialize?.({
        scopes: ["profile", "email", "openid"],
        grantOfflineAccess: true,
      });
    } catch (initErr) {
      // initialize is sometimes optional on native — log and continue
      console.warn("GoogleAuth.initialize warning", initErr);
    }

    const googleUser = await GoogleAuth.signIn();
    const idToken: string | undefined =
      googleUser?.authentication?.idToken || googleUser?.idToken;

    if (!idToken) {
      return { error: new Error("تعذر الحصول على رمز Google") };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    });

    if (error || !data?.session) {
      return {
        error: error ?? new Error("تعذر إنشاء جلسة Supabase من رمز Google"),
      };
    }

    return {
      tokens: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
      error: null,
    };
  } catch (e: any) {
    const msg = String(e?.message || e || "");
    // Normalize common cancellation messages
    if (/cancel|user.?cancel|12501|popup_closed/i.test(msg)) {
      return { error: new Error("تم إلغاء تسجيل الدخول") };
    }
    return { error: e instanceof Error ? e : new Error(msg || "فشل تسجيل الدخول") };
  }
}

export async function signInWithOAuthNative(
  provider: Provider,
  opts?: SignInOptions,
): Promise<Result> {
  // True native path — Google only for now (matches user requirement)
  if (provider === "google" && (await isNative())) {
    return signInWithGoogleNative();
  }

  // Web/preview fallback: standard supabase OAuth redirect
  const callbackUrl =
    opts?.redirect_uri ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : "https://modrekplus.com/auth/callback");

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl,
      queryParams: {
        prompt: "select_account",
        ...(opts?.extraParams || {}),
      },
    },
  });

  if (error) return { error };
  // Browser will redirect; this promise effectively never resolves with tokens.
  return { error: new Error("في انتظار إعادة التوجيه من Google") };
}
