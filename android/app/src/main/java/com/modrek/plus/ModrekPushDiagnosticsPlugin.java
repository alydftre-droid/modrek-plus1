package com.modrek.plus;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "ModrekPushDiagnostics")
public class ModrekPushDiagnosticsPlugin extends Plugin {
    private static final String TAG = "ModrekPushDiagnostics";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void ensureChannel(PluginCall call) {
        try {
            ModrekFirebaseMessagingService.ensureNotificationChannel(getContext());
            JSObject response = buildStatus(null);
            call.resolve(response);
        } catch (Exception error) {
            Log.e(TAG, "ensureChannel failed", error);
            call.reject("PUSH_CHANNEL_FAILED: " + error.getMessage());
        }
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        executor.execute(() -> {
            try {
                FirebaseApp.initializeApp(getContext());
                String token = Tasks.await(FirebaseMessaging.getInstance().getToken(), 15, TimeUnit.SECONDS);
                JSObject response = buildStatus(token);
                call.resolve(response);
            } catch (Exception error) {
                Log.e(TAG, "getToken failed", error);
                call.reject("FCM_TOKEN_FETCH_FAILED: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void refreshToken(PluginCall call) {
        executor.execute(() -> {
            try {
                FirebaseApp.initializeApp(getContext());
                FirebaseMessaging messaging = FirebaseMessaging.getInstance();
                Tasks.await(messaging.deleteToken(), 15, TimeUnit.SECONDS);
                String token = Tasks.await(messaging.getToken(), 15, TimeUnit.SECONDS);
                JSObject response = buildStatus(token);
                response.put("refreshed", true);
                call.resolve(response);
            } catch (Exception error) {
                Log.e(TAG, "refreshToken failed", error);
                call.reject("FCM_TOKEN_REFRESH_FAILED: " + error.getMessage());
            }
        });
    }

    private JSObject buildStatus(String token) {
        Context context = getContext();
        ModrekFirebaseMessagingService.ensureNotificationChannel(context);

        JSObject response = new JSObject();
        response.put("token", token);
        response.put("notificationsEnabled", NotificationManagerCompat.from(context).areNotificationsEnabled());
        response.put("channelId", ModrekFirebaseMessagingService.CHANNEL_ID);
        response.put("channelImportance", getChannelImportance(context));
        response.put("firebaseProjectId", readStringResource(context, "google_app_id"));
        return response;
    }

    private int getChannelImportance(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return NotificationManagerCompat.IMPORTANCE_HIGH;
        }
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel = manager == null ? null : manager.getNotificationChannel(ModrekFirebaseMessagingService.CHANNEL_ID);
        return channel == null ? NotificationManagerCompat.IMPORTANCE_NONE : channel.getImportance();
    }

    private String readStringResource(Context context, String name) {
        try {
            int id = context.getResources().getIdentifier(name, "string", context.getPackageName());
            return id == 0 ? null : context.getString(id);
        } catch (Exception ignored) {
            return null;
        }
    }
}