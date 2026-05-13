import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.modrek.plus',
  appName: 'Modrek Plus',
  webDir: 'dist',
  server: {
    url: 'https://modrekplus.com',
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: ['modrekplus.com', '*.modrekplus.com'],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 100,
      launchAutoHide: true,
      backgroundColor: '#FFF8F0',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      backgroundColor: '#FFF8F0',
      style: 'LIGHT',
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  android: {
    backgroundColor: '#FFF8F0',
    allowMixedContent: true,
    captureInput: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
