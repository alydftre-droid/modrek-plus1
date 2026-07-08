import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { logActivity } from "@/lib/activityLogger";

/**
 * Silently logs every route change into the correct activity_logs table
 * based on the current user's role. No UI.
 */
export default function RouteActivityTracker() {
  const location = useLocation();
  const last = useRef<string | null>(null);
  const enteredAt = useRef<number>(Date.now());

  const flushDuration = (path: string | null) => {
    if (!path) return;
    const durationSeconds = Math.round((Date.now() - enteredAt.current) / 1000);
    if (durationSeconds < 3) return;
    void logActivity({
      action_type: "page_duration",
      action_label: "مدة البقاء في الصفحة",
      page_path: path,
      duration_seconds: durationSeconds,
    });
  };

  useEffect(() => {
    const path = location.pathname;
    if (last.current === path) return;
    flushDuration(last.current);
    last.current = path;
    enteredAt.current = Date.now();
    // fire & forget
    void logActivity({
      action_type: "page_view",
      action_label: "زيارة صفحة",
      page_path: path,
    });
  }, [location.pathname]);

  useEffect(() => {
    const save = () => flushDuration(last.current);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") save();
      else enteredAt.current = Date.now();
    };
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return null;
}
