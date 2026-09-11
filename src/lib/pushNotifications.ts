/**
 * Push & local notification system for Modrek Plus.
 *
 * Native Android: Firebase Cloud Messaging (FCM) via @capacitor/push-notifications
 * delivers notifications to the OS notification tray + app icon badge even when
 * the app is closed. Tokens are persisted to `device_push_tokens` so the
 * `send-push-notification` edge function can deliver via FCM HTTP v1.
 *
 * Web / no-FCM: Supabase Realtime + LocalNotifications fallback (foreground only).
 *
 * FCM is separate from Google Sign-In (Credential Manager). They can coexist.
 */
import { supabase } from "@/integrations/supabase/client";
import { openUrlWithinAppContainer } from "@/lib/nativeNavigation";
import { registerPlugin } from "@capacitor/core";

let initialized = false;
let currentUserId: string | null = null;
let nativeAppListener: { remove: () => Promise<void> } | null = null;
let fcmRegistrationPromise: Promise<void> | null = null;
const recentlyShownNotificationKeys = new Map<string, number>();
const NOTIFICATION_DEDUPE_MS = 15_000;
const ANDROID_PUSH_CHANNEL_ID = "modrek_high_v4";
const FCM_NATIVE_REFRESH_KEY = "modrek:fcm-native-refresh:2026-07-08-v5";

type ModrekPushDiagnosticsPlugin = {
  ensureChannel(): Promise<NativePushDiagnostics>;
  getToken(): Promise<NativePushDiagnostics>;
  refreshToken(): Promise<NativePushDiagnostics>;
};

const ModrekPushDiagnostics = registerPlugin<ModrekPushDiagnosticsPlugin>("ModrekPushDiagnostics");

function getNotificationKey(opts: { id?: unknown; title?: unknown; body?: unknown; link?: unknown }) {
  const explicitId = typeof opts.id === "string" ? opts.id.trim() : "";
  if (explicitId) return `notification:${explicitId}`;
  return ["fallback", opts.title || "", opts.body || "", opts.link || ""].map(String).join("|");
}

function shouldShowNotificationOnce(key: string) {
  const now = Date.now();
  for (const [storedKey, expiresAt] of recentlyShownNotificationKeys) {
    if (expiresAt <= now) recentlyShownNotificationKeys.delete(storedKey);
  }
  const expiresAt = recentlyShownNotificationKeys.get(key) || 0;
  if (expiresAt > now) return false;
  recentlyShownNotificationKeys.set(key, now + NOTIFICATION_DEDUPE_MS);
  return true;
}

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function getPlatform(): Promise<string> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.getPlatform();
  } catch {
    return "web";
  }
}

type NativePushDiagnostics = {
  token?: string;
  refreshed?: boolean;
  notificationsEnabled?: boolean;
  channelId?: string;
  channelImportance?: number;
  firebaseProjectId?: string | null;
};

async function callNativePushDiagnostics(method: "ensureChannel" | "getToken" | "refreshToken") {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    return await ModrekPushDiagnostics[method]();
  } catch (error) {
    console.warn(`[push] native diagnostics ${method} failed:`, error);
    return null;
  }
}

