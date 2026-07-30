// Developer-only: remove a grade (teacher_assignments rows) from a teacher account.
// Content, exams and files are NOT deleted — only the teacher <-> grade link.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "غير مصرح" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "جلسة منتهية" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "هذه العملية متاحة للمطور فقط" }, 403);

    const body = (await req.json().catch(() => null)) as
      | { teacher_id?: string; assignment_ids?: string[] }
      | null;

    const teacherId = body?.teacher_id;
    const ids = Array.isArray(body?.assignment_ids) ? body!.assignment_ids!.filter((i) => typeof i === "string" && UUID_RE.test(i)) : [];

    if (!teacherId || !UUID_RE.test(teacherId)) return json({ error: "معرّف المعلم غير صالح" }, 400);
    if (ids.length === 0 || ids.length > 50) return json({ error: "قائمة الصفوف غير صالحة" }, 400);

    // Only delete rows that truly belong to this teacher.
    const { data: owned, error: ownErr } = await admin
      .from("teacher_assignments")
      .select("id")
      .eq("teacher_id", teacherId)
      .in("id", ids);
    if (ownErr) throw ownErr;

    const ownedIds = (owned ?? []).map((r: any) => r.id);
    if (ownedIds.length === 0) return json({ error: "لم يتم العثور على الصف داخل حساب هذا المعلم" }, 404);

    const { error: delErr } = await admin
      .from("teacher_assignments")
      .delete()
      .eq("teacher_id", teacherId)
      .in("id", ownedIds);
    if (delErr) throw delErr;

    return json({ success: true, deleted: ownedIds.length });
  } catch (err) {
    console.error("[admin-remove-teacher-grade]", err);
    return new Response(JSON.stringify({ error: (err as Error)?.message || "خطأ غير متوقع" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
