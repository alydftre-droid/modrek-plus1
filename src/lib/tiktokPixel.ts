/**
 * TikTok Pixel helper for ModrekPlus.
 * The base script + load() + first page() live in index.html so the pixel is
 * created exactly once, before React mounts. This module only wraps `ttq`.
 *
 * PRIVACY: never pass personal data (names, emails, phones, passwords,
 * teacher/account data, DB identifiers) to any function here.
 */

declare global {
  interface Window {
    ttq?: {
      page: (...args: unknown[]) => void;
      track: (...args: unknown[]) => void;
      identify?: (...args: unknown[]) => void;
    };
  }
}

const isNative = () =>
  typeof window !== "undefined" &&
  (window as any).Capacitor?.isNativePlatform?.() === true;

export function isTikTokPixelReady(): boolean {
  return typeof window !== "undefined" && !!window.ttq && !isNative();
}

/** Non-sensitive params only: content ids, category, value, currency, quantity. */
const ALLOWED_KEYS = new Set([
  "content_id",
  "content_ids",
  "content_type",
  "content_name",
  "content_category",
  "quantity",
  "price",
  "value",
  "currency",
  "description",
  "status",
]);

function sanitize(params?: Record<string, unknown>): Record<string, unknown> {
  if (!params) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "object" && !Array.isArray(value)) continue;
    out[key] = value;
  }
  return out;
}

/** SPA navigation page view. The very first page() is fired from index.html. */
export function trackTikTokPageView(): void {
  if (!isTikTokPixelReady()) return;
  try {
    window.ttq!.page();
  } catch (err) {
    console.debug("[tiktok-pixel] page failed", err);
  }
}

/** Track a TikTok standard/custom event with sanitized params. */
export function trackTikTokEvent(
  event: string,
  params?: Record<string, unknown>,
  eventId?: string,
): void {
  if (!isTikTokPixelReady()) return;
  try {
    if (eventId) {
      window.ttq!.track(event, sanitize(params), { event_id: eventId });
    } else {
      window.ttq!.track(event, sanitize(params));
    }
  } catch (err) {
    console.debug("[tiktok-pixel] track failed", err);
  }
}

/* -------------------------------------------------------------------------- */
/*  Deduplication                                                             */
/* -------------------------------------------------------------------------- */

const firedInSession = new Set<string>();
const STORAGE_PREFIX = "ttq_evt:";

/** Once per page session (memory only) — ViewContent / InitiateCheckout. */
function firedOnceInSession(key: string): boolean {
  if (firedInSession.has(key)) return true;
  firedInSession.add(key);
  return false;
}

/** Once per browser (persisted) — successful payments only. */
function firedOnceEver(key: string): boolean {
  const storageKey = STORAGE_PREFIX + key;
  try {
    if (window.localStorage.getItem(storageKey)) return true;
    window.localStorage.setItem(storageKey, "1");
    return false;
  } catch {
    return firedOnceInSession(storageKey);
  }
}

/* -------------------------------------------------------------------------- */
/*  Standard events (non-personal params only)                                */
/* -------------------------------------------------------------------------- */

interface TikTokContentParams {
  content_id?: string;
  content_ids?: string[];
  content_type?: string;
  content_name?: string;
  content_category?: string;
  quantity?: number;
  price?: number;
  value?: number;
}

/** Subject / course / bundle page shown. */
export function trackTikTokViewContent(dedupeKey: string, params: TikTokContentParams = {}): void {
  if (!isTikTokPixelReady()) return;
  if (firedOnceInSession(`ViewContent:${dedupeKey}`)) return;
  trackTikTokEvent("ViewContent", { currency: "EGP", ...params });
}

/** Student actually started the subscription/payment step. */
export function trackTikTokInitiateCheckout(dedupeKey: string, params: TikTokContentParams = {}): void {
  if (!isTikTokPixelReady()) return;
  if (firedOnceInSession(`InitiateCheckout:${dedupeKey}`)) return;
  trackTikTokEvent("InitiateCheckout", { currency: "EGP", ...params });
}

/**
 * Fires ONLY after the server confirmed the payment/subscription.
 * `transactionKey` becomes the stable `event_id` so retries/reloads never duplicate.
 */
export function trackTikTokCompletePayment(
  transactionKey: string,
  params: TikTokContentParams & { value: number },
): void {
  if (!isTikTokPixelReady()) return;
  if (firedOnceEver(`Purchase:${transactionKey}`)) return;
  // "Purchase" is used instead of "CompletePayment": the pixel SDK drops
  // CompletePayment without advanced matching (which needs personal data).
  trackTikTokEvent("Purchase", { currency: "EGP", ...params }, `pur_${transactionKey}`);
}

