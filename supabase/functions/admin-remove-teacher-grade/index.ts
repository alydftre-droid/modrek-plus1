// Developer-only: atomically remove a grade workspace and all related teacher data.

import { createClient } from "npm:@supabase/supabase-js@2";
import { blockDemoWrites } from "../_shared/demoGuard.ts";

// Keep these explicit: the package's `/cors` subpath is not exported in every
// Edge runtime and caused this function to fail during boot before OPTIONS ran.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trace-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-trace-id",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uniqueIds = (rows: Array<Record<string, unknown>> | null, key = "id") =>
  [...new Set((rows || []).map((row) => row[key]).filter((value): value is string => typeof value === "string"))];

async function deleteGradeWorkspaceDirect(admin: ReturnType<typeof createClient>, teacherId: string, assignmentIds: string[]) {
  const { data: assignments, error: assignmentsError } = await admin
    .from("teacher_assignments")
    .select("id,stage,grade,section,category,education_type")
    .eq("teacher_id", teacherId)
    .in("id", assignmentIds);
  if (assignmentsError) throw assignmentsError;
  if (!assignments?.length) throw new Error("teacher_grade_not_found");

  const subjectIds = new Set<string>();
  for (const assignment of assignments) {
    let query = admin.from("subjects").select("id").eq("stage", assignment.stage).eq("grade", assignment.grade).eq("category", assignment.category);
    if (assignment.section) query = query.or(`section.is.null,section.eq.${assignment.section}`);
    const { data, error } = await query;
    if (error) throw error;
    uniqueIds(data as Array<Record<string, unknown>> | null).forEach((id) => subjectIds.add(id));
  }
  const subjects = [...subjectIds];

  const { data: groups, error: groupsError } = subjects.length
    ? await admin.from("content_groups").select("id").or(`teacher_id.eq.${teacherId},created_by.eq.${teacherId}`).in("subject_id", subjects)
    : { data: [], error: null };
  if (groupsError) throw groupsError;
  const groupIds = uniqueIds(groups as Array<Record<string, unknown>> | null);

  const contentRows: Array<Record<string, unknown>> = [];
  if (groupIds.length) {
    const { data, error } = await admin.from("content").select("id").in("group_id", groupIds);
    if (error) throw error;
    contentRows.push(...((data || []) as Array<Record<string, unknown>>));
  }
  if (subjects.length) {
    const { data, error } = await admin.from("content").select("id").is("group_id", null).eq("uploaded_by", teacherId).in("subject_id", subjects);
    if (error) throw error;
    contentRows.push(...((data || []) as Array<Record<string, unknown>>));
  }
  const contentIds = uniqueIds(contentRows);

  const examRows: Array<Record<string, unknown>> = [];
  if (groupIds.length) {
    const { data, error } = await admin.from("exams").select("id").eq("teacher_id", teacherId).in("group_id", groupIds);
    if (error) throw error;
    examRows.push(...((data || []) as Array<Record<string, unknown>>));
  }
  if (subjects.length) {
    const { data, error } = await admin.from("exams").select("id").eq("teacher_id", teacherId).is("group_id", null).in("subject_id", subjects);
    if (error) throw error;
    examRows.push(...((data || []) as Array<Record<string, unknown>>));
  }
  const examIds = uniqueIds(examRows);

  const { data: sessions, error: sessionsError } = groupIds.length
    ? await admin.from("live_sessions").select("id").eq("teacher_id", teacherId).in("group_id", groupIds)
    : { data: [], error: null };
  if (sessionsError) throw sessionsError;
  const sessionIds = uniqueIds(sessions as Array<Record<string, unknown>> | null);

  const remove = async (table: string, apply: (query: ReturnType<typeof admin.from>) => unknown) => {
    const result = await apply(admin.from(table).delete()) as { error?: { message?: string } | null };
    if (result.error) throw new Error(`${table}: ${result.error.message || "delete failed"}`);
  };
  if (groupIds.length || contentIds.length || examIds.length) await remove("student_activity_logs", (q: any) => q.eq("teacher_id", teacherId).or([
    groupIds.length ? `group_id.in.(${groupIds.join(",")})` : "",
    contentIds.length ? `content_id.in.(${contentIds.join(",")})` : "",
    examIds.length ? `exam_id.in.(${examIds.join(",")})` : "",
  ].filter(Boolean).join(",")));
  if (groupIds.length) await remove("bundled_package_subscription_groups", (q: any) => q.eq("teacher_id", teacherId).in("group_id", groupIds));
  if (subjects.length || groupIds.length) await remove("teacher_earning_records", (q: any) => q.eq("teacher_id", teacherId).or([
    groupIds.length ? `group_id.in.(${groupIds.join(",")})` : "",
    subjects.length ? `subject_id.in.(${subjects.join(",")})` : "",
  ].filter(Boolean).join(",")));
  if (groupIds.length || sessionIds.length) await remove("live_session_recordings", (q: any) => q.eq("teacher_id", teacherId).or([
    groupIds.length ? `group_id.in.(${groupIds.join(",")})` : "",
    sessionIds.length ? `session_id.in.(${sessionIds.join(",")})` : "",
  ].filter(Boolean).join(",")));
  if (sessionIds.length) await remove("live_sessions", (q: any) => q.in("id", sessionIds));
  if (examIds.length) await remove("exams", (q: any) => q.in("id", examIds));
  if (contentIds.length) await remove("content", (q: any) => q.in("id", contentIds));
  if (groupIds.length) await remove("ai_lessons", (q: any) => q.in("group_id", groupIds));
  if (subjects.length) {
    await remove("ai_lessons", (q: any) => q.is("group_id", null).eq("created_by", teacherId).in("subject_id", subjects));
    await remove("subscription_requests", (q: any) => q.eq("teacher_id", teacherId).in("subject_id", subjects));
    await remove("subscriptions", (q: any) => q.eq("teacher_id", teacherId).in("subject_id", subjects));
  }
  for (const assignment of assignments) {
    await remove("student_teacher_choices", (q: any) => q.eq("teacher_id", teacherId).eq("stage", assignment.stage).eq("grade", assignment.grade).eq("category", assignment.category));
  }
  if (groupIds.length) await remove("content_groups", (q: any) => q.in("id", groupIds));
  await remove("teacher_assignments", (q: any) => q.eq("teacher_id", teacherId).in("id", assignmentIds));

  return { success: true, deleted_assignments: assignments.length, deleted_groups: groupIds.length, deleted_content: contentIds.length, deleted_exams: examIds.length, deleted_live_sessions: sessionIds.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Demo accounts are read-only (server-side boundary, cannot be bypassed).
  const demoBlock = await blockDemoWrites(req, corsHeaders);
  if (demoBlock) return demoBlock;

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
    if (!roleRow) return json({ error: "الحساب الأصلي لا يملك صلاحية المطور", stage, code: "ADMIN_ROLE_REQUIRED", trace_id: traceId, location: "user_roles" }, 403);

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
    if (deleteError && (deleteError.code === "PGRST202" || deleteError.message?.includes("Could not find the function"))) {
      stage = "الحذف المباشر لمساحة الصف";
      const directResult = await deleteGradeWorkspaceDirect(admin, teacherId, ids);
      return json({ ...directResult, trace_id: traceId, stage: "اكتمل الحذف", runtime: selectedRuntime.location, mode: "direct-fallback" });
    }
    if (deleteError) return json({ error: deleteError.message, stage, code: deleteError.code || "DATABASE_DELETE_FAILED", details: deleteError.details || deleteError.hint, trace_id: traceId, location: "admin_remove_teacher_grade_workspace" }, 500);
    return json({ ...(result || { success: true }), trace_id: traceId, stage: "اكتمل الحذف", runtime: selectedRuntime.location, mode: "atomic-rpc" });
  } catch (err) {
    console.error("[admin-remove-teacher-grade]", { traceId, stage, error: err });
    return json({ error: (err as Error)?.message || "خطأ غير متوقع", stage, code: "UNEXPECTED_SERVER_ERROR", trace_id: traceId, location: "admin-remove-teacher-grade" }, 500);
  }
});
