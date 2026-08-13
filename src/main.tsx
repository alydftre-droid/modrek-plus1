import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { HelmetProvider } from "react-helmet-async";
import App from "./App";
import "./index.css";
import { initCapacitor } from "./capacitor-init";
import { enforceCanonicalRuntimeOrigin, pruneLegacySupabaseAuthStorage } from "./lib/supabaseRuntimeGuard";
import { initSentry } from "./lib/sentry";
import { enforceDataSchemaVersion } from "./lib/dataIntegrity/cacheVersion";

initSentry();
enforceDataSchemaVersion();

// Auto-recover from stale chunk errors after a new deploy. When the CDN has
// rotated hashed asset filenames, in-page navigations that trigger a fresh
// dynamic import() reject with "Failed to fetch dynamically imported module".
// Catch it at the window level (React lazy failures also bubble here) and do
// one guarded hard reload to pick up the new asset manifest.
if (typeof window !== "undefined") {
  const RELOAD_KEY = "mp-chunk-reload-at";
  const isChunkError = (msg: string) =>
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg);
  const tryReload = () => {
    try {
      // Skip reload while offline — reloading with no network would blank the app.
      // LazyRouteBoundary will render the offline fallback instead.
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || "0");
      if (Date.now() - last > 30_000) {
        window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch { /* ignore */ }
  };
  window.addEventListener("error", (event) => {
    const msg = String(event?.message || (event as any)?.error?.message || "");
    if (isChunkError(msg)) tryReload();
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason: any = (event as PromiseRejectionEvent).reason;
    const msg = String(reason?.message || reason || "");
    if (isChunkError(msg)) tryReload();
  });
}

// Initialize Capacitor plugins (no-op on web)
pruneLegacySupabaseAuthStorage();
enforceCanonicalRuntimeOrigin();
initCapacitor();

// The admin student report must always load the latest screens/data. Clear old
// persisted React Query snapshots and legacy service-worker caches once per UI version.
(() => {
  const liveUiBuster = "student-detail-live-db-20260701-v4";
  try {
    if (window.localStorage.getItem("mp-ui-buster") !== liveUiBuster) {
      window.localStorage.removeItem("mp-rq-cache-v1");
      window.localStorage.removeItem("mp-rq-cache-v2");
      window.localStorage.setItem("mp-ui-buster", liveUiBuster);
    }
  } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }

  window.addEventListener("load", () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      }).catch(() => {});
    }
    if ("caches" in window) {
      caches.keys().then((keys) => {
        keys
          .filter((key) => key.startsWith("mp-") || key.includes("workbox") || key.includes("lovable"))
          .forEach((key) => caches.delete(key));
      }).catch(() => {});
    }
  });
})();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>
);
