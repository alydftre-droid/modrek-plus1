// Developer-only: atomically remove a grade workspace and all related teacher data.

import { createClient } from "npm:@supabase/supabase-js@2";

// Keep these explicit: the package's `/cors` subpath is not exported in every
// Edge runtime and caused this function to fail during boot before OPTIONS ran.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trace-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-trace-id",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = req.headers.get("x-trace-id") || crypto.randomUUID();
  let stage = "بدء خدمة حذف الصف";

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "x-trace-id": traceId } });

  try {
    stage = "فحص إعدادات خدمة الحذف";
    const runtimeCandidates = [
      {
        url: Deno.env.get("SUPABASE_URL") || "",
        serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
        anonKey: Deno.env.get("SUPABASE_ANON_KEY") || "",
        location: "managed-backend",
      },
      {
        url: Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("PRODUCTION_SUPABASE_URL") || "",
        serviceKey: Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("PRODUCTION_SUPABASE_SERVICE_ROLE_KEY") || "",
        anonKey: Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("PRODUCTION_SUPABASE_PUBLISHABLE_KEY") || "",
        location: "production-backend",
      },
    ].filter((candidate, index, all) =>
      candidate.url && candidate.serviceKey && candidate.anonKey
      && all.findIndex((item) => item.url === candidate.url) === index
    );
    if (runtimeCandidates.length === 0) {
      return json({ error: "إعدادات خدمة الحذف غير مكتملة", stage, code: "MISSING_SERVER_CONFIG", trace_id: traceId, location: "admin-remove-teacher-grade" }, 500);
    }

    stage = "التحقق من جلسة المطور";
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    let claims: Record<string, unknown> | null = null;
    let selectedRuntime: (typeof runtimeCandidates)[number] | null = null;
    let claimsErrorMessage = token ? "token rejected by all configured backends" : "missing token";
    for (const candidate of runtimeCandidates) {
      const authClient = createClient(candidate.url, candidate.anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: claimsData, error: claimsError } = token
        ? await authClient.auth.getClaims(token)
        : { data: null, error: new Error("missing token") };
      if (claimsData?.claims?.sub && !claimsError) {
        claims = claimsData.claims as Record<string, unknown>;
        selectedRuntime = candidate;
        break;
      }
      if (claimsError?.message) claimsErrorMessage = claimsError.message;
    }
    if (!claims?.sub || !selectedRuntime) return json({ error: "جلسة المطور غير صالحة أو منتهية", stage, code: "INVALID_DEVELOPER_JWT", details: claimsErrorMessage, trace_id: traceId, location: "auth.getClaims" }, 401);
    const callerId = String(claims.sub);

    const admin = createClient(selectedRuntime.url, selectedRuntime.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    stage = "التحقق من صلاحية المطور";
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin").maybeSingle();
    const isSuperAdmin = String(claims.email || "").toLowerCase() === "alyedaft@gmail.com";
    if (!roleRow && !isSuperAdmin) return json({ error: "الحساب الأصلي لا يملك صلاحية المطور", stage, code: "ADMIN_ROLE_REQUIRED", trace_id: traceId, location: "user_roles" }, 403);

    stage = "قراءة وفحص بيانات الصف";
    const body = (await req.json().catch(() => null)) as
      | { teacher_id?: string; assignment_ids?: string[] }
      | null;

    const teacherId = body?.teacher_id;
    const ids = Array.isArray(body?.assignment_ids) ? body!.assignment_ids!.filter((i) => typeof i === "string" && UUID_RE.test(i)) : [];

    if (!teacherId || !UUID_RE.test(teacherId)) return json({ error: "معرّف المعلم غير صالح", stage, code: "INVALID_TEACHER_ID", trace_id: traceId, location: "request.teacher_id" }, 400);
    if (ids.length === 0 || ids.length > 50) return json({ error: "قائمة روابط الصف فارغة أو غير صالحة", stage, code: "INVALID_ASSIGNMENT_IDS", trace_id: traceId, location: "request.assignment_ids" }, 400);

    stage = "الحذف الذري داخل قاعدة البيانات";
    const { data: result, error: deleteError } = await admin.rpc("admin_remove_teacher_grade_workspace", {
      _teacher_id: teacherId,
      _assignment_ids: ids,
    });
    if (deleteError) return json({ error: deleteError.message, stage, code: deleteError.code || "DATABASE_DELETE_FAILED", details: deleteError.details || deleteError.hint, trace_id: traceId, location: "admin_remove_teacher_grade_workspace" }, 500);
    return json({ ...(result || { success: true }), trace_id: traceId, stage: "اكتمل الحذف", runtime: selectedRuntime.location });
  } catch (err) {
    console.error("[admin-remove-teacher-grade]", { traceId, stage, error: err });
    return json({ error: (err as Error)?.message || "خطأ غير متوقع", stage, code: "UNEXPECTED_SERVER_ERROR", trace_id: traceId, location: "admin-remove-teacher-grade" }, 500);
  }
});
