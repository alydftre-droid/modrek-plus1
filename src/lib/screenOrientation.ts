/**
 * Cross-platform screen orientation lock.
 *
 * On native (Android via Capacitor) we use @capacitor/screen-orientation,
 * which actually rotates the WebView. On web we fall back to the
 * Web Screen Orientation API (works only inside fullscreen on most browsers).
 *
 * Always call `unlock()` in a useEffect cleanup so leaving the page
 * restores the user's natural orientation.
 */

export type OrientationLockType = "portrait" | "landscape";

function getNativeOrientation(orientation: OrientationLockType) {
  return orientation === "landscape" ? "landscape-primary" : "portrait-primary";
}

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function lockOrientation(orientation: OrientationLockType): Promise<void> {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    const body = document.body;
    root.setAttribute("data-screen-orientation", orientation);
    root.style.setProperty("--app-orientation", orientation);
    if (body) {
      body.setAttribute("data-screen-orientation", orientation);
      body.classList.toggle("orientation-landscape", orientation === "landscape");
      body.classList.toggle("orientation-portrait", orientation === "portrait");
    }
  }

  // Native (Android / iOS)
  if (await isNative()) {
    try {
      const { ScreenOrientation } = await import("@capacitor/screen-orientation");
      await ScreenOrientation.lock({ orientation: getNativeOrientation(orientation) as any });
      return;
    } catch (err) {
      // Fall through to web fallback
      console.info("[orientation] native lock failed, fallback to web:", err);
    }
  }

  // Web fallback (only works in fullscreen on most mobile browsers)
  try {
    const so: any = (screen as any)?.orientation;
    if (so?.lock) {
      await so.lock(getNativeOrientation(orientation));
      return;
    }
  } catch {
    // not supported on desktop / Safari — silent no-op
  }
}

export async function unlockOrientation(): Promise<void> {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    const body = document.body;
    root.removeAttribute("data-screen-orientation");
    root.style.removeProperty("--app-orientation");
    if (body) {
      body.removeAttribute("data-screen-orientation");
      body.classList.remove("orientation-landscape", "orientation-portrait");
    }
  }

  if (await isNative()) {
    try {
      const { ScreenOrientation } = await import("@capacitor/screen-orientation");
      await ScreenOrientation.unlock();
      return;
    } catch (err) {
      console.info("[orientation] native unlock failed:", err);
    }
  }

  try {
    const so: any = (screen as any)?.orientation;
    if (so?.unlock) so.unlock();
  } catch {
    /* ignore */
  }
}
