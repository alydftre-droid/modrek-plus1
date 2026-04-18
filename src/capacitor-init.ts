/**
 * Initialize Capacitor plugins when running as a native app.
 * Called once from main.tsx. No-op on web.
 */
export async function initCapacitor() {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;

    // Status bar
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#0F172A' });
    } catch {}

    // Back button – navigate browser history or exit
    try {
      const { App } = await import('@capacitor/app');
      App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
        } else {
          App.exitApp();
        }
      });
    } catch {}

    // Network – show/hide offline overlay
    try {
      const { Network } = await import('@capacitor/network');
      Network.addListener('networkStatusChange', (status) => {
        toggleOfflineOverlay(!status.connected);
      });
      const status = await Network.getStatus();
      toggleOfflineOverlay(!status.connected);
    } catch {}

    // Keyboard – resize body so inputs aren't hidden
    try {
      const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
      await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
      await Keyboard.setScroll({ isDisabled: false });
    } catch {}

    // Hide native splash quickly — in-app splash takes over
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      setTimeout(() => SplashScreen.hide(), 180);
    } catch {}

    // Keep native scrolling smooth without freezing page gestures
    document.documentElement.style.height = 'auto';
    document.body.style.height = 'auto';
    document.body.style.overscrollBehaviorY = 'auto';
    document.body.style.webkitOverflowScrolling = 'touch';
  } catch {
    // Not running in Capacitor context - silently ignore
  }
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
