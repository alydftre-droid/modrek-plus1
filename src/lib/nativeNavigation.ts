const APP_HOSTS = new Set([
  "modrekplus.com",
  "www.modrekplus.com",
]);

export function isNativeRuntimeSync() {
  if (typeof window === "undefined") return false;

  try {
    const capacitor = (window as Window & {
      Capacitor?: { isNativePlatform?: () => boolean };
    }).Capacitor;

    if (capacitor?.isNativePlatform?.()) return true;
  } catch {
    // Continue with resilient runtime checks.
  }

  const isLocalNativeOrigin = window.location.protocol === "capacitor:"
    || window.location.hostname === "localhost";
  const isMobileWebView = /Android|iPhone|iPad|; wv\)/i.test(navigator.userAgent || "");

  return document.documentElement.getAttribute("data-native-app") === "true"
    || (isLocalNativeOrigin && isMobileWebView);
}

export function getInternalAppPath(url: string) {
  if (typeof window === "undefined" || !url) return null;

  try {
    if (url.startsWith("/")) return url;

    const parsed = new URL(url, window.location.origin);
    const currentHost = window.location.hostname;
    const isSameOrigin = parsed.origin === window.location.origin;
    const isKnownAppHost = APP_HOSTS.has(parsed.hostname) || parsed.hostname === currentHost;

    if (!isSameOrigin && !isKnownAppHost) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function navigateInternalAppUrl(url: string) {
  const path = getInternalAppPath(url);
  if (!path || typeof window === "undefined") return false;

  window.history.pushState(window.history.state, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  return true;
}

export function openUrlWithinAppContainer(url: string) {
  if (!url || typeof window === "undefined") return;
  if (navigateInternalAppUrl(url)) return;

  if (isNativeRuntimeSync()) {
    window.location.href = url;
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}