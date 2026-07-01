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
  useEffect(() => {
    const path = location.pathname;
    if (last.current === path) return;
    last.current = path;
    // fire & forget
    void logActivity({
      action_type: "page_view",
      action_label: "زيارة صفحة",
      page_path: path,
    });
  }, [location.pathname]);
  return null;
}
