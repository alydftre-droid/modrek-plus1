import { forwardRef, useEffect, useMemo, useState } from "react";

const DEEP_LINK_SCHEME = "com.modrek.plus";
const DEEP_LINK_HOST = "oauth-callback";
const DEEP_LINK_REDIRECT = `${DEEP_LINK_SCHEME}://${DEEP_LINK_HOST}`;

/**
 * Native OAuth return page.
 *
 * After Supabase finishes the OAuth exchange and redirects here (in Chrome
 * Custom Tabs OR the external browser), we forward the tokens — carried in
 * the URL hash/query — back into the Android app via a custom-scheme deep
 * link. The AndroidManifest registers an intent-filter for
 * `com.modrek.plus://oauth-callback`, so the OS will bring the app back to
 * the foreground and Capacitor's `App.appUrlOpen` listener will parse the
 * tokens and complete sign-in inside the app.
 *
 * Important: some browsers (notably Chrome on Android in standalone mode)
 * block automatic JS-triggered custom-scheme navigation. We therefore:
 *   1) Attempt automatic redirect via `location.replace`.
 *   2) After a short delay, also try the Android `intent://` URL.
 *   3) Always expose a large visible button so the user can tap to return
 *      to the app manually as a last resort.
 */
const OAuthNativeCallback = forwardRef<HTMLElement>(function OAuthNativeCallback(_, ref) {
  const [showManual, setShowManual] = useState(false);

  const { deepLink, intentLink } = useMemo(() => {
    const query = typeof window !== "undefined" ? window.location.search || "" : "";
    const hash = typeof window !== "undefined" ? window.location.hash || "" : "";
    const tail = `${query}${hash}`;
    const deepLink = `${DEEP_LINK_REDIRECT}${tail}`;
    // Android Chrome intent:// fallback (forces app open if installed)
    const intentTail = tail.replace(/^#/, "?").replace(/^\?/, "?");
    const intentLink = `intent://${DEEP_LINK_HOST}${intentTail}#Intent;scheme=${DEEP_LINK_SCHEME};package=com.modrek.plus;end`;
    return { deepLink, intentLink };
  }, []);

  useEffect(() => {
    // First attempt: direct custom-scheme redirect (works in Custom Tabs).
    try {
      window.location.replace(deepLink);
    } catch {
      /* noop */
    }

    // Second attempt after 800ms: intent:// for Android Chrome.
    const intentTimer = window.setTimeout(() => {
      if (/Android/i.test(navigator.userAgent)) {
        try {
          window.location.href = intentLink;
        } catch {
          /* noop */
        }
      }
    }, 800);

    // Show manual button if we are still here after 2s.
    const manualTimer = window.setTimeout(() => setShowManual(true), 2000);

    return () => {
      window.clearTimeout(intentTimer);
      window.clearTimeout(manualTimer);
    };
  }, [deepLink, intentLink]);

  return (
    <main
      ref={ref}
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center"
    >
      <div className="w-full max-w-sm space-y-5">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">جارٍ إكمال تسجيل الدخول</h1>
          <p className="text-sm text-muted-foreground">
            سيتم إعادتك إلى تطبيق مدرك Plus خلال لحظات…
          </p>
        </div>

        {showManual && (
          <div className="space-y-3 rounded-2xl border border-border bg-card/60 p-4 backdrop-blur">
            <p className="text-sm text-foreground">
              لم يفتح التطبيق تلقائياً؟ اضغط الزر التالي للعودة إلى التطبيق.
            </p>
            <a
              href={deepLink}
              className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-base font-bold text-primary-foreground shadow-md"
            >
              العودة إلى تطبيق مدرك Plus
            </a>
            <a
              href={intentLink}
              className="block text-xs text-muted-foreground underline"
            >
              فتح بديل عبر Android Intent
            </a>
          </div>
        )}
      </div>
    </main>
  );
});

export default OAuthNativeCallback;
