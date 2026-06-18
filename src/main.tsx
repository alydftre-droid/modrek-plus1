import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import App from "./App";
import "./index.css";
import { initCapacitor } from "./capacitor-init";
import { enforceCanonicalRuntimeOrigin, pruneLegacySupabaseAuthStorage } from "./lib/supabaseRuntimeGuard";

// Initialize Capacitor plugins (no-op on web)
pruneLegacySupabaseAuthStorage();
enforceCanonicalRuntimeOrigin();
initCapacitor();

// The app must always load the latest exam screens/data. Remove old service workers
// that cached stale teacher pages and sometimes showed the deleted legacy exam UI.
(() => {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    }).catch(() => {});
    if ("caches" in window) {
      caches.keys().then((keys) => {
        keys.filter((key) => key.startsWith("mp-") || key.includes("workbox")).forEach((key) => caches.delete(key));
      }).catch(() => {});
    }
  });
})();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