async function persistNativeFcmToken(userId: string, forceRefresh = false) {
  try {
    await callNativePushDiagnostics("ensureChannel");

    let diagnostics: NativePushDiagnostics | null = null;
    let alreadyRefreshedForThisBuild = false;
    try {
      alreadyRefreshedForThisBuild = window.localStorage.getItem(FCM_NATIVE_REFRESH_KEY) === "done";
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }

    // Refresh exactly once after this build so devices that still hold tokens
    // from an older Firebase sender replace them. Do not delete/recreate the
    // FCM token on every foreground resume; that makes delivery unstable.
    const shouldForceRefresh = forceRefresh || !alreadyRefreshedForThisBuild;

    if (shouldForceRefresh) {
      diagnostics = await callNativePushDiagnostics("refreshToken");
      if (diagnostics?.token) {
        try {
          window.localStorage.setItem(FCM_NATIVE_REFRESH_KEY, "done");
        } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
      }
    }

    if (!diagnostics?.token) {
      diagnostics = await callNativePushDiagnostics("getToken");
    }

    if (diagnostics?.token) {
      await persistPushToken(userId, diagnostics.token, diagnostics);
    } else {
      try {
        await supabase.from("notification_delivery_logs").insert({
          user_id: userId,
          source_table: "device_push_tokens",
          notification_type: "device_registration",
          event_type: "native_fcm_token_missing",
          delivery_channel: "push",
          status: "failed",
          details: {
            notifications_enabled: diagnostics?.notificationsEnabled,
            channel_id: diagnostics?.channelId,
            channel_importance: diagnostics?.channelImportance,
            firebase_configured: Boolean(diagnostics?.firebaseProjectId),
          },
        } as any);
      } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
    }

    console.log("[push] native FCM diagnostics", {
      hasToken: Boolean(diagnostics?.token),
      refreshed: Boolean(diagnostics?.refreshed),
      notificationsEnabled: diagnostics?.notificationsEnabled,
      channelId: diagnostics?.channelId,
      channelImportance: diagnostics?.channelImportance,
      firebaseConfigured: Boolean(diagnostics?.firebaseProjectId),
    });
  } catch (error) {
    console.warn("[push] native FCM token persistence failed:", error);
  }
}

/** Persist the FCM token for the user. Safe to call repeatedly. */
async function persistPushToken(userId: string, token: string, diagnostics?: NativePushDiagnostics | null) {
  try {
    const platform = await getPlatform();
    try {
      const { error } = await supabase.rpc("register_device_push_token", {
        p_token: token,
        p_platform: platform,
        p_diagnostics: diagnostics
          ? {
              notifications_enabled: diagnostics.notificationsEnabled,
              channel_id: diagnostics.channelId,
              channel_importance: diagnostics.channelImportance,
              firebase_configured: Boolean(diagnostics.firebaseProjectId),
              refreshed: Boolean(diagnostics.refreshed),
            }
          : null,
      } as any);
      if (!error) {
        console.log("[push] FCM token registered via backend", userId);
        return;
      }
      console.warn("[push] backend token registration failed, falling back:", error);
    } catch (rpcError) {
      console.warn("[push] backend token registration exception, falling back:", rpcError);
    }

    const { error } = await supabase
      .from("device_push_tokens")
      .upsert(
        {
          user_id: userId,
          token,
          platform,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: "token" }
      );
    if (error) console.warn("[push] persist token failed:", error);
    else console.log("[push] FCM token registered for user", userId);
  } catch (e) {
    console.warn("[push] persist token exception:", e);
  }
}

/** Register FCM push notifications (Android/iOS via Capacitor). */
async function registerFcm(userId: string) {
  if (fcmRegistrationPromise) return fcmRegistrationPromise;
  fcmRegistrationPromise = registerFcmInternal(userId).finally(() => {
    fcmRegistrationPromise = null;
  });
  return fcmRegistrationPromise;
}

