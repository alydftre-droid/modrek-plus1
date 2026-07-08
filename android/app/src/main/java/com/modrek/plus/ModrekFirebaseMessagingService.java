package com.modrek.plus;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Native FCM handler for مدرك Plus.
 *
 * Capacitor's default service forwards foreground messages to JavaScript. This
 * subclass keeps that behavior via super, and also creates a real Android tray
 * notification for foreground/data-only messages so delivery is not limited to
 * in-app realtime events.
 */
public class ModrekFirebaseMessagingService extends MessagingService {
    public static final String CHANNEL_ID = "modrek_high_v2";
    private static final String CHANNEL_NAME = "إشعارات مدرك Plus";
    private static final String CHANNEL_DESCRIPTION = "تنبيهات الدروس والدعم والرسائل والاشتراكات";
    private static final String GROUP_KEY = "com.modrek.plus.NOTIFICATIONS";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        RemoteMessage.Notification remoteNotification = remoteMessage.getNotification();
        Map<String, String> data = remoteMessage.getData();

        String title = firstNonBlank(
            data.get("title"),
            remoteNotification != null ? remoteNotification.getTitle() : null,
            "إشعار جديد"
        );
        String body = firstNonBlank(
            data.get("body"),
            remoteNotification != null ? remoteNotification.getBody() : null,
            ""
        );
        String link = firstNonBlank(data.get("link"), remoteNotification != null && remoteNotification.getLink() != null ? remoteNotification.getLink().toString() : null, "");
        String notificationId = firstNonBlank(data.get("notification_id"), remoteMessage.getMessageId(), String.valueOf(System.currentTimeMillis()));
        int notificationCount = parsePositiveInt(data.get("notification_count"), 1);

        showSystemNotification(title, body, link, notificationId, notificationCount, data);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        getSharedPreferences("modrek_push", MODE_PRIVATE)
            .edit()
            .putString("last_fcm_token", token)
            .putLong("last_fcm_token_at", System.currentTimeMillis())
            .apply();
    }

    public static void ensureNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(CHANNEL_DESCRIPTION);
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    private void showSystemNotification(
        String title,
        String body,
        String link,
        String notificationId,
        int notificationCount,
        Map<String, String> data
    ) {
        ensureNotificationChannel(this);

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        Bundle extras = new Bundle();
        extras.putString("google.message_id", notificationId);
        extras.putString("title", title);
        extras.putString("body", body);
        extras.putString("link", link);
        extras.putString("notification_id", notificationId);
        extras.putString("channel_id", CHANNEL_ID);
        for (Map.Entry<String, String> entry : data.entrySet()) {
            extras.putString(entry.getKey(), entry.getValue());
        }
        intent.putExtras(extras);

        int requestCode = stableNotificationId(notificationId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getActivity(this, requestCode, intent, flags);

        Uri defaultSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSound(defaultSound)
            .setDefaults(android.app.Notification.DEFAULT_ALL)
            .setGroup(GROUP_KEY)
            .setNumber(notificationCount)
            .setOnlyAlertOnce(false);

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(requestCode, builder.build());
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) return value.trim();
        }
        return "";
    }

    private static int parsePositiveInt(String value, int fallback) {
        try {
            int parsed = Integer.parseInt(value == null ? "" : value.trim());
            return Math.max(parsed, 1);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static int stableNotificationId(String value) {
        int id = value == null ? 0 : value.hashCode();
        if (id == 0 || id == Integer.MIN_VALUE) return (int) (System.currentTimeMillis() & 0x7fffffff);
        return Math.abs(id);
    }
}