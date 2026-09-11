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
}> {
  const result = { audio: false, video: false, blocked: false };
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) {
    result.blocked = true;
    return result;
  }
  const tryGet = async (constraints: MediaStreamConstraints) => {
    try {
      const stream = await md.getUserMedia(constraints);
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || err?.name === "SecurityError") result.blocked = true;
      return false;
    }
  };
  result.audio = await tryGet({ audio: true });
  result.video = await tryGet({ video: true });
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

/** Starts translating the Zoom Client View into Arabic (RTL). */
export function startZoomArabicLocalization() {
  const root = document.getElementById("zmmtg-root");
  if (!root || arObserver) return;
  root.setAttribute("dir", "rtl");
  root.style.fontFamily = "Cairo, system-ui, sans-serif";
  translateNode(root);
  arObserver = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach(translateNode);
      if (record.type === "characterData" && record.target) translateNode(record.target);
    }
  });
  arObserver.observe(root, { childList: true, subtree: true, characterData: true });
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
