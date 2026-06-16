import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SCROLL_PREFIX = "mp-scroll:";

export default function ScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `${SCROLL_PREFIX}${pathname}${search}${hash}`;
    const saved = Number(window.sessionStorage.getItem(key) || "0");
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: Number.isFinite(saved) ? saved : 0, left: 0, behavior: "instant" as ScrollBehavior });
    });

    const save = () => {
      try {
        window.sessionStorage.setItem(key, String(window.scrollY || 0));
      } catch {
        // ignore storage failures
      }
    };

    window.addEventListener("modrek:save-page-state", save);
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", save);
    return () => {
      save();
      window.removeEventListener("modrek:save-page-state", save);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", save);
    };
  }, [hash, pathname, search]);

  return null;
}