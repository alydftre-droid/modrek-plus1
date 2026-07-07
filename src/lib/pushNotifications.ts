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

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let initialized = false;
let currentUserId: string | null = null;

type NotificationRow = {
  title?: string | null;
  message?: string | null;
  link?: string | null;
};

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

/** Persist the FCM token for the user. Safe to call repeatedly. */
async function persistPushToken(userId: string, token: string) {
  try {
    const platform = await getPlatform();
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
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    // Permissions
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") {
      console.warn("[push] FCM permission not granted:", perm.receive);
      return;
    }

    // Ensure a single set of listeners
    await PushNotifications.removeAllListeners();

    PushNotifications.addListener("registration", async (t) => {
      if (t?.value) await persistPushToken(userId, t.value);
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.warn("[push] FCM registration error:", err);
    });

    // Foreground pushes: OS may not show a heads-up banner while app is open,
    // so mirror to LocalNotifications for visibility.
    PushNotifications.addListener("pushNotificationReceived", async (n) => {
      try {
        await showLocalNotification({
          title: n.title || (n.data as any)?.title || "إشعار جديد",
          body: n.body || (n.data as any)?.body || "",
          link: (n.data as any)?.link,
        });
      } catch (e) {
        console.warn("[push] foreground mirror failed:", e);
      }
    });

    // Tap on OS notification (background/killed) — navigate to link
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const link = (action.notification.data as any)?.link;
      if (link && typeof link === "string") openUrlWithinAppContainer(link);
    });

    await PushNotifications.register();
  } catch (e) {
    // Plugin may be absent on web or if native module didn't build with google-services.
    console.warn("[push] FCM setup skipped:", e);
  }
}

/** Initialize push & local notifications for the given user. */
export async function initPushNotifications(userId: string) {
  if (initialized && currentUserId === userId) return;
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
  }

  // Realtime subscription — foreground in-app updates & web fallback.
  // Uses a filterless subscription so broadcast rows (user_id NULL) are also received.
  try {
    realtimeChannel = supabase
      .channel(`notifications-user-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        async (payload) => {
          const row = payload.new as NotificationRow & { user_id?: string | null };
          if (row.user_id && row.user_id !== userId) return;
          // Only mirror to local when native and app is foreground — FCM handles background.
          if (native) {
            await showLocalNotification({
              title: row.title || "إشعار جديد",
              body: row.message || "",
              link: row.link || undefined,
            });
          }
        }
      )
      .subscribe();
  } catch (e) {
    console.warn("[push] realtime subscribe failed:", e);
  }
}

/** Show a local notification on the device (no-op on web). */
export async function showLocalNotification(opts: {
  title: string;
  body: string;
  link?: string;
}) {
  try {
    if (!(await isNative())) return;
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 2_000_000_000),
          title: opts.title,
          body: opts.body,
          smallIcon: "ic_stat_icon",
          extra: { link: opts.link },
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
  if (realtimeChannel) {
    try {
      await supabase.removeChannel(realtimeChannel);
    } catch (error) {
      console.warn("[push] remove realtime channel failed:", error);
    }
    realtimeChannel = null;
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
