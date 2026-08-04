// Developer-only: read and update a teacher's stages / grades / subjects
// using the SAME business logic used at teacher registration/approval time.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trace-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-trace-id",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cleanList = (value: unknown, max = 40) =>
  Array.isArray(value)
    ? [...new Set(value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim()))].slice(0, max)
    : [];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = req.headers.get("x-trace-id") || crypto.randomUUID();
  let stage = "بدء خدمة إدارة مواد وصفوف المعلم";

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json", "x-trace-id": traceId },
    });

  try {
    stage = "فحص إعدادات الخدمة";
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
    ].filter((c, i, all) => c.url && c.serviceKey && c.anonKey && all.findIndex((x) => x.url === c.url) === i);

    if (runtimeCandidates.length === 0) {
      return json({ error: "إعدادات الخدمة غير مكتملة", stage, code: "MISSING_SERVER_CONFIG", trace_id: traceId }, 500);
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
      const { data, error } = token
        ? await authClient.auth.getClaims(token)
        : { data: null, error: new Error("missing token") };
      if (data?.claims?.sub && !error) {
        claims = data.claims as Record<string, unknown>;
        selectedRuntime = candidate;
        break;
      }
      if ((error as { message?: string })?.message) claimsErrorMessage = (error as { message?: string }).message!;
    }
    if (!claims?.sub || !selectedRuntime) {
      return json({ error: "جلسة المطور غير صالحة أو منتهية", stage, code: "INVALID_DEVELOPER_JWT", details: claimsErrorMessage, trace_id: traceId }, 401);
    }
    const callerId = String(claims.sub);
    const admin = createClient(selectedRuntime.url, selectedRuntime.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    stage = "التحقق من صلاحية المطور";
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin").maybeSingle();
    const isSuperAdmin = String(claims.email || "").toLowerCase() === "alyedaft@gmail.com";
    if (!roleRow && !isSuperAdmin) {
      return json({ error: "الحساب لا يملك صلاحية المطور", stage, code: "ADMIN_ROLE_REQUIRED", trace_id: traceId }, 403);
    }

    stage = "قراءة بيانات الطلب";
    const body = (await req.json().catch(() => null)) as {
      action?: string;
      teacher_id?: string;
      stages?: string[];
      grades?: string[];
      categories?: string[];
      education_type?: string | null;
      teaches_integrated_science?: boolean;
    } | null;

    const teacherId = body?.teacher_id;
    if (!teacherId || !UUID_RE.test(teacherId)) {
      return json({ error: "معرّف المعلم غير صالح", stage, code: "INVALID_TEACHER_ID", trace_id: traceId }, 400);
    }

    const action = body?.action === "save" ? "save" : "load";

    if (action === "load") {
      stage = "تحميل الاختيارات الحالية";
      const [{ data: request }, { data: assignments }] = await Promise.all([
        admin
          .from("teacher_requests")
          .select("assigned_stages, assigned_grades, assigned_category, additional_categories, education_type, teaches_integrated_science, school_name, employee_id, phone")
          .eq("user_id", teacherId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from("teacher_assignments")
          .select("stage, grade, category, education_type, teaches_integrated_science")
          .eq("teacher_id", teacherId),
      ]);

      const rows = (assignments || []) as Array<Record<string, string | boolean | null>>;
      const assignmentStages = [...new Set(rows.map((r) => String(r.stage || "")).filter(Boolean))];
      const assignmentGrades = [...new Set(rows.map((r) => String(r.grade || "")).filter(Boolean))];
      const assignmentCategories = [...new Set(
        rows.map((r) => String(r.category || "")).filter((c) => c && c !== "integrated_science"),
      )];

      const requestCategories = cleanList([
        request?.assigned_category,
        ...((request?.additional_categories as string[] | null) || []),
      ]);

      return json({
        success: true,
        trace_id: traceId,
        scope: {
          stages: assignmentStages.length ? assignmentStages : cleanList(request?.assigned_stages),
          grades: assignmentGrades.length ? assignmentGrades : cleanList(request?.assigned_grades),
          categories: requestCategories.length ? requestCategories : assignmentCategories,
          education_type: (request?.education_type as string | null) || null,
          teaches_integrated_science:
            !!request?.teaches_integrated_science || rows.some((r) => r.category === "integrated_science"),
          school: (request?.school_name as string | null) || "",
          employee_id: (request?.employee_id as string | null) || "",
          phone: (request?.phone as string | null) || "",
        },
        assignments: rows,
      });
    }

    stage = "حفظ المواد والصفوف";
    const stages = cleanList(body?.stages, 4);
    const grades = cleanList(body?.grades, 12);
    const categories = cleanList(body?.categories, 20);

    if (!stages.length || !grades.length || !categories.length) {
      return json({ error: "اختر المرحلة والصفوف والمواد أولاً", stage, code: "INVALID_SCOPE", trace_id: traceId }, 400);
    }

    const { data: before } = await admin
      .from("teacher_requests")
      .select("assigned_stages, assigned_grades, assigned_category, additional_categories, education_type, teaches_integrated_science")
      .eq("user_id", teacherId)
      .maybeSingle();

    const { data: result, error: rpcError } = await admin.rpc("admin_sync_teacher_teaching_scope", {
      _teacher_id: teacherId,
      _stages: stages,
      _grades: grades,
      _categories: categories,
      _education_type: body?.education_type || null,
      _teaches_integrated_science: !!body?.teaches_integrated_science,
    });

    if (rpcError) {
      // Rollback the request row snapshot on failure (best effort)
      if (before) {
        await admin.from("teacher_requests").update(before).eq("user_id", teacherId);
      }
      return json({
        error: rpcError.message === "invalid_request" ? "بيانات غير صالحة" : rpcError.message,
        stage,
        code: rpcError.code || "SCOPE_SYNC_FAILED",
        details: rpcError.details || rpcError.hint,
        trace_id: traceId,
      }, 500);
    }

    return json({ ...(result || { success: true }), trace_id: traceId, stage: "اكتمل الحفظ", runtime: selectedRuntime.location });
  } catch (err) {
    console.error("[admin-teacher-scope]", { traceId, stage, error: err });
    return json({ error: (err as Error)?.message || "خطأ غير متوقع", stage, code: "UNEXPECTED_SERVER_ERROR", trace_id: traceId }, 500);
  }
});
