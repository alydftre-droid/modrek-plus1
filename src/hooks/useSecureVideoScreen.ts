import { useEffect } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

interface SecureScreenPlugin {
  enable(): Promise<void>;
  disable(): Promise<void>;
}

// Native plugin implemented in android/app/src/main/java/com/modrek/plus/ModrekSecureScreenPlugin.java
// On web / iOS the plugin is a no-op.
const SecureScreen = registerPlugin<SecureScreenPlugin>("ModrekSecureScreen", {
  web: {
    enable: async () => {},
    disable: async () => {},
  },
});

/**
 * While mounted, prevents Android screenshots / screen recording / recent-apps
 * preview for the current activity by toggling FLAG_SECURE. Automatically
 * cleared on unmount so the rest of the app is unaffected.
 * Silent no-op on web and iOS.
 */
export function useSecureVideoScreen() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
    let active = true;
    SecureScreen.enable().catch(() => {});
    return () => {
      active = false;
      SecureScreen.disable().catch(() => {});
      void active;
    };
  }, []);
}
