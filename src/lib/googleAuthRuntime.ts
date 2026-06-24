export const GOOGLE_AUTH_ANDROID_PACKAGE = "com.modrek.plus";
export const GOOGLE_AUTH_DEEP_LINK_SCHEME = GOOGLE_AUTH_ANDROID_PACKAGE;
export const GOOGLE_AUTH_DEEP_LINK_HOST = "oauth-callback";
export const GOOGLE_AUTH_NATIVE_REDIRECT_URI = `${GOOGLE_AUTH_DEEP_LINK_SCHEME}://${GOOGLE_AUTH_DEEP_LINK_HOST}`;

// Public OAuth client ID used by Google Credential Manager on Android. It is
// intentionally centralized here and verified by scripts/verify-google-auth-config.mjs
// against android/app/google-services.json before every Android release.
export const GOOGLE_AUTH_WEB_CLIENT_ID = (
  (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined)?.trim()
  || "233651659157-rt9khk04uo1enfpbmfs5b1c787q7jj5n.apps.googleusercontent.com"
);

export type GoogleAuthRuntimeHealth = {
  checkedAt: string;
  isNativeRuntime: boolean;
  packageName: string;
  redirectUri: string;
  webClientIdPresent: boolean;
  webClientIdLooksValid: boolean;
  socialLoginPluginAvailable: boolean;
  appPluginAvailable: boolean;
  canAttemptNative: boolean;
  errors: string[];
  warnings: string[];
};

const HEALTH_LOG_KEY = "google_auth_runtime_health_v1";
const CLIENT_ID_PATTERN = /^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i;

export function createGoogleOAuthRawNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashGoogleOAuthNonce(rawNonce: string) {
  const encoded = new TextEncoder().encode(rawNonce);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createGoogleOAuthNoncePair() {
  const rawNonce = createGoogleOAuthRawNonce();
  const nonceDigest = await hashGoogleOAuthNonce(rawNonce);
  return { rawNonce, nonceDigest };
}

export function isLikelyNativeGoogleAuthRuntime() {
  if (typeof window === "undefined") return false;

  try {
    const nativeWindow = window as Window & {
      Capacitor?: { isNativePlatform?: () => boolean };
    };
    if (nativeWindow.Capacitor?.isNativePlatform?.()) return true;
  } catch {
    // continue with fallback checks
  }

  const isLocalNativeOrigin = window.location.protocol === "capacitor:"
    || window.location.hostname === "localhost";
  const isMobileWebView = /Android|iPhone|iPad|; wv\)/i.test(navigator.userAgent || "");
  return document.documentElement.getAttribute("data-native-app") === "true"
    || (isLocalNativeOrigin && isMobileWebView);
}

export async function getGoogleAuthRuntimeHealth(): Promise<GoogleAuthRuntimeHealth> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const webClientIdPresent = Boolean(GOOGLE_AUTH_WEB_CLIENT_ID);
  const webClientIdLooksValid = CLIENT_ID_PATTERN.test(GOOGLE_AUTH_WEB_CLIENT_ID);
  const isNativeRuntime = isLikelyNativeGoogleAuthRuntime();

  let socialLoginPluginAvailable = false;
  let appPluginAvailable = false;

  if (!webClientIdPresent) {
    errors.push("GOOGLE_AUTH_WEB_CLIENT_ID_MISSING");
  } else if (!webClientIdLooksValid) {
    errors.push("GOOGLE_AUTH_WEB_CLIENT_ID_INVALID_FORMAT");
  }

  if (GOOGLE_AUTH_ANDROID_PACKAGE !== "com.modrek.plus") {
    errors.push("ANDROID_PACKAGE_NAME_MISMATCH");
  }

  if (GOOGLE_AUTH_NATIVE_REDIRECT_URI !== "com.modrek.plus://oauth-callback") {
    errors.push("ANDROID_DEEP_LINK_REDIRECT_MISMATCH");
  }

  try {
    const { Capacitor } = await import("@capacitor/core");
    socialLoginPluginAvailable = Capacitor.isPluginAvailable("SocialLogin");
    appPluginAvailable = Capacitor.isPluginAvailable("App");
  } catch (error) {
    warnings.push(`CAPACITOR_RUNTIME_UNAVAILABLE:${error instanceof Error ? error.message : String(error)}`);
  }

  if (isNativeRuntime && !socialLoginPluginAvailable) errors.push("SOCIAL_LOGIN_PLUGIN_NOT_AVAILABLE");
  if (isNativeRuntime && !appPluginAvailable) warnings.push("APP_PLUGIN_NOT_AVAILABLE_FOR_NATIVE_LIFECYCLE_EVENTS");

  warnings.push("SHA_FINGERPRINTS_AND_GOOGLE_OAUTH_CLIENTS_MUST_MATCH_THE_RELEASE_KEYSTORE_IN_GOOGLE_CLOUD");

  const canAttemptNative = isNativeRuntime
    && webClientIdPresent
    && webClientIdLooksValid
    && socialLoginPluginAvailable;

  return {
    checkedAt: new Date().toISOString(),
    isNativeRuntime,
    packageName: GOOGLE_AUTH_ANDROID_PACKAGE,
    redirectUri: GOOGLE_AUTH_NATIVE_REDIRECT_URI,
    webClientIdPresent,
    webClientIdLooksValid,
    socialLoginPluginAvailable,
    appPluginAvailable,
    canAttemptNative,
    errors,
    warnings,
  };
}

export function persistGoogleAuthRuntimeHealth(report: GoogleAuthRuntimeHealth) {
  if (typeof window === "undefined") return;

  try {
    const previous = JSON.parse(window.localStorage.getItem(HEALTH_LOG_KEY) || "[]");
    const list = Array.isArray(previous) ? previous : [];
    window.localStorage.setItem(HEALTH_LOG_KEY, JSON.stringify([report, ...list].slice(0, 20)));
  } catch {
    // Ignore local logging failures. Console logs still carry the health report.
  }
}

export function logGoogleAuthRuntimeHealth(report: GoogleAuthRuntimeHealth, source: string) {
  persistGoogleAuthRuntimeHealth(report);
  const level = report.errors.length ? "error" : "info";
  console[level](`[google-auth-health] ${source}`, report);
}

export function validateGoogleIdTokenForConfiguredClient(idToken: string, expectedNonceDigest?: string) {
  try {
    const [, payload] = idToken.split(".");
    if (!payload) return { ok: false, error: "GOOGLE_ID_TOKEN_PAYLOAD_MISSING" };

    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, "=");
    const parsed = JSON.parse(window.atob(paddedPayload));
    const audience = String(parsed.aud || "");
    const nonce = parsed.nonce ? String(parsed.nonce) : "";
    const expiresAt = Number(parsed.exp || 0);
    const now = Math.floor(Date.now() / 1000);

    if (audience !== GOOGLE_AUTH_WEB_CLIENT_ID) {
      return { ok: false, error: "GOOGLE_ID_TOKEN_AUDIENCE_MISMATCH" };
    }

    if (!expiresAt || expiresAt <= now) {
      return { ok: false, error: "GOOGLE_ID_TOKEN_EXPIRED" };
    }

    if (expectedNonceDigest && nonce && nonce !== expectedNonceDigest) {
      return { ok: false, error: "GOOGLE_ID_TOKEN_NONCE_MISMATCH" };
    }

    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}