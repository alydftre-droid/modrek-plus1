/**
 * Push Notifications system for Modrek Plus.
 *
 * Strategy (hybrid):
 *  1. **Local notifications** (works immediately, no Firebase setup needed):
 *     Subscribes to Supabase Realtime on the `notifications` table for the
 *     current user. When a new row is inserted, schedules a native local
 *     notification on the device. This works while the app is open OR in
 *     background — but NOT when the app is fully killed.
 *
 *  2. **Push notifications via FCM** (full background delivery, requires
 *     `google-services.json` from Firebase). When available, registers the
 *     device token in `device_push_tokens` table so an edge function can
 *     send true push messages later. Gracefully no-op if FCM isn't set up.
 */
import { supabase } from "@/integrations/supabase/client";

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let initialized = false;
let pushRegistered = false;

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
          window.location.assign(link);
        }
      });
    } catch (e) {
      console.warn("[push] local notifications init failed:", e);
    }

    // FCM Push (best-effort — requires google-services.json)
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive !== "granted") {
        const req = await PushNotifications.requestPermissions();
        if (req.receive !== "granted") {
          console.info("[push] FCM permission not granted, skipping registration");
        }
      }

      if (!pushRegistered) {
        pushRegistered = true;

        PushNotifications.addListener("registration", async (token) => {
          try {
            await supabase.from("device_push_tokens").upsert(
              {
                user_id: userId,
                token: token.value,
                platform: "android",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "token" }
            );
          } catch (err) {
            console.warn("[push] failed to register token:", err);
          }
        });

        PushNotifications.addListener("registrationError", (err) => {
          console.info("[push] FCM not configured (this is OK):", err);
        });

        PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
          const link = event.notification.data?.link;
          if (link) window.location.assign(link);
        });
      }

      await PushNotifications.register();
    } catch (e) {
      console.info("[push] FCM not available:", e);
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
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.removeAllListeners();
  } catch (error) {
    console.warn("[push] remove push listeners failed:", error);
  }

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.removeAllListeners();
  } catch (error) {
    console.warn("[push] remove local listeners failed:", error);
  }

  pushRegistered = false;
}
