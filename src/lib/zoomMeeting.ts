// Zoom Meeting SDK (Client View) loader + Modrek authorization bridge.
// No Zoom secret ever reaches this file: the signature/ZAK are minted by the
// `zoom-live` edge function after it validates ownership/subscription.
import { supabase } from "@/integrations/supabase/client";

// Keep the browser SDK current. Zoom 3.x predates the 2026 meeting
// authorization requirements and can surface valid host credentials as a
// generic "Token error" on current Zoom infrastructure.
const ZOOM_SDK_VERSION = "6.2.0";
const ZOOM_CDN = `https://source.zoom.us/${ZOOM_SDK_VERSION}`;

export type ZoomJoinPayload = {
  provider: "zoom";
  session: any;
  sdkKey?: string;
  signature?: string;
  meetingNumber?: string;
  password?: string | null;
  zak?: string | null;
  role?: 0 | 1;
  userName?: string;
  canPublishAudio?: boolean;
  canPublishVideo?: boolean;
  reused?: boolean;
};

export class ZoomLiveError extends Error {
  code: string;
  diagnostic?: Record<string, unknown>;
  constructor(message: string, code: string, diagnostic?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.diagnostic = diagnostic;
  }
}

async function callZoomLive(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("zoom-live", { body });
  if (error) {
    // Edge errors still carry a JSON body with our Arabic message.
    let message = "تعذر الاتصال بخدمة البث";
    let code = "network_error";
    let diagnostic: Record<string, unknown> | undefined;
    try {
      const ctx: any = (error as any).context;
      const parsed = ctx ? await ctx.json() : null;
      if (parsed?.error) message = parsed.error;
      if (parsed?.errorCode) code = parsed.errorCode;
      diagnostic = parsed?.diagnostic;
    } catch {
      /* keep defaults */
    }
    throw new ZoomLiveError(message, code, diagnostic);
  }
  if (data?.error) throw new ZoomLiveError(data.error, data.errorCode || "unknown", data.diagnostic);
  return data;
}

export async function isZoomEnabled(): Promise<boolean> {
  try {
    const data = await callZoomLive({ action: "capabilities" });
    return Boolean(data?.zoomEnabled);
  } catch {
    return false;
  }
}

export function startZoomSession(input: {
  groupId: string;
  title: string;
  allowCamera?: boolean;
  allowMic?: boolean;
}): Promise<ZoomJoinPayload> {
  return callZoomLive({ action: "start", ...input });
}

export function joinZoomSession(sessionId: string): Promise<ZoomJoinPayload> {
  return callZoomLive({ action: "join", sessionId });
}

export function leaveZoomSession(sessionId: string) {
  return callZoomLive({ action: "leave", sessionId }).catch(() => null);
}

export function endZoomSession(sessionId: string) {
  return callZoomLive({ action: "end", sessionId });
}

export function reconcileZoomSession(sessionId: string): Promise<{ status: string; active: boolean }> {
  return callZoomLive({ action: "status", sessionId });
}

// ------------------------------------------------------------------ SDK loader
let sdkPromise: Promise<any> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new ZoomLiveError("فشل تحميل مكتبة Zoom", "sdk_load_failed"));
    document.head.appendChild(el);
  });
}

function loadStyle(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const el = document.createElement("link");
  el.rel = "stylesheet";
  el.href = href;
  document.head.appendChild(el);
}

export function loadZoomSdk(): Promise<any> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = (async () => {
    loadStyle(`${ZOOM_CDN}/css/bootstrap.css`);
    loadStyle(`${ZOOM_CDN}/css/react-select.css`);
    await loadScript(`${ZOOM_CDN}/lib/vendor/react.min.js`);
    await loadScript(`${ZOOM_CDN}/lib/vendor/react-dom.min.js`);
    await loadScript(`${ZOOM_CDN}/lib/vendor/redux.min.js`);
    await loadScript(`${ZOOM_CDN}/lib/vendor/redux-thunk.min.js`);
    await loadScript(`${ZOOM_CDN}/zoom-meeting-${ZOOM_SDK_VERSION}.min.js`);
    const ZoomMtg = (window as any).ZoomMtg;
    if (!ZoomMtg) throw new ZoomLiveError("فشل تحميل مكتبة Zoom", "sdk_load_failed");
    ZoomMtg.setZoomJSLib(`${ZOOM_CDN}/lib`, "/av");
    ZoomMtg.preLoadWasm();
    ZoomMtg.prepareWebSDK();
    try {
      ZoomMtg.i18n.load("ar-SA");
    } catch {
      /* Arabic pack is optional */
    }
    return ZoomMtg;
  })().catch((error) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}

/**
 * Ask the browser for mic/camera BEFORE Zoom initialises. Zoom's own request is
 * fired from inside its worker context and Chrome on Android often blocks it
 * silently ("Your browser is preventing access to your microphone").
 */
