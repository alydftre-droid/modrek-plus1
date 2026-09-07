// Zoom Meeting SDK (Client View) loader + Modrek authorization bridge.
// No Zoom secret ever reaches this file: the signature/ZAK are minted by the
// `zoom-live` edge function after it validates ownership/subscription.
import { supabase } from "@/integrations/supabase/client";

const ZOOM_SDK_VERSION = "3.13.2";
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
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

async function callZoomLive(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("zoom-live", { body });
  if (error) {
    // Edge errors still carry a JSON body with our Arabic message.
    let message = "تعذر الاتصال بخدمة البث";
    let code = "network_error";
    try {
      const ctx: any = (error as any).context;
      const parsed = ctx ? await ctx.json() : null;
      if (parsed?.error) message = parsed.error;
      if (parsed?.errorCode) code = parsed.errorCode;
    } catch {
      /* keep defaults */
    }
    throw new ZoomLiveError(message, code);
  }
  if (data?.error) throw new ZoomLiveError(data.error, data.errorCode || "unknown");
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

/** Shows/hides the Zoom Client View root without breaking the SPA layout. */
export function setZoomRootVisible(visible: boolean) {
  const root = document.getElementById("zmmtg-root");
  if (root) root.style.display = visible ? "block" : "none";
}
