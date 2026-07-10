package com.modrek.plus;

import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Toggles FLAG_SECURE on the host Activity window so that while a lecture
 * video is playing:
 *  - Screenshots are blocked.
 *  - Most screen-recording apps get a black frame.
 *  - The window is hidden from the Recent Apps thumbnail.
 *
 * The flag is scoped to the video screen only — call disable() on unmount
 * so the rest of the app (chats, dashboards, etc.) is not affected.
 */
@CapacitorPlugin(name = "ModrekSecureScreen")
public class ModrekSecureScreenPlugin extends Plugin {

    @PluginMethod
    public void enable(PluginCall call) {
        try {
            getActivity().runOnUiThread(() ->
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            );
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to enable secure screen", e);
        }
    }

    @PluginMethod
    public void disable(PluginCall call) {
        try {
            getActivity().runOnUiThread(() ->
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            );
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to disable secure screen", e);
        }
    }
}
