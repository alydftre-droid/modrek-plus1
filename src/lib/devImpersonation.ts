import { supabase } from "@/integrations/supabase/client";

const ORIGINAL_SESSION_KEY = "dev_original_session";
const IMPERSONATION_META_KEY = "dev_impersonation_active";

export interface ImpersonationMeta {
  target_id: string;
  test_account_code: string;
  full_name: string;
  started_at: string;
}

export function getImpersonationMeta(): ImpersonationMeta | null {
  try {
    const raw = localStorage.getItem(IMPERSONATION_META_KEY);
    return raw ? (JSON.parse(raw) as ImpersonationMeta) : null;
  } catch {
    return null;
  }
}

export function isImpersonating() {
  return !!getImpersonationMeta();
}

export async function startImpersonation(params: { test_account_code?: string; target_user_id?: string }) {
  // Persist original session so we can restore later
  const { data: { session: original } } = await supabase.auth.getSession();
  if (!original) throw new Error("لا توجد جلسة نشطة للمطور");
  localStorage.setItem(ORIGINAL_SESSION_KEY, JSON.stringify(original));

  const { data, error } = await supabase.functions.invoke("developer-impersonate", {
    body: params,
  });
  if (error) throw new Error(error.message || "فشل الدخول إلى الحساب التجريبي");
  const session = data?.session;
  const target = data?.target;
  if (!session || !target) throw new Error("استجابة غير صالحة من الخادم");

  const { error: setErr } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (setErr) throw setErr;

  const meta: ImpersonationMeta = {
    target_id: target.id,
    test_account_code: target.test_account_code,
    full_name: target.full_name,
    started_at: new Date().toISOString(),
  };
  localStorage.setItem(IMPERSONATION_META_KEY, JSON.stringify(meta));
  return meta;
}

export async function endImpersonation() {
  const raw = localStorage.getItem(ORIGINAL_SESSION_KEY);
  localStorage.removeItem(IMPERSONATION_META_KEY);
  localStorage.removeItem(ORIGINAL_SESSION_KEY);
  if (!raw) {
    await supabase.auth.signOut();
    return;
  }
  try {
    const original = JSON.parse(raw);
    await supabase.auth.setSession({
      access_token: original.access_token,
      refresh_token: original.refresh_token,
    });
  } catch {
    await supabase.auth.signOut();
  }
}
