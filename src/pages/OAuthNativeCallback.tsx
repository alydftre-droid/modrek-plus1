import { useEffect } from "react";

const DEEP_LINK_REDIRECT = "com.modrek.plus://oauth-callback";

const OAuthNativeCallback = () => {
  useEffect(() => {
    const query = window.location.search || "";
    const hash = window.location.hash || "";
    const target = `${DEEP_LINK_REDIRECT}${query}${hash}`;

    window.location.replace(target);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <div className="space-y-3">
        <h1 className="text-xl font-bold text-foreground">جارٍ إكمال تسجيل الدخول</h1>
        <p className="text-sm text-muted-foreground">سيتم إعادتك إلى التطبيق خلال لحظات…</p>
      </div>
    </main>
  );
};

export default OAuthNativeCallback;