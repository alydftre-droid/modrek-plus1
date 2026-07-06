import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string;

export type ModrekUploadRegistration = {
  version_id: string;
  bunny_path: string;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
};

export async function registerModrekUpload(payload: ModrekUploadRegistration) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("إعدادات الاتصال غير متاحة حالياً");
  }

  await supabase.auth.refreshSession().catch(() => undefined);
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("جلسة غير صالحة، سجّل الدخول من جديد");

  const response = await fetch(`${SUPABASE_URL}/functions/v1/modrek-upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text };
  }

  if (!response.ok || json?.error) {
    throw new Error(json?.error || `فشل تسجيل الملف بعد الرفع (${response.status})`);
  }

  return json;
}