export async function requestZoomMediaPermissions(): Promise<{
  audio: boolean;
  video: boolean;
  blocked: boolean;
  reason?: string;
}> {
  const result: { audio: boolean; video: boolean; blocked: boolean; reason?: string } = {
    audio: false,
    video: false,
    blocked: false,
  };
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) {
    result.blocked = true;
    result.reason = "media_devices_unavailable";
    return result;
  }

  const requestWithTimeout = async (constraints: MediaStreamConstraints) => {
    let timer: number | undefined;
    try {
      const stream = await Promise.race([
        md.getUserMedia(constraints),
        new Promise<never>((_, reject) => {
          timer = window.setTimeout(
            () => reject(new DOMException("انتهت مهلة طلب الإذن", "TimeoutError")),
            30000,
          );
        }),
      ]);
      stream.getTracks().forEach((t) => t.stop());
      return { ok: true, errorName: "" };
    } catch (error: unknown) {
      const errorName = error instanceof DOMException || error instanceof Error ? error.name : "UnknownError";
      return { ok: false, errorName };
    } finally {
      if (timer !== undefined) window.clearTimeout(timer);
    }
  };

  // A single request is intentional: because this function is called directly
  // by a visible button, Chrome/Android can show one native permission prompt.
  const combined = await requestWithTimeout({ audio: true, video: true });
  if (combined.ok) {
    result.audio = true;
    result.video = true;
    return result;
  }

  result.reason = combined.errorName;
  if (combined.errorName === "NotAllowedError" || combined.errorName === "SecurityError") {
    result.blocked = true;
    return result;
  }

  // A missing/busy camera must not prevent a teacher or student from joining
  // with audio. This second request only runs after a non-permission camera error.
  const audioOnly = await requestWithTimeout({ audio: true });
  result.audio = audioOnly.ok;
  result.video = false;
  result.reason = audioOnly.ok ? combined.errorName : audioOnly.errorName;
  result.blocked = audioOnly.errorName === "NotAllowedError" || audioOnly.errorName === "SecurityError";
  return result;
}

// ------------------------------------------------------- Arabic UI localisation
// The Zoom Web SDK ships no Arabic language pack, so its buttons stay in English.
// We translate the visible labels/tooltips inside #zmmtg-root only.
const ZOOM_AR_LABELS: Record<string, string> = {
  Join: "انضمام",
  "Join Meeting": "انضمام للاجتماع",
  "Join Audio": "تشغيل الصوت",
  "Join Audio by Computer": "تشغيل صوت الجهاز",
  "Audio Settings": "إعدادات الصوت",
  Audio: "الصوت",
  Mute: "كتم",
  Unmute: "إلغاء الكتم",
  Video: "الفيديو",
  "Start Video": "تشغيل الكاميرا",
  "Stop Video": "إيقاف الكاميرا",
  Participants: "المشاركون",
  Chat: "المحادثة",
  Share: "مشاركة",
  "Share Screen": "مشاركة الشاشة",
  "Stop Share": "إيقاف المشاركة",
  Record: "تسجيل",
  More: "المزيد",
  Leave: "خروج",
  "Leave Meeting": "الخروج من الاجتماع",
  End: "إنهاء",
  "End Meeting": "إنهاء الاجتماع",
  "End Meeting for All": "إنهاء الاجتماع للجميع",
  Cancel: "إلغاء",
  Continue: "متابعة",
  "Continue without audio or video": "متابعة بدون صوت أو كاميرا",
  "Are you sure you don't want audio or video?": "هل تريد المتابعة بدون صوت أو كاميرا؟",
  "You can still turn on your microphone and camera anytime in the meeting":
    "يمكنك تشغيل الميكروفون والكاميرا في أي وقت داخل الحصة",
  "Learn more": "معرفة المزيد",
  "Your browser is preventing access to your microphone.":
    "المتصفح يمنع الوصول إلى الميكروفون. اسمح بالوصول من إعدادات الموقع ثم أعد المحاولة.",
  "Your browser is preventing access to your camera.":
    "المتصفح يمنع الوصول إلى الكاميرا. اسمح بالوصول من إعدادات الموقع ثم أعد المحاولة.",
  "Waiting for the host to start this meeting": "في انتظار بدء المعلم للحصة",
  "Connecting...": "جاري الاتصال...",
  "Joining Meeting...": "جاري الانضمام...",
  "Joining Meeting Timeout or Browser restriction": "تعذر الانضمام للاجتماع",
  "Token error": "رمز دخول الاجتماع غير صالح",
  Retry: "إعادة المحاولة",
  OK: "حسنًا",
  "Send Report": "إرسال تقرير",
  "Raise Hand": "رفع اليد",
  Reactions: "التفاعلات",
  Apps: "التطبيقات",
  "Meeting Info": "معلومات الحصة",
  "Meeting settings": "إعدادات الحصة",
  "Security": "الأمان",
  "Invite": "دعوة",
  "Close": "إغلاق",
  "Send": "إرسال",
  "Everyone": "الجميع",
  "Host": "المعلم",
  "Lower Hand": "خفض اليد",
  "Ask to Unmute": "طلب فتح الميكروفون",
  "Mute All": "كتم الجميع",
  "Unmute All": "فتح صوت الجميع",
  "Privacy & Legal Policies": "سياسة الخصوصية والشروط",
};

