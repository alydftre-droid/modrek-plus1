/**
 * Native (Capacitor) OAuth flow.
 *
 * Strategy: open Lovable Cloud's managed OAuth route inside an in-app browser
 * sheet, then return مباشرةً إلى التطبيق عبر الرابط العميق
 * `com.modrek.plus://oauth-callback` مباشرةً بدون المرور بصفحة ويب وسيطة.
 *
 * هذا يمنع بقاء المستخدم داخل المتصفح المضمن بعد نجاح Google OAuth،
 * وهو السبب الرئيسي لرجوعه إلى صفحة /auth بدل استعادة الجلسة داخل التطبيق.
 */

type Provider = "google" | "apple" | "azure";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type Tokens = { access_token: string; refresh_token: string };

type Result =
  | { tokens: Tokens; error: null }
  | { tokens?: undefined; error: Error };

const DEEP_LINK_REDIRECT = "com.modrek.plus://oauth-callback";
const PUBLISHED_APP_URL = "https://modrekplus.com";
const OAUTH_INITIATE_URL = `${PUBLISHED_APP_URL}/~oauth/initiate`;
const OAUTH_NATIVE_CALLBACK_URL = DEEP_LINK_REDIRECT;
const TIMEOUT_MS = 180_000;

function generateState() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function parseTokensFromUrl(url: string): {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
} {
  try {
    const u = new URL(url);
    const fromHash = new URLSearchParams(u.hash.replace(/^#/, ""));
    const fromSearch = u.searchParams;
    const get = (k: string) => fromHash.get(k) || fromSearch.get(k) || undefined;
    return {
      access_token: get("access_token"),
      refresh_token: get("refresh_token"),
      error: get("error"),
      error_description: get("error_description"),
    };
  } catch {
    return {};
  }
}

export async function signInWithOAuthNative(
  provider: Provider,
  opts?: SignInOptions,
): Promise<Result> {
  const { App } = await import("@capacitor/app");
  const { Browser } = await import("@capacitor/browser");
  const state = generateState();
  const authUrl = new URL(OAUTH_INITIATE_URL);
  const callbackUrl = opts?.redirect_uri || OAUTH_NATIVE_CALLBACK_URL;

  authUrl.searchParams.set("provider", provider);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("state", state);

  Object.entries(opts?.extraParams || {}).forEach(([key, value]) => {
    authUrl.searchParams.set(key, value);
  });

  return await new Promise<Result>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let urlListener: { remove: () => Promise<void> } | null = null;
    let browserFinishedListener: { remove: () => Promise<void> } | null = null;
    let receivedCallback = false;

    const finish = async (result: Result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        await urlListener?.remove();
      } catch (cleanupError) {
        console.warn("native oauth url listener cleanup failed", cleanupError);
      }
      try {
        await browserFinishedListener?.remove();
      } catch (cleanupError) {
        console.warn("native oauth browser listener cleanup failed", cleanupError);
      }
      try {
        await Browser.close();
      } catch (cleanupError) {
        console.warn("native oauth browser close failed", cleanupError);
      }
      resolve(result);
    };

    void (async () => {
      try {
      browserFinishedListener = await Browser.addListener("browserFinished", async () => {
        if (receivedCallback || settled) return;
        await finish({ error: new Error("تم إلغاء تسجيل الدخول بـ Google قبل اكتماله") });
      });

      urlListener = await App.addListener("appUrlOpen", async (event) => {
        const incoming = event?.url || "";
        if (!incoming.startsWith(DEEP_LINK_REDIRECT)) return;
        receivedCallback = true;

        const parsed = parseTokensFromUrl(incoming);
        const incomingState = (() => {
          try {
            const u = new URL(incoming);
            const params = u.hash ? new URLSearchParams(u.hash.replace(/^#/, "")) : u.searchParams;
            return params.get("state");
          } catch {
            return null;
          }
        })();

        if (incomingState && incomingState !== state) {
          await finish({ error: new Error("تعذر التحقق من جلسة Google") });
          return;
        }

        if (parsed.error) {
          await finish({ error: new Error(parsed.error_description || parsed.error) });
          return;
        }
        if (!parsed.access_token || !parsed.refresh_token) {
          await finish({ error: new Error("لم يتم استلام رموز الجلسة") });
          return;
        }
        await finish({
          tokens: {
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token,
          },
          error: null,
        });
      });

      timer = setTimeout(() => {
        finish({ error: new Error("انتهت مهلة تسجيل الدخول") });
      }, TIMEOUT_MS);

      await Browser.open({
        url: authUrl.toString(),
        presentationStyle: "fullscreen",
      });
      } catch (e) {
        await finish({
          error: e instanceof Error ? e : new Error(String(e)),
        });
      }
    })();
  });
}
