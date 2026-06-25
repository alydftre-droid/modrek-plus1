/**
 * Initialize Capacitor plugins when running as a native app.
 * Called once from main.tsx. No-op on web.
 */
import { enforceCanonicalRuntimeOrigin } from "@/lib/supabaseRuntimeGuard";
import { processSupabaseOAuthCallback } from "@/lib/processSupabaseOAuthCallback";

export async function initCapacitor() {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;

    document.documentElement.setAttribute('data-native-app', 'true');
    document.body.setAttribute('data-native-app', 'true');
    enforceCanonicalRuntimeOrigin();
    syncNativeViewportMetrics();
    installNativeDraftPersistence();
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
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          window.dispatchEvent(new CustomEvent('modrek:save-page-state'));
        }
      });
      App.addListener('appUrlOpen', async ({ url }) => {
        if (!url || !url.includes('/auth/callback')) return;
        try {
          const result = await processSupabaseOAuthCallback('native_app_url_open', url);
          if (result.handled) {
            try {
              const { Browser } = await import('@capacitor/browser');
              await Browser.close();
            } catch {}
            window.dispatchEvent(new CustomEvent('modrek:oauth-callback-processed', { detail: result }));
            if (result.session?.user) {
              window.location.replace(result.session.user.email?.trim().toLowerCase() === 'aliana200713@gmail.com' ? '/admin' : '/dashboard');
            }
          }
        } catch (error) {
          console.error('[capacitor] native oauth callback failed', error);
        }
      });
    } catch {}

    // Network – show/hide offline overlay without forcing a full app reload
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

    // Android IME composition fix:
    // On Android WebView, the user's last word can be dropped when they tap a
    // submit/send button without first pressing space. The button's pointerdown
    // fires before the IME commits the composing text into the input's value,
    // so React reads stale state. We intercept pointerdown in the capture phase
    // on any button/anchor — if focus is on an editable element, we blur it to
    // force the IME to commit the composition into the value before the click
    // handler runs, then refocus so the keyboard stays open.
    try {
      const flushIme = (e: Event) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const trigger = target.closest('button, [role="button"], a, [data-flush-ime]') as HTMLElement | null;
        if (!trigger) return;
        const active = document.activeElement as HTMLElement | null;
        if (!active) return;
        const isEditable =
          active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable;
        if (!isEditable || active === trigger) return;
        // Blur to commit the composing text; React's onChange will fire with
        // the final value synchronously before the click handler runs.
        active.blur();
      };
      document.addEventListener('pointerdown', flushIme, true);
      document.addEventListener('mousedown', flushIme, true);
      document.addEventListener('touchstart', flushIme, { capture: true, passive: true });
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
        position:fixed;right:14px;left:14px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:99999;
        display:flex;align-items:center;gap:14px;
        background:rgba(15,23,42,.94);backdrop-filter:blur(14px);
        color:#fff;font-family:Cairo,sans-serif;text-align:right;padding:14px 16px;border-radius:20px;
        box-shadow:0 24px 50px -20px rgba(15,23,42,.65);border:1px solid rgba(255,255,255,.08);
      ">
        <div style="
          width:56px;height:56px;border-radius:18px;background:#0B1224;
          display:flex;align-items:center;justify-content:center;margin-bottom:24px;
          box-shadow:0 24px 60px -20px rgba(34,197,94,0.45),inset 0 0 0 1px rgba(255,255,255,0.06);
          position:relative;overflow:hidden;
          flex-shrink:0;margin-bottom:0;
        ">
          <div style="
            position:absolute;inset:-30%;border-radius:50%;
            background:radial-gradient(circle,rgba(34,197,94,0.25) 0%,transparent 65%);
            filter:blur(8px);
          "></div>
          <img src="/modrek-brand-symbol.png" alt="مدرك Plus"
            style="width:36px;height:36px;object-fit:contain;position:relative;z-index:1;"
            onerror="this.style.display='none'" />
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;min-width:0;flex:1;">
          <div style="display:flex;align-items:center;gap:8px;color:#FCA5A5;font-size:.8rem;font-weight:700;">
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
          <div style="font-size:.92rem;font-weight:800;line-height:1.4;">التطبيق سيظل يعمل بالبيانات المحفوظة مؤقتاً</div>
          <div style="color:#94A3B8;font-size:.78rem;line-height:1.6;">بمجرد عودة الاتصال سنحدّث البيانات تلقائياً بدون إعادة تحميل مزعجة.</div>
        </div>
        <button id="offline-retry-btn" style="
          padding:.8rem 1rem;border-radius:14px;border:none;
          background:linear-gradient(135deg,#22C55E,#16A34A);color:#fff;
          font-size:.85rem;font-weight:800;font-family:Cairo,sans-serif;cursor:pointer;
          box-shadow:0 14px 30px -10px rgba(34,197,94,0.55);flex-shrink:0;
        ">تحديث</button>
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
            window.dispatchEvent(new CustomEvent('modrek:network-restored'));
            toggleOfflineOverlay(false);
          }
        } catch {
          window.dispatchEvent(new CustomEvent('modrek:network-restored'));
          toggleOfflineOverlay(false);
        }
      });
    }
  } else if (!show && overlay) {
    overlay.remove();
  }
}

function installNativeDraftPersistence() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const getDraftKey = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
    const id = el.getAttribute('name') || el.id || el.getAttribute('aria-label') || '';
    if (!id) return null;
    return `native-draft:${window.location.pathname}:${id}`;
  };

  const isPersistable = (target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return false;
    if (target instanceof HTMLInputElement && ['password', 'file', 'hidden', 'checkbox', 'radio'].includes(target.type)) return false;
    const readOnly = target instanceof HTMLSelectElement ? false : target.readOnly;
    return !target.disabled && !readOnly;
  };

  const saveTarget = (target: EventTarget | null) => {
    if (!isPersistable(target)) return;
    const key = getDraftKey(target);
    if (!key) return;
    try {
      if (target.value) window.localStorage.setItem(key, target.value);
      else window.localStorage.removeItem(key);
    } catch {}
  };

  const restoreTarget = (target: EventTarget | null) => {
    if (!isPersistable(target) || target.value) return;
    const key = getDraftKey(target);
    if (!key) return;
    try {
      const saved = window.localStorage.getItem(key);
      if (!saved) return;
      target.value = saved;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {}
  };

  document.addEventListener('input', (event) => saveTarget(event.target), true);
  document.addEventListener('change', (event) => saveTarget(event.target), true);
  document.addEventListener('focusin', (event) => restoreTarget(event.target), true);
  window.addEventListener('modrek:save-page-state', () => {
    document.querySelectorAll('input, textarea, select').forEach((el) => saveTarget(el));
  });
}
