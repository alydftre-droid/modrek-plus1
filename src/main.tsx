import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import App from "./App";
import "./index.css";
import { initCapacitor } from "./capacitor-init";
import { enforceCanonicalRuntimeOrigin, pruneLegacySupabaseAuthStorage } from "./lib/supabaseRuntimeGuard";
import { initSentry } from "./lib/sentry";
import { enforceDataSchemaVersion } from "./lib/dataIntegrity/cacheVersion";

initSentry();
enforceDataSchemaVersion();

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
    <App />
  </StrictMode>
);
