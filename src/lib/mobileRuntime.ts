import { Capacitor } from "@capacitor/core";

const NATIVE_LAST_ROUTE_KEY = "native-last-route";
const NATIVE_DRAFT_PREFIX = "native-draft:";

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function rememberLastRoute(path: string) {
  // Route restoration was disabled for Android stability: after a full app
  // close the app must always open at "/" instead of reviving a stale page.
  if (!isNativeApp() || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(NATIVE_LAST_ROUTE_KEY);
  } catch {
    // ignore storage failures
  }
}

export function getRememberedRoute() {
  if (!isNativeApp() || typeof window === "undefined") return null;
  try {
    window.localStorage.removeItem(NATIVE_LAST_ROUTE_KEY);
    return null;
  } catch {
    return null;
  }
}

export function saveDraftValue(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${NATIVE_DRAFT_PREFIX}${key}`, value);
  } catch {
    // ignore storage failures
  }
}

export function loadDraftValue(key: string) {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(`${NATIVE_DRAFT_PREFIX}${key}`) || "";
  } catch {
    return "";
  }
}

export function clearDraftValue(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${NATIVE_DRAFT_PREFIX}${key}`);
  } catch {
    // ignore storage failures
  }
}