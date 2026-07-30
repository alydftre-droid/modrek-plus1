// Developer-only: remove a grade (teacher_assignments rows) from a teacher account.
// Content, exams and files are NOT deleted — only the teacher <-> grade link.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getJwtClaimsFromAuthHeader } from "../_shared/auth.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    const claims = await getJwtClaimsFromAuthHeader(authHeader);
    if (!claims?.sub) return json({ error: "انتهت جلسة المطور. اخرج من حساب المعلم ثم ادخل إليه مرة أخرى" }, 401);
    const callerId = claims.sub;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin").maybeSingle();
    const isSuperAdmin = String(claims.email || "").toLowerCase() === "alyedaft@gmail.com";
    if (!roleRow && !isSuperAdmin) return json({ error: "هذه العملية متاحة للمطور فقط" }, 403);

    const body = (await req.json().catch(() => null)) as
      | { teacher_id?: string; assignment_ids?: string[] }
      | null;

    const teacherId = body?.teacher_id;
    const ids = Array.isArray(body?.assignment_ids) ? body!.assignment_ids!.filter((i) => typeof i === "string" && UUID_RE.test(i)) : [];

    if (!teacherId || !UUID_RE.test(teacherId)) return json({ error: "معرّف المعلم غير صالح" }, 400);
    if (ids.length === 0 || ids.length > 50) return json({ error: "قائمة الصفوف غير صالحة" }, 400);

    const { data: result, error: deleteError } = await admin.rpc("admin_remove_teacher_grade_workspace", {
      _teacher_id: teacherId,
      _assignment_ids: ids,
    });
    if (deleteError) throw deleteError;
    return json(result || { success: true });
  } catch (err) {
    console.error("[admin-remove-teacher-grade]", err);
    return new Response(JSON.stringify({ error: (err as Error)?.message || "خطأ غير متوقع" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
