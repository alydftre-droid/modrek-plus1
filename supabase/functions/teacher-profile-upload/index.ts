import { createClient } from "npm:@supabase/supabase-js@2";
import { getJwtClaimsFromAuthHeader } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type UploadKind = "photo" | "video";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSafeExtension(fileName: string, fallback: string) {
  const ext = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || fallback;
}

function normalizeContentType(kind: UploadKind, file: File, provided?: string | null) {
  if (kind === "photo") return "image/jpeg";
  const candidate = provided || file.type || "";
  if (candidate.startsWith("video/")) return candidate;
  const ext = getSafeExtension(file.name, "mp4");
  return ext === "webm" ? "video/webm" : "video/mp4";
}

function normalizePath(path: string | null, userId: string, kind: UploadKind, file: File) {
  const fallbackExt = kind === "photo" ? "jpg" : "mp4";
  const ext = kind === "photo" ? "jpg" : getSafeExtension(file.name, fallbackExt);
  const prefix = kind === "photo" ? "photo" : "intro";
  const safeFallback = `${userId}/${prefix}-${Date.now()}.${ext}`;
  if (!path) return safeFallback;
  if (!path.startsWith(`${userId}/`)) return safeFallback;
  if (path.includes("..") || path.includes("//")) return safeFallback;
  return path;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authHeader = req.headers.get("Authorization") || "";

    if (!supabaseUrl || !serviceKey || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const claims = await getJwtClaimsFromAuthHeader(authHeader);
    if (!claims?.sub) return jsonResponse({ error: "Unauthorized" }, 401);

    const form = await req.formData();
    const file = form.get("file");
    const kind = form.get("kind");
    if (!(file instanceof File)) return jsonResponse({ error: "file is required" }, 400);
    if (kind !== "photo" && kind !== "video") return jsonResponse({ error: "kind is invalid" }, 400);

    if (kind === "photo" && !file.type.startsWith("image/")) {
      return jsonResponse({ error: "Invalid image file" }, 400);
    }
    if (kind === "video" && !file.type.startsWith("video/") && file.type !== "application/octet-stream") {
      return jsonResponse({ error: "Invalid video file" }, 400);
    }
    if (kind === "video" && file.size > 100 * 1024 * 1024) {
      return jsonResponse({ error: "Video exceeds 100MB" }, 413);
    }


    const userId = claims.sub;
    const path = normalizePath(String(form.get("path") || ""), userId, kind, file);
    const contentType = normalizeContentType(kind, file, String(form.get("contentType") || ""));
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: uploadError } = await adminClient.storage
      .from("teacher-profiles")
      .upload(path, file, { upsert: true, contentType });

    if (uploadError) {
      console.error("teacher-profile-upload storage error", uploadError);
      return jsonResponse({ error: uploadError.message || "Upload failed" }, 500);
    }

    const { data } = adminClient.storage.from("teacher-profiles").getPublicUrl(path);
    return jsonResponse({ publicUrl: data.publicUrl, path });
  } catch (error) {
    console.error("teacher-profile-upload unexpected error", error);
    return jsonResponse({ error: "Upload failed" }, 500);
  }
});