async function registerFcmInternal(userId: string) {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    // Permissions
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") {
      console.warn("[push] FCM permission not granted:", perm.receive);
      await persistNativeFcmToken(userId, false);
      return;
    }

    try {
      await PushNotifications.createChannel({
        id: ANDROID_PUSH_CHANNEL_ID,
        name: "إشعارات مدرك Plus",
        description: "تنبيهات الدروس والدعم والرسائل والاشتراكات",
        importance: 5,
        visibility: 1,
        lights: true,
        lightColor: "#22C55E",
        vibration: true,
      });
    } catch (error) {
      console.warn("[push] create notification channel failed:", error);
    }

    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.createChannel({
        id: ANDROID_PUSH_CHANNEL_ID,
        name: "إشعارات مدرك Plus",
        description: "تنبيهات الدروس والدعم والرسائل والاشتراكات",
        importance: 5,
        visibility: 1,
        lights: true,
        lightColor: "#22C55E",
        vibration: true,
      });
    } catch (error) {
      console.warn("[push] create local notification channel failed:", error);
    }

    // Ensure a single set of listeners
    await PushNotifications.removeAllListeners();

    PushNotifications.addListener("registration", async (t) => {
      if (t?.value) await persistPushToken(userId, t.value);
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.warn("[push] FCM registration error:", err);
    });

    // Native Android service now creates the foreground tray notification.
    // Keep the JS listener only to prove delivery and avoid duplicate banners.
    PushNotifications.addListener("pushNotificationReceived", (n) => {
      console.log("[push] FCM message received", {
        id: n.id,
        notification_id: (n.data as any)?.notification_id,
      });
    });

    // Tap on OS notification (background/killed) — navigate to link
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const link = (action.notification.data as any)?.link;
      if (link && typeof link === "string") openUrlWithinAppContainer(link);
    });

    await PushNotifications.register();
    await persistNativeFcmToken(userId, false);
  } catch (e) {
    // Plugin may be absent on web or if native module didn't build with google-services.
    console.warn("[push] FCM setup skipped:", e);
    await persistNativeFcmToken(userId, false);
  }
}

/** Initialize push & local notifications for the given user. */
export async function initPushNotifications(userId: string) {
  if (initialized && currentUserId === userId) {
    if (await isNative()) await registerFcm(userId);
    return;
  }
  await teardownPushNotifications();
  initialized = true;
  currentUserId = userId;

  const native = await isNative();

  if (native) {
    // Local notifications setup (for foreground mirroring + fallback)
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== "granted") {
        await LocalNotifications.requestPermissions();
      }
      LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
        const link = event.notification.extra?.link;
        if (link && typeof link === "string") openUrlWithinAppContainer(link);
      });
    } catch (e) {
      console.warn("[push] local notifications init failed:", e);
    }

    // FCM registration — enables OS-level push when app is closed
    await registerFcm(userId);

    try {
      const { App } = await import("@capacitor/app");
      nativeAppListener = await App.addListener("appStateChange", ({ isActive }) => {
        if (isActive && currentUserId) {
          persistNativeFcmToken(currentUserId, false).catch((e) => console.warn("[push] resume FCM token check failed:", e));
        }
      });
    } catch (error) {
      console.warn("[push] app state listener failed:", error);
    }
  }

  // Foreground notification UI owns its user-filtered Realtime subscriptions.
  // This module previously added a second, filterless notifications channel
  // whose callback intentionally did nothing. Removing it avoids broadcasting
  // every notification row to every signed-in client; native delivery remains
  // handled exclusively by FCM above.
}

/** Show a local notification on the device (no-op on web). */
export async function showLocalNotification(opts: {
  title: string;
  body: string;
  link?: string;
  notificationId?: string;
}) {
  try {
    if (!(await isNative())) return;
    const dedupeKey = getNotificationKey({
      id: opts.notificationId,
      title: opts.title,
      body: opts.body,
      link: opts.link,
    });
    if (!shouldShowNotificationOnce(dedupeKey)) return;
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 2_000_000_000),
          title: opts.title,
          body: opts.body,
          smallIcon: "ic_stat_icon",
          channelId: ANDROID_PUSH_CHANNEL_ID,
          sound: "default",
          largeBody: opts.body,
          summaryText: opts.title,
          extra: { link: opts.link, notification_id: opts.notificationId },
          schedule: { at: new Date(Date.now() + 100) },
        },
      ],
    });
  } catch (e) {
    console.warn("[push] showLocalNotification failed:", e);
  }
}

/** Tear down listeners on logout. */
export async function teardownPushNotifications() {
  initialized = false;
  currentUserId = null;
  if (nativeAppListener) {
    try {
      await nativeAppListener.remove();
    } catch (error) {
      console.warn("[push] remove app listener failed:", error);
    }
    nativeAppListener = null;
  }

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.removeAllListeners();
  } catch (error) {
    console.warn("[push] remove local listeners failed:", error);
  }

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.removeAllListeners();
  } catch {
    // absent on web
  }
}
