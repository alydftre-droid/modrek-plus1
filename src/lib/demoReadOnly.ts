import { toast } from "sonner";

/**
 * Demo accounts see the whole platform, but every write is refused by the
 * backend (database statement triggers + edge-function guards). Nothing is
 * hidden in the UI: buttons, pages and data all stay exactly as they are.
 *
 * This module only turns the backend refusal into one clear Arabic message so
 * the person using the demo account understands why nothing changed. It is a
 * cosmetic layer — the security boundary lives entirely server-side.
 */
export const DEMO_READ_ONLY_MESSAGE =
  "حساب المعاينة يعمل بوضع المشاهدة فقط ولا يمكنه إجراء تغييرات.";

const MARKER = "DEMO_READ_ONLY";
let lastShownAt = 0;

export function isDemoReadOnlyError(error: unknown): boolean {
  if (!error) return false;
  const anyErr = error as { message?: string; error?: string; code?: string; details?: string };
  return [anyErr.message, anyErr.error, anyErr.code, anyErr.details]
    .some((value) => typeof value === "string" && value.includes(MARKER));
}

export function notifyDemoReadOnly() {
  const now = Date.now();
  if (now - lastShownAt < 3000) return; // one message per burst of failed writes
  lastShownAt = now;
  toast.error(DEMO_READ_ONLY_MESSAGE);
}

/**
 * Watches responses coming back from the backend and surfaces the read-only
 * message whenever a write was refused, no matter which screen triggered it.
 */
export function installDemoReadOnlyNotifier() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __demoReadOnlyNotifier?: boolean };
  if (w.__demoReadOnlyNotifier) return;
  w.__demoReadOnlyNotifier = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);
    if (response.status === 403 || response.status === 400 || response.status === 500) {
      const type = response.headers.get("content-type") || "";
      if (type.includes("json")) {
        try {
          const text = await response.clone().text();
          if (text.includes(MARKER)) notifyDemoReadOnly();
        } catch {
          /* body not readable — ignore */
        }
      }
    }
    return response;
  };
}
