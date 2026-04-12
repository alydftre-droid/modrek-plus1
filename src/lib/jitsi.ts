export type JitsiApi = {
  addListener: (event: string, listener: (payload?: any) => void) => void;
  executeCommand: (command: string, ...args: any[]) => void;
  dispose: () => void;
  getNumberOfParticipants?: () => Promise<number> | number;
};

type JitsiApiConstructorOptions = {
  roomName: string;
  parentNode: HTMLElement;
  width?: string | number;
  height?: string | number;
  lang?: string;
  userInfo?: {
    displayName?: string;
  };
  configOverwrite?: Record<string, unknown>;
  interfaceConfigOverwrite?: Record<string, unknown>;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: JitsiApiConstructorOptions) => JitsiApi;
  }
}

const JITSI_DOMAIN = "meet.jit.si";
const JITSI_SCRIPT_SRC = `https://${JITSI_DOMAIN}/external_api.js`;

let jitsiScriptPromise: Promise<void> | null = null;

export function getJitsiMeetingUrl(roomName: string) {
  return `https://${JITSI_DOMAIN}/${roomName}`;
}

export async function loadJitsiApiScript() {
  if (typeof window === "undefined") return;
  if (window.JitsiMeetExternalAPI) return;

  if (!jitsiScriptPromise) {
    jitsiScriptPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${JITSI_SCRIPT_SRC}"]`);

      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("تعذر تحميل خدمة البث")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = JITSI_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("تعذر تحميل خدمة البث"));
      document.body.appendChild(script);
    });
  }

  await jitsiScriptPromise;
}

export async function createJitsiApi(options: JitsiApiConstructorOptions) {
  await loadJitsiApiScript();

  if (!window.JitsiMeetExternalAPI) {
    throw new Error("خدمة البث غير متاحة حاليًا");
  }

  return new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
    width: "100%",
    height: "100%",
    lang: "ar",
    ...options,
  });
}