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
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }

    // Back button – navigate browser history or exit
    try {
      const { App } = await import('@capacitor/app');
      App.addListener('backButton', ({ canGoBack }) => {
        const path = window.location.pathname;
        const safeExitPaths = new Set(['/', '/auth']);
        if (path === '/auth/callback') {
          window.history.replaceState({}, '', '/');
          return;
        }
        if (canGoBack && !safeExitPaths.has(path)) {
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
        if (!url || (!url.includes('/auth/callback') && !url.includes('/oauth/native-callback'))) return;
        try {
          const result = await processSupabaseOAuthCallback('native_app_url_open', url);
          if (result.handled) {
            try {
              const { Browser } = await import('@capacitor/browser');
              await Browser.close();
            } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
            window.dispatchEvent(new CustomEvent('modrek:oauth-callback-processed', { detail: result }));
            if (result.session?.user) {
              window.location.replace(result.session.user.email?.trim().toLowerCase() === 'aliana200713@gmail.com' ? '/admin' : '/dashboard');
            }
          }
        } catch (error) {
          console.error('[capacitor] native oauth callback failed', error);
        }
      });
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }

    // Network – show/hide offline overlay without forcing a full app reload
    try {
      const { Network } = await import('@capacitor/network');
      Network.addListener('networkStatusChange', (status) => {
        toggleOfflineOverlay(!status.connected);
      });
      const status = await Network.getStatus();
      toggleOfflineOverlay(!status.connected);
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }

    // Keyboard – resize body so inputs aren't hidden
    try {
      const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
      await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
      await Keyboard.setScroll({ isDisabled: false });
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }

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
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }


    // Hide native splash quickly — in-app splash takes over
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      setTimeout(() => SplashScreen.hide(), 180);
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }

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

const OFFLINE_DISMISS_KEY = 'modrek:offline-banner-dismissed-at';

function ensureBannerStyles() {
  if (document.getElementById('offline-banner-styles')) return;
  const style = document.createElement('style');
  style.id = 'offline-banner-styles';
  style.textContent = `
    #offline-banner, #online-toast {
      position: fixed; left: 12px; right: 12px; z-index: 99999;
      font-family: Cairo, system-ui, sans-serif; direction: rtl;
      border-radius: 14px; padding: 8px 14px;
      display: flex; align-items: center; gap: 10px;
      box-shadow: 0 10px 30px -12px rgba(0,0,0,.45);
      backdrop-filter: blur(14px);
      transform: translateY(-120%); opacity: 0;
      transition: transform .35s cubic-bezier(.2,.9,.3,1), opacity .35s;
      pointer-events: auto;
    }
    #offline-banner { top: calc(env(safe-area-inset-top, 0px) + 8px);
      background: rgba(15,23,42,.92); color: #fff;
      border: 1px solid rgba(255,255,255,.08); }
    #online-toast { top: calc(env(safe-area-inset-top, 0px) + 8px);
      background: rgba(22,163,74,.95); color: #fff;
      border: 1px solid rgba(255,255,255,.15); justify-content: center;
      font-weight: 700; font-size: .82rem; }
    #offline-banner.visible, #online-toast.visible { transform: translateY(0); opacity: 1; }
    #offline-banner .ob-text { flex: 1; font-size: .78rem; line-height: 1.35; font-weight: 700; }
    #offline-banner .ob-text small { display:block; font-weight: 500; opacity: .75; font-size: .7rem; margin-top: 2px; }
    #offline-banner .ob-close {
      background: transparent; border: none; color: rgba(255,255,255,.7);
      width: 28px; height: 28px; border-radius: 8px; cursor: pointer;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    #offline-banner .ob-close:hover { background: rgba(255,255,255,.08); color:#fff; }
    #offline-banner .ob-icon {
      width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0;
      background: rgba(239,68,68,.15); color: #fca5a5;
      display:flex; align-items:center; justify-content:center;
    }
  `;
  document.head.appendChild(style);
}

function showOnlineToast() {
  ensureBannerStyles();
  const existing = document.getElementById('online-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'online-toast';
  toast.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    <span>تمت إعادة الاتصال</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 2200);
}

function toggleOfflineOverlay(show: boolean) {
  ensureBannerStyles();
  const existing = document.getElementById('offline-banner');

  if (show) {
    // Respect recent dismissal (10 min) so it doesn't nag the user
    try {
      const dismissedAt = Number(sessionStorage.getItem(OFFLINE_DISMISS_KEY) || '0');
      if (Date.now() - dismissedAt < 10 * 60 * 1000) return;
    } catch { /* ignore */ }

    if (existing) return;
    const banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.innerHTML = `
      <div class="ob-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"/>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
          <line x1="12" y1="20" x2="12.01" y2="20"/>
        </svg>
      </div>
      <div class="ob-text">أنت غير متصل بالإنترنت<small>يتم استخدام البيانات المحفوظة</small></div>
      <button class="ob-close" aria-label="إغلاق">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('visible'));

    const dismiss = () => {
      try { sessionStorage.setItem(OFFLINE_DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
      banner.classList.remove('visible');
      setTimeout(() => banner.remove(), 400);
    };

    banner.querySelector('.ob-close')?.addEventListener('click', dismiss);

    // Swipe up to dismiss
    let startY = 0;
    banner.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
    banner.addEventListener('touchmove', (e) => {
      const dy = e.touches[0].clientY - startY;
      if (dy < -30) dismiss();
    }, { passive: true });
  } else if (existing) {
    existing.classList.remove('visible');
    setTimeout(() => existing.remove(), 400);
    try { sessionStorage.removeItem(OFFLINE_DISMISS_KEY); } catch { /* ignore */ }
    showOnlineToast();
    window.dispatchEvent(new CustomEvent('modrek:network-restored'));
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
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
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
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
  };

  document.addEventListener('input', (event) => saveTarget(event.target), true);
  document.addEventListener('change', (event) => saveTarget(event.target), true);
  document.addEventListener('focusin', (event) => restoreTarget(event.target), true);
  window.addEventListener('modrek:save-page-state', () => {
    document.querySelectorAll('input, textarea, select').forEach((el) => saveTarget(el));
  });
}
