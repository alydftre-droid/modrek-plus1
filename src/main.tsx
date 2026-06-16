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

// Register smart-cache Service Worker — production builds only.
// Skip when inside an iframe or on Lovable preview hosts (per Lovable PWA guidelines).
(() => {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;
  const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const host = window.location.hostname;
  const params = new URLSearchParams(window.location.search);
  const isPreview =
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev");
  if (inIframe || isPreview || params.get("sw") === "off") {
    // Make sure no stale app-shell SW is registered in preview/dev/kill-switch mode
    navigator.serviceWorker.getRegistrations().then((rs) => {
      rs.filter((r) => new URL(r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "", window.location.origin).pathname === "/sw.js")
        .forEach((r) => r.unregister());
    });
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
})();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
