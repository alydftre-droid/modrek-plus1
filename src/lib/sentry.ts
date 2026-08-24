/**
 * Sentry initialization for the client.
 *
 * Reads `VITE_SENTRY_DSN` from the build environment. If not set, becomes a
 * no-op — the app runs normally without error tracking. Once the workspace
 * admin adds the DSN as a build secret and redeploys, tracking activates
 * automatically without further code changes.
 */
import * as Sentry from "@sentry/react";

let initialized = false;

export function initSentry() {
  if (initialized) return;
  const dsn = (import.meta as any).env?.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  try {
    Sentry.init({
      dsn,
      environment: (import.meta as any).env?.MODE || "production",
      release: (import.meta as any).env?.VITE_APP_VERSION || undefined,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0.1,
      integrations: [Sentry.browserTracingIntegration()],
      // Never send user-typed content or auth tokens to Sentry
      beforeSend(event) {
        try {
          if (event.request?.headers) {
            const h = event.request.headers as Record<string, string>;
            for (const k of Object.keys(h)) {
              if (/authorization|cookie|token|apikey/i.test(k)) h[k] = "[redacted]";
            }
          }
          if (event.request?.url) {
            event.request.url = String(event.request.url).replace(/token=[^&]+/gi, "token=[redacted]");
          }
        } catch { /* keep original event on redaction failure */ }
        return event;
      },
    });
    initialized = true;
  } catch (err) {
    console.warn("[sentry] init failed", err);
  }
}

export function reportError(err: unknown, context?: Record<string, unknown>) {
  try {
    if (initialized) Sentry.captureException(err, { extra: context });
  } catch { /* swallow to never break app */ }
  console.error("[reportError]", err, context);
}
