/**
 * Native (Capacitor) OAuth flow for Lovable Cloud managed providers.
 *
 * The standard `lovable.auth.signInWithOAuth` does `window.location.href = ...`
 * which makes the WebView jump to `oauth.lovable.app` — that's why users were
 * being kicked out of the app to a browser-looking page.
 *
 * Here we open the broker URL inside an in-app browser sheet (Custom Tabs on
 * Android), and listen for the `lovable://oauth-callback` deep link to receive
 * the tokens. The user stays inside the app the whole time and gets the real
 * Google account picker.
 */

type Provider = "google" | "apple" | "microsoft";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type Tokens = { access_token: string; refresh_token: string };

type Result =
  | { tokens: Tokens; error: null }
  | { tokens?: undefined; error: Error };

const BROKER_URL = "https://oauth.lovable.app/initiate";
const LOVABLE_PROJECT_ID = "453253b0-711a-45e1-9dde-ff3264179774";
const DEEP_LINK_REDIRECT = "com.modrek.plus://oauth-callback";
const TIMEOUT_MS = 120_000;

function generateState(): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function parseTokensFromUrl(url: string): {
  access_token?: string;
  refresh_token?: string;
  state?: string;
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
      state: get("state"),
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
  const params = new URLSearchParams({
    ...(opts?.extraParams || {}),
    provider,
    project_id: LOVABLE_PROJECT_ID,
    redirect_uri: DEEP_LINK_REDIRECT,
    state,
  });
  const url = `${BROKER_URL}?${params.toString()}`;

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
        if (!incoming.startsWith("com.modrek.plus://") && !incoming.includes("oauth-callback")) {
          return;
        }
        const parsed = parseTokensFromUrl(incoming);
        if (parsed.error) {
          await finish({ error: new Error(parsed.error_description || parsed.error) });
          return;
        }
        if (parsed.state && parsed.state !== state) {
          await finish({ error: new Error("State is invalid") });
          return;
        }
        if (!parsed.access_token || !parsed.refresh_token) {
          await finish({ error: new Error("No tokens received") });
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
        finish({ error: new Error("OAuth timed out") });
      }, TIMEOUT_MS);

      await Browser.open({
        url,
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