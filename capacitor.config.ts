import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Hybrid Native App Configuration
 * - التطبيق الأصلي يجب أن يحمّل الموقع الرسمي نفسه حتى يطابق بيئة الإنتاج 100%
 * - هذا يمنع اختلاف الواجهة/المصادقة/البيانات بين الـ APK والموقع
 * - dist تبقى مطلوبة للبناء المحلي فقط، لكن التشغيل الفعلي داخل التطبيق يكون من النطاق الرسمي
 */
const config: CapacitorConfig = {
  appId: 'com.modrek.plus',
  appName: 'Modrek Plus',
  webDir: 'dist',
  server: {
    url: 'https://modrekplus.com',
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
