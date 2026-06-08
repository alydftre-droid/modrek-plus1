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
      return document.documentElement.getAttribute("data-native-app") === "true";
    } catch {
      return false;
    }
  })();

  if (!isNativeApp) return;

  const expectedOrigin = "https://modrekplus.com";
  if (window.location.origin === expectedOrigin) return;

  const nextUrl = `${expectedOrigin}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(nextUrl);
}