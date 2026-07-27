/**
 * Warm the offline cache on first authenticated launch.
 * - Preloads code-split chunks for the most-used student pages so they open
 *   instantly even when the device goes offline later.
 * - Runs at browser idle time, never blocks navigation.
 * - Runs at most once per session.
 */
let warmed = false;

export function warmOfflineCache() {
  if (warmed) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  warmed = true;

  const run = () => {
    // Critical student routes — each import() triggers the browser to fetch
    // and cache the chunk. Failures are silent (best-effort).
    const chunks: Array<() => Promise<unknown>> = [
      () => import("@/pages/Dashboard"),
      () => import("@/pages/Subjects"),
      () => import("@/pages/student/StudentProfilePage"),
      () => import("@/pages/student/MyCoursesPage"),
      () => import("@/pages/student/MyLibraryPage"),
      () => import("@/pages/student/WalletPage"),
      () => import("@/pages/student/NotificationsPage"),
      () => import("@/pages/ProfileSettings"),
      () => import("@/pages/student/ExamsListPage"),
      () => import("@/pages/student/SupportPage"),
    ];

    // Stagger imports so we don't saturate the network on slow connections
    chunks.forEach((load, i) => {
      setTimeout(() => {
        load().catch(() => undefined);
      }, i * 250);
    });
  };

  const idle: (cb: () => void) => number =
    (window as any).requestIdleCallback?.bind(window) ??
    ((cb: () => void) => window.setTimeout(cb, 1500));
  idle(run);
}
