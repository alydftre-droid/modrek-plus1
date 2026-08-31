export function pruneLegacySupabaseAuthStorage() {
  if (typeof window === "undefined") return;

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return;

  let currentProjectRef = "";
  try {
    currentProjectRef = new URL(url).hostname.split(".")[0] || "";
  } catch {
    return;
  }

  const prefixes = [`sb-${currentProjectRef}-`, `supabase.auth.token`];
  const keys = Object.keys(window.localStorage);

  keys.forEach((key) => {
    if (!key.startsWith("sb-")) return;
    if (prefixes.some((prefix) => key.startsWith(prefix))) return;
    window.localStorage.removeItem(key);
  });

  const legacyKeys = [
    "supabase.auth.token",
    "post_oauth_redirect",
    "google_oauth_debug_pending_v1",
  ];

  legacyKeys.forEach((key) => {
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {
      // ignore storage cleanup failures
    }
  });
}

export function enforceCanonicalRuntimeOrigin() {
  if (typeof window === "undefined") return;

  const isNativeApp = (() => {
    try {
      const capacitor = (window as Window & {
        Capacitor?: { isNativePlatform?: () => boolean };
      }).Capacitor;

      if (capacitor?.isNativePlatform?.()) return true;
      return document.documentElement.getAttribute("data-native-app") === "true";
    } catch {
      return false;
    }
  })();

  // CRITICAL: Native apps must NEVER redirect to the public website.
  // The Android/iOS shells run on capacitor://localhost or https://localhost
  // (depending on androidScheme) and load bundled assets locally. Redirecting
  // to https://modrekplus.com causes Capacitor to hand the URL off to the
  // system browser (Chrome) because modrekplus.com isn't in allowNavigation,
  // which makes the app look like a web browser instead of a native app.
  if (isNativeApp) return;

  const expectedOrigin = "https://modrekplus.com";
  if (window.location.origin === expectedOrigin) return;

  // Teacher platforms live on subdomains of the canonical domain
  // (e.g. https://ahmed.modrekplus.com). They are first-class tenants and must
  // NOT be redirected back to the root domain.
  if (/^https:\/\/[a-z0-9-]+\.modrekplus\.com$/.test(window.location.origin)) return;

  // Web-only canonical enforcement: never redirect from localhost/capacitor
  // (covers dev and any embedded webview contexts).
  const origin = window.location.origin;
  if (
    origin.startsWith("capacitor://") ||
    origin.startsWith("http://localhost") ||
    origin.startsWith("https://localhost")
  ) {
    return;
  }

  const nextUrl = `${expectedOrigin}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(nextUrl);
}
