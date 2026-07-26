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

export async function computeModrekFileFingerprint(file: File): Promise<string> {
  const chunkSize = 1024 * 1024;
  const first = await file.slice(0, Math.min(chunkSize, file.size)).arrayBuffer();
  const lastStart = Math.max(0, file.size - chunkSize);
  const last = lastStart > 0 ? await file.slice(lastStart, file.size).arrayBuffer() : new ArrayBuffer(0);
  const meta = new TextEncoder().encode(`${file.name}|${file.type}|${file.size}|${file.lastModified}`);
  const merged = new Uint8Array(meta.byteLength + first.byteLength + last.byteLength);
  merged.set(meta, 0);
  merged.set(new Uint8Array(first), meta.byteLength);
  merged.set(new Uint8Array(last), meta.byteLength + first.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", merged);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function registerModrekUpload(payload: ModrekUploadRegistration) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("إعدادات الاتصال غير متاحة حالياً");
  }

  await supabase.auth.refreshSession().catch(() => undefined);
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("جلسة غير صالحة، سجّل الدخول من جديد");

  const kickWorker = async () => {
    await supabase.functions.invoke("modrek-worker", { body: {} }).catch(() => undefined);
  };

  const rpc = await supabase.rpc("modrek_register_bunny_upload" as any, {
    p_version_id: payload.version_id,
    p_bunny_path: payload.bunny_path,
    p_filename: payload.filename,
    p_mime: payload.mime,
    p_size: payload.size,
    p_sha256: payload.sha256,
  });
  if (!rpc.error && rpc.data) {
    await kickWorker();
    return rpc.data;
  }

  const rpcError = rpc.error?.message || "";
  const rpcMissing = rpcError.toLowerCase().includes("schema cache")
    || rpcError.toLowerCase().includes("could not find the function")
    || rpc.error?.code === "PGRST202";
  if (!rpcMissing) {
    throw new Error(rpcError || "فشل تسجيل الملف بعد الرفع");
  }

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

  await kickWorker();

  return json;
}