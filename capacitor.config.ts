import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.modrek.plus',
  appName: 'Modrek Plus',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 150,
      launchAutoHide: false,
      backgroundColor: '#0F172A',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      spinnerColor: '#22C55E',
      androidSpinnerStyle: 'large',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      backgroundColor: '#0F172A',
      style: 'DARK',
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  android: {
    backgroundColor: '#0F172A',
    allowMixedContent: true,
    captureInput: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
