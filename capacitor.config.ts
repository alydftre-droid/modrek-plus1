import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Hybrid Native App Configuration
 * - dist/ يتم تضمينها داخل APK (تطبيق حقيقي وليس WebView Shell)
 * - البيانات الديناميكية فقط تأتي من Supabase APIs
 * - يعمل Offline جزئيًا (UI shell + cached data)
 */
const config: CapacitorConfig = {
  appId: 'com.modrek.plus',
  appName: 'Modrek Plus',
  webDir: 'dist',
  // ⚠️ لا نستخدم server.url — التطبيق يحمل dist من داخل APK
  server: {
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: [
      'modrekplus.com',
      '*.modrekplus.com',
      '*.supabase.co',
      '*.supabase.in',
      '*.lovable.app',
      '*.b-cdn.net',
      'meet.jit.si',
      '*.jitsi.net',
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
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  android: {
    backgroundColor: '#0F172A',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    useLegacyBridge: false,
  },
};

export default config;
