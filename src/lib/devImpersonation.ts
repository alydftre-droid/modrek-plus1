import { supabase } from "@/integrations/supabase/client";
import { createClient } from "@supabase/supabase-js";

const ORIGINAL_SESSION_KEY = "dev_original_session";
const IMPERSONATION_META_KEY = "dev_impersonation_active";

export interface ImpersonationMeta {
  target_id: string;
  test_account_code?: string;
  full_name: string;
  started_at: string;
  role?: "student" | "teacher";
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

export function getOriginalDeveloperAccessToken(): string | null {
  try {
    const raw = localStorage.getItem(ORIGINAL_SESSION_KEY);
    if (!raw) return null;
    const original = JSON.parse(raw);
    return typeof original?.access_token === "string" && original.access_token ? original.access_token : null;
  } catch {
    return null;
  }
}

export async function getFreshOriginalDeveloperAccessToken(): Promise<string | null> {
  const raw = localStorage.getItem(ORIGINAL_SESSION_KEY);
  if (!raw) throw new Error("لا توجد جلسة المطور الأصلية في هذا الجهاز");
  try {
    const original = JSON.parse(raw);
    if (!original?.access_token || !original?.refresh_token) {
      throw new Error("بيانات جلسة المطور الأصلية غير مكتملة");
    }

    const authClient = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
    const { data, error } = await authClient.auth.setSession({
      access_token: original.access_token,
      refresh_token: original.refresh_token,
    });
    if (error) throw new Error(`تعذر تجديد جلسة المطور: ${error.message}`);
    if (!data.session) throw new Error("لم يُرجع نظام الدخول جلسة مطور جديدة");
    localStorage.setItem(ORIGINAL_SESSION_KEY, JSON.stringify(data.session));
    return data.session.access_token;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("تعذر قراءة أو تجديد جلسة المطور الأصلية");
  }
}

export function getPostSignOutPath(fallback = "/auth") {
  return isImpersonating() ? "/admin" : fallback;
}

export function clearImpersonationState() {
  localStorage.removeItem(IMPERSONATION_META_KEY);
  localStorage.removeItem(ORIGINAL_SESSION_KEY);
}

export async function startImpersonation(params: { test_account_code?: string; target_user_id?: string; target_teacher_id?: string }) {
  // Persist original session so we can restore later
  const { data: { session: original } } = await supabase.auth.getSession();
  if (!original) throw new Error("لا توجد جلسة نشطة للمطور");
  localStorage.setItem(ORIGINAL_SESSION_KEY, JSON.stringify(original));

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/developer-impersonate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${original.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(params),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || data?.message || "فشل الدخول إلى الحساب التجريبي");
  }

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
    role: target.role === "teacher" ? "teacher" : "student",
  };
  localStorage.setItem(IMPERSONATION_META_KEY, JSON.stringify(meta));
  return meta;
}

export async function startTeacherImpersonation(teacherId: string) {
  return startImpersonation({ target_teacher_id: teacherId } as any);
}

export async function endImpersonation() {
  const raw = localStorage.getItem(ORIGINAL_SESSION_KEY);
  clearImpersonationState();
  if (!raw) {
    await supabase.auth.signOut();
    return;
  }
  try {
    const original = JSON.parse(raw);
    const { error } = await supabase.auth.setSession({
      access_token: original.access_token,
      refresh_token: original.refresh_token,
    });
    if (error) throw error;
  } catch {
    await supabase.auth.signOut();
  }
}

/**
 * Demo account impersonation (admin only).
 * Uses the `admin-demo-accounts` edge function, which enforces the admin role
 * server-side and refuses demo-admin targets.
 */
export async function startDemoImpersonation(demoId: string) {
  const { data: { session: original } } = await supabase.auth.getSession();
  if (!original) throw new Error("لا توجد جلسة نشطة للمطور");
  localStorage.setItem(ORIGINAL_SESSION_KEY, JSON.stringify(original));

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-demo-accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${original.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ action: "impersonate", demo_id: demoId }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "فشل الدخول إلى حساب الديمو");

  const { error: setErr } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (setErr) throw setErr;

  const meta: ImpersonationMeta = {
    target_id: data.target.id,
    full_name: data.target.full_name,
    started_at: new Date().toISOString(),
    role: data.target.role === "teacher" ? "teacher" : "student",
  };
  localStorage.setItem(IMPERSONATION_META_KEY, JSON.stringify(meta));
  return meta;
}
