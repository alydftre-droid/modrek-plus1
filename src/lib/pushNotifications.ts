/**
 * Local notification system for Modrek Plus.
 *
 * Firebase/FCM is intentionally not bundled in Android because production
 * Google Sign-In uses Google Cloud OAuth + Credential Manager, not Firebase.
 * This module only uses Capacitor LocalNotifications plus Supabase Realtime.
 */
import { supabase } from "@/integrations/supabase/client";
import { openUrlWithinAppContainer } from "@/lib/nativeNavigation";

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let initialized = false;

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

/** Initialize push & local notifications for the given user. */
export async function initPushNotifications(userId: string) {
  if (initialized) return;
  initialized = true;

  const native = await isNative();

  // Local notifications (works on web fallback too, but mainly for native)
  if (native) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== "granted") {
        await LocalNotifications.requestPermissions();
      }

      // Tap handler — navigate to the notification's link if provided
      LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
        const link = event.notification.extra?.link;
        if (link && typeof link === "string") {
          openUrlWithinAppContainer(link);
        }
      });
    } catch (e) {
      console.warn("[push] local notifications init failed:", e);
    }

  }

  // Realtime subscription — fires local notification when a new DB row arrives
  try {
    realtimeChannel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const row = payload.new as NotificationRow;
          await showLocalNotification({
            title: row.title || "إشعار جديد",
            body: row.message || "",
            link: row.link || undefined,
          });
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
}
