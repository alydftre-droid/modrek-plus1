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
