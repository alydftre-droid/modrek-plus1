import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Hybrid Native App Configuration
 * - التطبيق الأصلي يحمّل الواجهة محلياً من داخل الحزمة ليعمل بسرعة وثبات حتى بدون إنترنت
 * - البيانات والمصادقة والمحتوى تظل من نفس الباكند والإنتاج الحالي بدون تغيير أي مشروع أو روابط API
 */
const config: CapacitorConfig = {
  appId: 'com.modrek.plus',
  appName: 'Modrek Plus',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: [
      '*.b-cdn.net',
      '*.zoom.us',
      'source.zoom.us',
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#0F172A',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      backgroundColor: '#0F172A',
      style: 'DARK',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: [],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#22C55E',
    },
  },
  android: {
    backgroundColor: '#0F172A',
    allowMixedContent: false,
    // CRITICAL: must be false — true breaks Android IME composition (last word disappears, suggestions hidden)
    captureInput: false,
    webContentsDebuggingEnabled: false,
    useLegacyBridge: false,
  },
};

export default config;
