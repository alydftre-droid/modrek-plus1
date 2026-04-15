import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

/**
 * Initialize Capacitor plugins when running as a native app.
 * Called once from main.tsx.
 */
export async function initCapacitor() {
  if (!Capacitor.isNativePlatform()) return;

  // Status bar
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0F172A' });
  } catch {}

  // Back button – navigate browser history or exit
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });

  // Network – show/hide offline overlay
  Network.addListener('networkStatusChange', (status) => {
    toggleOfflineOverlay(!status.connected);
  });

  // Check initial status
  const status = await Network.getStatus();
  toggleOfflineOverlay(!status.connected);

  // Hide splash after a short delay
  setTimeout(() => SplashScreen.hide(), 2000);
}

function toggleOfflineOverlay(show: boolean) {
  let overlay = document.getElementById('offline-overlay');
  if (show && !overlay) {
    overlay = document.createElement('div');
    overlay.id = 'offline-overlay';
    overlay.innerHTML = `
      <div style="
        position:fixed;inset:0;z-index:99999;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        background:#0F172A;color:#fff;font-family:Cairo,sans-serif;text-align:center;padding:2rem;
      ">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"/>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
          <line x1="12" y1="20" x2="12.01" y2="20"/>
        </svg>
        <h2 style="margin:1rem 0 0.5rem;font-size:1.5rem;">لا يوجد اتصال بالإنترنت</h2>
        <p style="color:#94A3B8;margin-bottom:1.5rem;">يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى</p>
        <button onclick="location.reload()" style="
          padding:0.75rem 2rem;border-radius:0.75rem;border:none;
          background:linear-gradient(135deg,#22C55E,#16A34A);color:#fff;
          font-size:1rem;font-family:Cairo,sans-serif;cursor:pointer;
        ">إعادة المحاولة</button>
      </div>
    `;
    document.body.appendChild(overlay);
  } else if (!show && overlay) {
    overlay.remove();
  }
}
