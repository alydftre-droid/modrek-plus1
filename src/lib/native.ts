/**
 * Native helpers (Capacitor). All no-op on web.
 */
let isNativeCache: boolean | null = null;

export async function isNative(): Promise<boolean> {
  if (isNativeCache !== null) return isNativeCache;
  try {
    const { Capacitor } = await import("@capacitor/core");
    isNativeCache = Capacitor.isNativePlatform();
  } catch {
    isNativeCache = false;
  }
  return isNativeCache;
}

export async function hapticLight() {
  try {
    if (!(await isNative())) return;
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
}

export async function hapticMedium() {
  try {
    if (!(await isNative())) return;
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
}

export async function hapticSuccess() {
  try {
    if (!(await isNative())) return;
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
}
