import { Capacitor } from "@capacitor/core";

const NATIVE_LAST_ROUTE_KEY = "native-last-route";
const NATIVE_DRAFT_PREFIX = "native-draft:";

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function rememberLastRoute(path: string) {
  if (!isNativeApp() || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NATIVE_LAST_ROUTE_KEY, path);
  } catch {
    // ignore storage failures
  }
}

export function getRememberedRoute() {
  if (!isNativeApp() || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(NATIVE_LAST_ROUTE_KEY);
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