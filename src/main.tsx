import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import App from "./App";
import "./index.css";
import { initCapacitor } from "./capacitor-init";

// Initialize Capacitor plugins (no-op on web)
initCapacitor();

// Register smart-cache Service Worker — production builds only.
// Skip when inside an iframe or on Lovable preview hosts (per Lovable PWA guidelines).
(() => {
  if (!("serviceWorker" in navigator)) return;
  const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const host = window.location.hostname;
  const isPreview =
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    host.includes("lovable.app");
  if (inIframe || isPreview) {
    // Make sure no stale SW is registered in preview
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
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
