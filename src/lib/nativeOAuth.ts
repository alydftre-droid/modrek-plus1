/**
 * Native (Capacitor) OAuth flow.
 *
 * Strategy: request the provider authorize URL directly from Supabase,
 * open it داخل المتصفح المضمن، ثم نرجع إلى صفحة callback ويب على
 * `/oauth/native-callback` والتي تعيد التحويل إلى الرابط العميق للتطبيق.
 */

import { supabase } from "@/integrations/supabase/client";

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
const OAUTH_NATIVE_CALLBACK_URL = `${PUBLISHED_APP_URL}/oauth/native-callback`;
const TIMEOUT_MS = 180_000;
const CALLBACK_GRACE_MS = 1800;
const TOOLBAR_COLOR = "#0F172A";

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
  // The Browser plugin may be missing on older builds — fall back to system
  // browser via window.open so OAuth still works until the APK is rebuilt.
  let Browser: typeof import("@capacitor/browser").Browser | null = null;
  try {
    Browser = (await import("@capacitor/browser")).Browser;
  } catch {
    Browser = null;
  }
  const state = generateState();
  const callbackUrl = opts?.redirect_uri || OAUTH_NATIVE_CALLBACK_URL;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl,
      skipBrowserRedirect: true,
      queryParams: {
        prompt: "select_account",
        ...(opts?.extraParams || {}),
      },
    },
  });

  if (error || !data?.url) {
    return {
      error: error ?? new Error("تعذر بدء تسجيل Google"),
    };
  }

  return await new Promise<Result>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let browserCloseTimer: ReturnType<typeof setTimeout> | null = null;
    let urlListener: { remove: () => Promise<void> } | null = null;
    let browserFinishedListener: { remove: () => Promise<void> } | null = null;
    let receivedCallback = false;

    const finish = async (result: Result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (browserCloseTimer) clearTimeout(browserCloseTimer);
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
      if (Browser) {
        try {
          await Browser.close();
        } catch (cleanupError) {
          console.warn("native oauth browser close failed", cleanupError);
        }
      }
      resolve(result);
    };

    void (async () => {
      try {
      if (Browser) {
        browserFinishedListener = await Browser.addListener("browserFinished", async () => {
          if (receivedCallback || settled) return;

          if (browserCloseTimer) clearTimeout(browserCloseTimer);
          browserCloseTimer = setTimeout(() => {
            if (receivedCallback || settled) return;
            void finish({ error: new Error("تم إلغاء تسجيل الدخول بـ Google قبل اكتماله") });
          }, CALLBACK_GRACE_MS);
        });
      }

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

      if (Browser) {
        try {
          await Browser.open({
            url: data.url,
            toolbarColor: TOOLBAR_COLOR,
            presentationStyle: "fullscreen",
          });
        } catch (browserErr) {
          // Plugin not actually implemented on this device — fall back to
          // opening the URL in the system browser. The deep-link callback
          // listener above will still receive the tokens once Google redirects.
          console.warn("Browser plugin failed, falling back to window.open", browserErr);
          Browser = null;
          if (typeof window !== "undefined") {
            window.open(data.url, "_system");
          }
        }
      } else if (typeof window !== "undefined") {
        window.open(data.url, "_system");
      }
      } catch (e) {
        await finish({
          error: e instanceof Error ? e : new Error(String(e)),
        });
      }
    })();
  });
}
