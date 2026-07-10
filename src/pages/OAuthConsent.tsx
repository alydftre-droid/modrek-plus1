import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Minimal typed wrapper for the beta supabase.auth.oauth namespace.
type OAuthClient = { name?: string; client_name?: string; redirect_uris?: string[] };
type OAuthDetails = {
  client?: OAuthClient;
  scopes?: string[];
  requested_scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthMethod = (id: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
type AuthOAuth = {
  getAuthorizationDetails: OAuthMethod;
  approveAuthorization: OAuthMethod;
  denyAuthorization: OAuthMethod;
};

function isSameOriginRelative(next: string): boolean {
  if (!next.startsWith("/")) return false;
  if (next.startsWith("//")) return false;
  return true;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const oauth = (supabase.auth as unknown as { oauth: AuthOAuth }).oauth;
      const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const oauth = (supabase.auth as unknown as { oauth: AuthOAuth }).oauth;
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    if (isSameOriginRelative(target)) {
      window.location.href = target;
    } else {
      window.location.href = target;
    }
  }

  if (error) {
    return (
      <main dir="rtl" className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-6 space-y-3">
          <h1 className="text-xl font-bold">تعذّر تحميل طلب التفويض</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      </main>
    );
  }

  if (!details) {
    return (
      <main dir="rtl" className="min-h-screen flex items-center justify-center p-6">
        <p className="text-muted-foreground">جارٍ التحميل…</p>
      </main>
    );
  }

  const clientName = details.client?.name ?? details.client?.client_name ?? "تطبيق خارجي";
  const scopes = details.scopes ?? details.requested_scopes ?? [];

  return (
    <main dir="rtl" className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full p-6 space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">ربط {clientName} بحساب مدرك Plus</h1>
          <p className="text-sm text-muted-foreground">
            سيسمح هذا لـ {clientName} باستخدام أدوات مدرك Plus نيابةً عنك أثناء تسجيل دخولك.
          </p>
        </div>
        <div className="text-xs text-muted-foreground border rounded-md p-3">
          لا يتخطى هذا صلاحيات مدرك Plus أو سياسات الأمان في قاعدة البيانات؛ الأدوات تعمل بحدود حسابك فقط.
        </div>
        {scopes.length > 0 && (
          <div className="text-xs">
            <div className="font-semibold mb-1">الصلاحيات المطلوبة:</div>
            <ul className="list-disc pr-5 space-y-1 text-muted-foreground">
              {scopes.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
            إلغاء
          </Button>
          <Button disabled={busy} onClick={() => decide(true)}>
            موافقة
          </Button>
        </div>
      </Card>
    </main>
  );
}
