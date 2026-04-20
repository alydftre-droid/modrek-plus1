/**
 * Native (Capacitor) OAuth flow.
 *
 * Strategy: use Supabase's own OAuth endpoint directly (no Lovable broker),
 * open it inside an in-app browser sheet (Custom Tabs on Android), and listen
 * for the `com.modrek.plus://oauth-callback` deep link to receive the tokens.
 *
 * This avoids the "project_id required" error from oauth.lovable.app and keeps
 * the user inside the application the entire time.
 */

import { supabase } from "@/integrations/supabase/client";

type Provider = "google" | "apple" | "microsoft";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type Tokens = { access_token: string; refresh_token: string };

type Result =
  | { tokens: Tokens; error: null }
  | { tokens?: undefined; error: Error };

const DEEP_LINK_REDIRECT = "com.modrek.plus://oauth-callback";
const TIMEOUT_MS = 180_000;

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

  // Ask Supabase for the provider URL but skip the automatic redirect so we
  // can open it ourselves inside the in-app browser.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: DEEP_LINK_REDIRECT,
      skipBrowserRedirect: true,
      queryParams: {
        prompt: "select_account",
        ...(opts?.extraParams || {}),
      },
    },
  });

  if (error || !data?.url) {
    return { error: error ?? new Error("لم يتم الحصول على رابط تسجيل الدخول") };
  }

  return await new Promise<Result>(async (resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let urlListener: { remove: () => Promise<void> } | null = null;

    const finish = async (result: Result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        await urlListener?.remove();
      } catch {}
      try {
        await Browser.close();
      } catch {}
      resolve(result);
    };

    try {
      urlListener = await App.addListener("appUrlOpen", async (event) => {
        const incoming = event?.url || "";
        if (!incoming.startsWith("com.modrek.plus://")) return;

        const parsed = parseTokensFromUrl(incoming);
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
        url: data.url,
        presentationStyle: "popover",
        windowName: "_self",
      });
    } catch (e) {
      await finish({
        error: e instanceof Error ? e : new Error(String(e)),
      });
    }
  });
}
