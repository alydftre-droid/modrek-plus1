/**
 * Meta Pixel helper for ModrekPlus.
 * The base pixel script + init + first PageView live in index.html so the pixel
 * loads exactly once, before React mounts. This module only wraps `fbq` calls
 * so app code never touches the global directly.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const isNative = () =>
  typeof window !== "undefined" &&
  ((window as any).Capacitor?.isNativePlatform?.() === true);

export function isPixelReady(): boolean {
  return typeof window !== "undefined" && typeof window.fbq === "function" && !isNative();
}

/** Track a standard Meta event (PageView, CompleteRegistration, Lead, Purchase...). */
export function trackPixelEvent(event: string, params?: Record<string, unknown>): void {
  if (!isPixelReady()) return;
  try {
    window.fbq!("track", event, params);
  } catch (err) {
    console.debug("[meta-pixel] track failed", err);
  }
}

/** Track a custom (non-standard) Meta event. */
export function trackPixelCustomEvent(event: string, params?: Record<string, unknown>): void {
  if (!isPixelReady()) return;
  try {
    window.fbq!("trackCustom", event, params);
  } catch (err) {
    console.debug("[meta-pixel] trackCustom failed", err);
  }
}

/** SPA navigation PageView. The very first PageView is fired from index.html. */
export function trackPixelPageView(): void {
  trackPixelEvent("PageView");
}

/* -------------------------------------------------------------------------- */
/*  Deduplication                                                             */
/* -------------------------------------------------------------------------- */

// Fired within the current page session (survives re-renders / remounts).
const firedInSession = new Set<string>();

const STORAGE_PREFIX = "mp_evt:";

/** Once per browser (persisted) — used for CompleteRegistration & Purchase. */
function firedOnceEver(key: string): boolean {
  const storageKey = STORAGE_PREFIX + key;
  try {
    if (window.localStorage.getItem(storageKey)) return true;
    window.localStorage.setItem(storageKey, "1");
    return false;
  } catch {
    // localStorage blocked → fall back to in-memory guard
    if (firedInSession.has(storageKey)) return true;
    firedInSession.add(storageKey);
    return false;
  }
}

/** Once per page session (memory only) — used for ViewContent & InitiateCheckout. */
function firedOnceInSession(key: string): boolean {
  if (firedInSession.has(key)) return true;
  firedInSession.add(key);
  return false;
}

/* -------------------------------------------------------------------------- */
/*  Standard events                                                           */
/* -------------------------------------------------------------------------- */

interface ContentParams {
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  content_type?: string;
  value?: number;
  currency?: string;
}

/** Fires when a student opens a subject / teacher course / subscription page. */
export function trackViewContent(dedupeKey: string, params: ContentParams = {}): void {
  if (!isPixelReady()) return;
  if (firedOnceInSession(`ViewContent:${dedupeKey}`)) return;
  trackPixelEvent("ViewContent", { currency: "EGP", ...params });
}

/** Fires once ever, right after a new student account is confirmed. */
export function trackCompleteRegistration(userKey: string, params: Record<string, unknown> = {}): void {
  if (!isPixelReady()) return;
  if (firedOnceEver(`CompleteRegistration:${userKey}`)) return;
  trackPixelEvent("CompleteRegistration", { status: true, ...params });
}

/** Fires when the student opens the subscription/payment confirmation step. */
export function trackInitiateCheckout(dedupeKey: string, params: ContentParams = {}): void {
  if (!isPixelReady()) return;
  if (firedOnceInSession(`InitiateCheckout:${dedupeKey}`)) return;
  trackPixelEvent("InitiateCheckout", { currency: "EGP", ...params });
}

/** Fires only after the subscription/payment actually succeeded. */
export function trackPurchase(transactionKey: string, params: ContentParams & { value: number }): void {
  if (!isPixelReady()) return;
  if (firedOnceEver(`Purchase:${transactionKey}`)) return;
  trackPixelEvent("Purchase", { currency: "EGP", ...params });
}
