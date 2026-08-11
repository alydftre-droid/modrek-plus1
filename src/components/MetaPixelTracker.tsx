import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { trackPixelPageView } from "@/lib/metaPixel";

/**
 * Fires a Meta Pixel PageView on every SPA route change.
 * The initial PageView is already sent by the base code in index.html,
 * so the first location is skipped to avoid a duplicate.
 */
export default function MetaPixelTracker() {
  const location = useLocation();
  const lastPath = useRef<string | null>(null);
  const isFirst = useRef(true);

  useEffect(() => {
    const path = location.pathname + location.search;
    if (isFirst.current) {
      isFirst.current = false;
      lastPath.current = path;
      return;
    }
    if (lastPath.current === path) return;
    lastPath.current = path;
    trackPixelPageView();
  }, [location.pathname, location.search]);

  return null;
}
