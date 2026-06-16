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
      'modrekplus.com',
      '*.modrekplus.com',
      '*.supabase.co',
      '*.supabase.in',
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
    // Native Google Sign-In via Credential Manager / Google SDK (no browser/Custom Tabs)
    // IMPORTANT: replace serverClientId with the Web application OAuth Client ID from Google Cloud Console
    // (the same one used by Supabase's Google provider). Then run `npx cap sync android` and rebuild.
    GoogleAuth: {
      scopes: ['profile', 'email', 'openid'],
      serverClientId: process.env.GOOGLE_WEB_CLIENT_ID || 'REPLACE_WITH_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
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