let arObserver: MutationObserver | null = null;

function translateNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const raw = node.nodeValue || "";
    const key = raw.trim();
    if (key && ZOOM_AR_LABELS[key]) node.nodeValue = raw.replace(key, ZOOM_AR_LABELS[key]);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const aria = el.getAttribute?.("aria-label");
  if (aria && ZOOM_AR_LABELS[aria.trim()]) el.setAttribute("aria-label", ZOOM_AR_LABELS[aria.trim()]);
  const title = el.getAttribute?.("title");
  if (title && ZOOM_AR_LABELS[title.trim()]) el.setAttribute("title", ZOOM_AR_LABELS[title.trim()]);
  node.childNodes.forEach(translateNode);
}

const ZOOM_UI_FIX_STYLE_ID = "modrek-zoom-ui-fix";

/**
 * Zoom's Client View positions its toolbar pop-ups ("More", audio/video menus,
 * share dialogs) with absolute LTR offsets and renders some of them into
 * document.body. Forcing RTL on the root pushed those menus off-screen, which
 * made the "More" button look dead. We keep Zoom's own layout LTR and only
 * raise its menus above the SDK root so every tool stays reachable.
 */
function injectZoomUiFix() {
  if (document.getElementById(ZOOM_UI_FIX_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = ZOOM_UI_FIX_STYLE_ID;
  style.textContent = `
    #zmmtg-root { direction: ltr !important; }
    /* Zoom renders the "More" menu and its tool pop-ups into document.body,
       OUTSIDE #zmmtg-root. Scoping the fix to the root left them stacked
       behind the SDK root (z-index 9999), so the button looked dead.
       These rules are intentionally global. */
    .zm-dropdown-menu,
    .dropdown-menu,
    [class*="pop-menu"],
    [class*="popover"],
    [class*="zm-tooltip"],
    [class*="more-button__pop-menu"],
    [class*="footer-button__pop-menu"],
    [id*="pop-menu"],
    [role="menu"],
    [role="listbox"] {
      z-index: 2147483000 !important;
      pointer-events: auto !important;
      max-height: 70vh;
      overflow-y: auto;
      direction: ltr;
      visibility: visible !important;
    }
    .zm-modal, .zmu-modal, .ReactModalPortal, .zm-new-modal, [class*="zm-modal"] {
      z-index: 2147483001 !important;
    }
    /* Keep pop-ups from being clipped by Zoom's own footer containers. */
    #zmmtg-root .footer, #zmmtg-root [class*="footer__"], #zmmtg-root [class*="footer-button"] {
      overflow: visible !important;
    }
    #zmmtg-root .footer-button__button,
    #zmmtg-root .footer-button-base__button,
    #zmmtg-root [class*="more-button"] {
      pointer-events: auto !important;
      touch-action: manipulation;
    }
    #zmmtg-root .footer {
      z-index: 10002 !important;
    }
    @media (max-width: 767px) {
      .zm-dropdown-menu, .dropdown-menu, [role="menu"], [class*="pop-menu"] {
        max-width: calc(100vw - 16px) !important;
      }
    }
  `;
  document.head.appendChild(style);
}

/** Starts translating the Zoom Client View labels into Arabic. */
export function startZoomArabicLocalization() {
  const root = document.getElementById("zmmtg-root");
  if (!root || arObserver) return;
  injectZoomUiFix();
  // Zoom's own layout must stay LTR: its menus are positioned with left offsets.
  root.setAttribute("dir", "ltr");
  root.style.fontFamily = "Cairo, system-ui, sans-serif";
  translateNode(root);
  arObserver = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach(translateNode);
      if (record.type === "characterData" && record.target) translateNode(record.target);
    }
  });
  // Zoom portals its More menu and dialogs directly under body, outside root.
  arObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}

export function stopZoomArabicLocalization() {
  arObserver?.disconnect();
  arObserver = null;
}

/** Shows/hides the Zoom Client View root without breaking the SPA layout. */
export function setZoomRootVisible(visible: boolean) {
  const root = document.getElementById("zmmtg-root");
  if (!root) return;
  root.style.display = visible ? "block" : "none";
  if (visible) {
    // The Zoom Client View must sit above every Modrek overlay, otherwise its
    // pre-join / permission dialogs are unreachable and the user waits forever.
    root.style.position = "fixed";
    root.style.inset = "0";
    root.style.zIndex = "9999";
  }
}
