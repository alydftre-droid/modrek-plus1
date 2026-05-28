/**
 * Initialize Capacitor plugins when running as a native app.
 * Called once from main.tsx. No-op on web.
 */
export async function initCapacitor() {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;

    document.documentElement.setAttribute('data-native-app', 'true');
    document.body.setAttribute('data-native-app', 'true');
    syncNativeViewportMetrics();
    window.addEventListener('resize', syncNativeViewportMetrics, { passive: true });
    window.addEventListener('orientationchange', syncNativeViewportMetrics, { passive: true });
    window.visualViewport?.addEventListener('resize', syncNativeViewportMetrics, { passive: true });

    // Status bar
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.show();
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#0F172A' });
      syncNativeViewportMetrics();
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
    document.documentElement.style.height = '100%';
    document.body.style.height = '100%';
    document.documentElement.style.minHeight = '100%';
    document.body.style.minHeight = '100%';
    document.body.style.overscrollBehaviorY = 'auto';
    document.body.style.setProperty('-webkit-overflow-scrolling', 'touch');
  } catch {
    // Not running in Capacitor context - silently ignore
  }
}

function syncNativeViewportMetrics() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const root = document.documentElement;
  const viewportHeight = Math.max(window.visualViewport?.height ?? 0, window.innerHeight || 0, document.documentElement.clientHeight || 0);
  const viewportWidth = Math.max(window.visualViewport?.width ?? 0, window.innerWidth || 0, document.documentElement.clientWidth || 0);
  const topInset = Math.max(0, window.innerHeight - viewportHeight);

  root.style.setProperty('--app-vh', `${viewportHeight * 0.01}px`);
  root.style.setProperty('--app-vw', `${viewportWidth * 0.01}px`);
  root.style.setProperty('--status-bar-offset', `${topInset}px`);
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
        background:linear-gradient(180deg,#0F172A 0%,#0B1224 100%);
        color:#fff;font-family:Cairo,sans-serif;text-align:center;padding:2rem;
      ">
        <div style="
          width:108px;height:108px;border-radius:28px;background:#0B1224;
          display:flex;align-items:center;justify-content:center;margin-bottom:24px;
          box-shadow:0 24px 60px -20px rgba(34,197,94,0.45),inset 0 0 0 1px rgba(255,255,255,0.06);
          position:relative;overflow:hidden;
        ">
          <div style="
            position:absolute;inset:-30%;border-radius:50%;
            background:radial-gradient(circle,rgba(34,197,94,0.25) 0%,transparent 65%);
            filter:blur(8px);
          "></div>
          <img src="/modrek-brand-symbol.png" alt="مدرك Plus"
            style="width:74px;height:74px;object-fit:contain;position:relative;z-index:1;"
            onerror="this.style.display='none'" />
        </div>
        <div style="
          display:flex;align-items:center;gap:10px;
          background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);
          color:#FCA5A5;padding:8px 14px;border-radius:999px;
          font-size:0.78rem;font-weight:600;margin-bottom:18px;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
          غير متصل بالإنترنت
        </div>
        <h2 style="margin:0 0 8px;font-size:1.4rem;font-weight:800;">لا يوجد اتصال بالإنترنت</h2>
        <p style="color:#94A3B8;margin:0 0 24px;max-width:320px;line-height:1.7;">
          تأكد من تفعيل بيانات الجوال أو الواي فاي ثم اضغط على إعادة المحاولة لمتابعة استخدام تطبيق مدرك Plus.
        </p>
        <button id="offline-retry-btn" style="
          padding:0.85rem 2.4rem;border-radius:14px;border:none;
          background:linear-gradient(135deg,#22C55E,#16A34A);color:#fff;
          font-size:1rem;font-weight:700;font-family:Cairo,sans-serif;cursor:pointer;
          box-shadow:0 14px 30px -10px rgba(34,197,94,0.55);
        ">إعادة المحاولة</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const retryBtn = overlay.querySelector('#offline-retry-btn') as HTMLButtonElement | null;
    if (retryBtn) {
      retryBtn.addEventListener('click', async () => {
        try {
          const { Network } = await import('@capacitor/network');
          const status = await Network.getStatus();
          if (status.connected) {
            location.reload();
          }
        } catch {
          location.reload();
        }
      });
    }
  } else if (!show && overlay) {
    overlay.remove();
  }
}
