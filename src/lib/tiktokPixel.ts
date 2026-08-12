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
export function trackTikTokEvent(event: string, params?: Record<string, unknown>): void {
  if (!isTikTokPixelReady()) return;
  try {
    window.ttq!.track(event, sanitize(params));
  } catch (err) {
    console.debug("[tiktok-pixel] track failed", err);
  }
}
