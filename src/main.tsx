import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import App from "./App";
import "./index.css";
import { initCapacitor } from "./capacitor-init";

// Initialize Capacitor plugins (no-op on web)
initCapacitor();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
1
