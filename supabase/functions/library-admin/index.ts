// Library Admin — CRUD, dashboard stats, upload session helpers.
// Developer-only. Verifies caller has admin role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-library-trace-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EDGE_FILE = "supabase/functions/library-admin/index.ts";
const LIBRARY_ADMIN_VERSION = "library-admin-queue-rpc-required-20260718";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DiagnosticReport = {
  request_id: string;
  file: string;
  function: string;
  component: string;
  hook: string;
  api: string;
  table: string;
  column: string;
  sent_value: unknown;
  expected_value: unknown;
  correct_value?: unknown;
  failure_reason: string;
  stack_trace: string;
  line_hint?: string;
  error_type: string;
  layer: "frontend" | "api" | "database";
  details?: Record<string, unknown>;
};

class LibraryDiagnosticError extends Error {
  status: number;
  report: DiagnosticReport;

  constructor(message: string, report: DiagnosticReport, status = 400) {
    super(message);
    this.name = "LibraryDiagnosticError";
    this.status = status;
    this.report = report;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requestId() {
  return crypto.randomUUID();
}

function safeDetails(value: Record<string, unknown> | undefined) {
  if (!value) return undefined;
  const copy: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (/authorization|token|apikey|cookie|secret/i.test(key)) continue;
    copy[key] = typeof raw === "string" && raw.length > 500 ? `${raw.slice(0, 500)}…` : raw;
  }
  return copy;
}

function logLibraryStep(request_id: string, action: string, step: string, details?: Record<string, unknown>) {
  console.info("[library-admin-debug]", JSON.stringify({ request_id, action, step, details: safeDetails(details) }));
}

async function logLibraryProcessingEvent(
  admin: any,
  bookId: string | null | undefined,
  jobId: string | null | undefined,
  eventKey: string,
  message: string,
  level: "debug" | "info" | "warning" | "error" | "success" = "info",
  progress: number | null = null,
  data: Record<string, unknown> = {},
) {
  if (!bookId) return;
  try {
    await admin.rpc("log_library_processing_event", {
      _book_id: bookId,
      _job_id: jobId ?? null,
      _event_key: eventKey,
      _message: message,
      _level: level,
      _progress: progress,
      _data: data,
    });
  } catch (err) {
    console.warn("[library-admin-debug] processing event log failed", eventKey, err);
  }
}

function diagnosticReport(args: {
  request_id: string;
  functionName: string;
  api: string;
  table?: string;
  column?: string;
  sentValue?: unknown;
  expectedValue?: unknown;
  correctValue?: unknown;
  failureReason: string;
  errorType?: string;
  layer?: "frontend" | "api" | "database";
  lineHint?: string;
  details?: Record<string, unknown>;
}): DiagnosticReport {
  const stack = new Error(args.failureReason).stack || "";
  return {
    request_id: args.request_id,
    file: EDGE_FILE,
    function: args.functionName,
    component: "LibraryUploadPage",
    hook: "React useState/useMemo → callAdmin",
    api: args.api,
    table: args.table || "library_books",
    column: args.column || "unknown",
    sent_value: args.sentValue ?? null,
    expected_value: args.expectedValue ?? null,
    correct_value: args.correctValue,
    failure_reason: args.failureReason,
    stack_trace: stack,
    line_hint: args.lineHint,
    error_type: args.errorType || "validation_error",
    layer: args.layer || "api",
    details: safeDetails(args.details),
  };
}

function throwDiagnostic(args: Parameters<typeof diagnosticReport>[0] & { message?: string; status?: number }): never {
  const report = diagnosticReport(args);
  throw new LibraryDiagnosticError(args.message || report.failure_reason, report, args.status || 400);
}

function validateUuidOrThrow(request_id: string, api: string, column: string, value: string | null, table: string) {
  if (!value) return;
  if (!UUID_RE.test(value)) {
    throwDiagnostic({
      request_id,
      functionName: "validateUuidOrThrow",
      api,
      table,
      column,
      sentValue: value,
      expectedValue: "UUID صالح موجود في الجدول المرتبط",
      failureReason: `${column}_is_not_valid_uuid`,
      errorType: "invalid_input",
      layer: "api",
      lineHint: "library-admin validateUuidOrThrow",
    });
  }
}

function parseDatabaseDiagnostic(error: any): Partial<DiagnosticReport> | null {
  const raw = String(error?.details || error?.hint || "").trim();
  if (!raw.startsWith("{")) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function dbErrorToDiagnostic(error: any, context: {
  request_id: string;
  functionName: string;
  api: string;
  table: string;
  payload: Record<string, unknown>;
}) {
  const parsed = parseDatabaseDiagnostic(error);
  if (parsed) {
    return new LibraryDiagnosticError(String(error?.message || parsed.failure_reason || "database_validation_failed"), {
      ...diagnosticReport({
        request_id: context.request_id,
        functionName: context.functionName,
        api: context.api,
        table: context.table,
        column: String(parsed.column || "unknown"),
        sentValue: parsed.sent_value,
        expectedValue: parsed.expected_value,
        correctValue: parsed.correct_value,
        failureReason: String(parsed.failure_reason || error?.message || "database_validation_failed"),
        errorType: String(parsed.error_type || "database_validation_error"),
        layer: "database",
        details: { db_code: error?.code, db_message: error?.message, ...parsed.details },
      }),
      ...parsed,
      request_id: context.request_id,
    } as DiagnosticReport, 400);
  }

  const message = String(error?.message || error || "");
  const fkMatch = message.match(/violates foreign key constraint "([^"]+)"/i);
  const column = fkMatch?.[1]?.includes("subject_id") ? "subject_id"
    : fkMatch?.[1]?.includes("grade_id") ? "grade_id"
      : fkMatch?.[1]?.includes("stage_id") ? "stage_id"
        : fkMatch?.[1]?.includes("section_id") ? "section_id"
          : fkMatch?.[1]?.includes("track_id") ? "track_id"
            : "unknown";
  return new LibraryDiagnosticError(message, diagnosticReport({
    request_id: context.request_id,
    functionName: context.functionName,
    api: context.api,
    table: context.table,
    column,
    sentValue: column === "unknown" ? context.payload : context.payload[column],
    expectedValue: "قيمة موجودة فعليًا في الجدول المرتبط قبل الحفظ",
    failureReason: fkMatch ? `foreign_key_violation:${fkMatch[1]}` : "database_write_failed",
    errorType: error?.code || "database_error",
    layer: "database",
    details: { db_code: error?.code, db_message: message, db_details: error?.details, db_hint: error?.hint },
  }), error?.code === "23503" ? 400 : 500);
}

function normalizeStageCode(value: string | null | undefined) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "";
  if (v === "preparatory" || v.includes("اعداد") || v.includes("إعداد")) return "preparatory";
  if (v === "secondary" || v.includes("ثانو")) return "secondary";
  if (v === "primary" || v.includes("ابتد")) return "primary";
  return v;
}

function normalizeGradeCode(value: string | null | undefined) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "";
  if (["first", "الأول", "اول", "أول", "الصف الأول", "الاول", "1"].includes(v)) return "first";
  if (["second", "الثاني", "ثاني", "الصف الثاني", "الثانى", "2"].includes(v)) return "second";
  if (["third", "الثالث", "ثالث", "الصف الثالث", "3"].includes(v)) return "third";
  if (["fourth", "الرابع", "رابع", "الصف الرابع", "4"].includes(v)) return "fourth";
  if (["fifth", "الخامس", "خامس", "الصف الخامس", "5"].includes(v)) return "fifth";
  if (["sixth", "السادس", "سادس", "الصف السادس", "6"].includes(v)) return "sixth";
  return v;
}

function sourceGradeFromLibraryGradeCode(code: string | null | undefined) {
  if (code === "pr1" || code === "sec1" || code === "p1") return "first";
  if (code === "pr2" || code === "sec2" || code === "p2") return "second";
  if (code === "pr3" || code === "sec3" || code === "p3") return "third";
  if (code === "p4") return "fourth";
  if (code === "p5") return "fifth";
  if (code === "p6") return "sixth";
  return normalizeGradeCode(code);
}

function sourceSectionFromTrackCode(trackCode: string | null | undefined) {
  const v = String(trackCode || "").trim().toLowerCase();
  if (!v || v === "none") return "";
  if (["scientific", "sci_science", "sci_math", "science", "sci", "علمي", "علمى", "علمي علوم", "علمى علوم", "علمي رياضة", "علمى رياضة"].includes(v)) return "scientific";
  if (["literary", "أدبي", "ادبي", "أدبى", "ادبى"].includes(v)) return "literary";
  return v;
}

function canonicalTrackName(code: string) {
  if (code === "scientific") return "علمي";
  if (code === "sci_science") return "علمي علوم";
  if (code === "sci_math") return "علمي رياضة";
  if (code === "literary") return "أدبي";
  if (code === "none") return "بدون شعبة";
  return code;
}

function canonicalTrackSort(code: string) {
  if (code === "none") return 0;
  if (code === "scientific") return 1;
  if (code === "sci_science") return 2;
  if (code === "sci_math") return 3;
  if (code === "literary") return 4;
  return 99;
}

async function ensureLibraryTrack(admin: any, request_id: string, api: string, rawCode: string | null | undefined) {
  const normalized = sourceSectionFromTrackCode(rawCode);
  if (!normalized) return null;

  const existing = await admin
    .from("library_tracks")
    .select("id,code,is_active")
    .eq("code", normalized)
    .maybeSingle();

  if (existing.data?.id && existing.data.is_active !== false) return existing.data;

  logLibraryStep(request_id, api, "library-track-self-heal", {
    requested_track_code: rawCode,
    normalized_track_code: normalized,
    existing_error: existing.error?.message || null,
    reason: existing.data?.id ? "inactive_track_reactivated" : "missing_track_created",
  });

  const { data, error } = await admin
    .from("library_tracks")
    .upsert({
      code: normalized,
      name_ar: canonicalTrackName(normalized),
      sort_order: canonicalTrackSort(normalized),
      is_active: true,
    }, { onConflict: "code" })
    .select("id,code,is_active")
    .single();

  if (!error && data?.id) return data;

  const { data: availableTracks } = await admin
    .from("library_tracks")
    .select("id,code,name_ar,is_active,sort_order")
    .order("sort_order", { ascending: true });

  throwDiagnostic({
    request_id,
    functionName: "ensureLibraryTrack",
    api,
    table: "library_tracks",
    column: "track_id",
    sentValue: rawCode ?? null,
    expectedValue: "وجود أو إنشاء شعبة فعّالة مطابقة لشعبة المادة الثانوية",
    correctValue: normalized,
    failureReason: "library_track_self_heal_failed",
    errorType: "relationship_error",
    layer: "database",
    details: {
      upsert_error: error?.message || null,
      available_tracks: availableTracks || [],
      sql_query: "UPSERT public.library_tracks(code,name_ar,sort_order,is_active) ON CONFLICT(code)",
    },
    lineHint: "library-admin ensureLibraryTrack: create/reactivate missing taxonomy track",
  });
}

// Immediately trigger the library-worker function so admins see progress
// without waiting for the next pg_cron tick (which runs every minute).
async function kickWorker(): Promise<{ ok: boolean; status?: number; error?: string; body?: unknown }> {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: setting } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", "library_worker_shared_key")
      .maybeSingle();
    const workerKey = typeof setting?.value === "string" ? setting.value : "";
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/library-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": ANON_KEY,
        "x-worker-key": workerKey,
      },
      body: "{}",
    });
    const text = await resp.text().catch(() => "");
    let body: unknown = text;
    try { body = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    return { ok: resp.ok, status: resp.status, body };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

async function enqueueLibraryBookProcessing(admin: any, bookId: string, request_id: string, api: string) {
  await logLibraryProcessingEvent(admin, bookId, null, "publish_started", "بدأ طلب نشر الكتاب وإنشاء مهمة المعالجة", "info", 0, { trace_id: request_id });
  const { data: rpcJobId, error: rpcErr } = await admin.rpc("enqueue_library_book_processing", { _book_id: bookId });
  if (!rpcErr && rpcJobId) return rpcJobId;

  logLibraryStep(request_id, api, "enqueue-rpc-required-failed", {
    book_id: bookId,
    rpc_error_code: rpcErr?.code || null,
    rpc_error_message: rpcErr?.message || null,
    rpc_job_id: rpcJobId || null,
  });

  throwDiagnostic({
    request_id,
    functionName: "enqueueLibraryBookProcessing",
    api,
    table: "library_processing_jobs",
    column: "enqueue_library_book_processing",
    sentValue: { book_id: bookId },
    expectedValue: "public.enqueue_library_book_processing(_book_id uuid) موجودة ومكشوفة لـ service_role في نفس قاعدة البيانات التي يستخدمها library-admin",
    failureReason: rpcErr?.message || "library_enqueue_rpc_returned_no_job",
    errorType: rpcErr?.code || "missing_required_rpc",
    layer: "database",
    details: {
      root_cause_guard: "library-admin must use the database queue RPC; direct table fallback is intentionally disabled so production drift is not hidden.",
    },
    lineHint: "library-admin enqueueLibraryBookProcessing: required RPC call",
    status: 500,
  });
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { error: json({ error: "unauthorized" }, 401) };
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return { error: json({ error: "unauthorized" }, 401) };
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  const isAdmin = (roles ?? []).some((r) => r.role === "admin");
  if (!isAdmin) return { error: json({ error: "forbidden" }, 403) };
  return { user: userData.user, admin };
}

async function validateLibraryScope(admin: any, body: any, request_id: string, api: string): Promise<{ track_id: string | null; track_code: string | null; subject: any }> {
  const stageId = body.stage_id || null;
  const gradeId = body.grade_id || null;
  const sectionId = body.section_id || null;
  const trackId = body.track_id || null;
  const subjectId = body.subject_id || null;
  const subSubjectId = body.sub_subject_id || null;
  let stageCode: string | null = null;
  let gradeCode: string | null = null;
  let sourceSubject: any = null;

  validateUuidOrThrow(request_id, api, "stage_id", stageId, "library_stages");
  validateUuidOrThrow(request_id, api, "grade_id", gradeId, "library_grades");
  validateUuidOrThrow(request_id, api, "section_id", sectionId, "library_sections");
  validateUuidOrThrow(request_id, api, "track_id", trackId, "library_tracks");
  validateUuidOrThrow(request_id, api, "subject_id", subjectId, "subjects");
  validateUuidOrThrow(request_id, api, "sub_subject_id", subSubjectId, "subjects");

  if (stageId) {
    const { data } = await admin.from("library_stages").select("id,code,is_active").eq("id", stageId).maybeSingle();
    if (!data?.is_active) throwDiagnostic({ request_id, functionName: "validateLibraryScope", api, table: "library_stages", column: "stage_id", sentValue: stageId, expectedValue: "مرحلة فعّالة في library_stages", failureReason: "invalid_stage", lineHint: "library-admin validateLibraryScope: stage lookup" });
    stageCode = data.code || null;
  }
  if (gradeId) {
    const { data } = await admin.from("library_grades").select("id,stage_id,code,is_active").eq("id", gradeId).maybeSingle();
    if (!data?.is_active || (stageId && data.stage_id !== stageId)) throwDiagnostic({ request_id, functionName: "validateLibraryScope", api, table: "library_grades", column: "grade_id", sentValue: gradeId, expectedValue: "صف فعّال تابع للمرحلة المحددة", failureReason: "invalid_grade_for_stage", details: { stage_id: stageId, actual_grade_stage_id: data?.stage_id }, lineHint: "library-admin validateLibraryScope: grade lookup" });
    gradeCode = data.code || null;
  }
  if (sectionId) {
    const { data } = await admin.from("library_sections").select("id,is_active").eq("id", sectionId).maybeSingle();
    if (!data?.is_active) throwDiagnostic({ request_id, functionName: "validateLibraryScope", api, table: "library_sections", column: "section_id", sentValue: sectionId, expectedValue: "نظام تعليمي فعّال في library_sections", failureReason: "invalid_section", lineHint: "library-admin validateLibraryScope: section lookup" });
  }
  let trackCode: string | null = null;
  let sectionCode: string | null = null;
  if (trackId) {
    const { data } = await admin.from("library_tracks").select("id,code,is_active").eq("id", trackId).maybeSingle();
    if (!data?.is_active) {
      logLibraryStep(request_id, api, "provided-track-id-not-valid-will-infer", {
        track_id: trackId,
        lookup_result: data || null,
      });
    } else {
      trackCode = data.code || null;
    }
  }
  if (sectionId) {
    const { data } = await admin.from("library_sections").select("id,code,is_active").eq("id", sectionId).maybeSingle();
    if (!data?.is_active) throwDiagnostic({ request_id, functionName: "validateLibraryScope", api, table: "library_sections", column: "section_id", sentValue: sectionId, expectedValue: "نظام تعليمي فعّال في library_sections", failureReason: "invalid_section", lineHint: "library-admin validateLibraryScope: section code lookup" });
    sectionCode = data.code || null;
  }
  if (!subjectId) {
    throwDiagnostic({ request_id, functionName: "validateLibraryScope", api, table: "subjects", column: "subject_id", sentValue: subjectId, expectedValue: "public.subjects.id موجود وفعّال", failureReason: "subject_id_required", errorType: "validation_error", lineHint: "library-admin validateLibraryScope: required subject" });
  }
  if (!stageId) {
    throwDiagnostic({ request_id, functionName: "validateLibraryScope", api, table: "library_stages", column: "stage_id", sentValue: stageId, expectedValue: "مرحلة فعّالة في library_stages", failureReason: "stage_id_required", errorType: "validation_error", lineHint: "library-admin validateLibraryScope: required stage" });
  }
  if (!gradeId) {
    throwDiagnostic({ request_id, functionName: "validateLibraryScope", api, table: "library_grades", column: "grade_id", sentValue: gradeId, expectedValue: "صف فعّال تابع للمرحلة المحددة", failureReason: "grade_id_required", errorType: "validation_error", lineHint: "library-admin validateLibraryScope: required grade" });
  }
  if (!sectionId) {
    throwDiagnostic({ request_id, functionName: "validateLibraryScope", api, table: "library_sections", column: "section_id", sentValue: sectionId, expectedValue: "نظام تعليمي فعّال في library_sections", failureReason: "section_id_required", errorType: "validation_error", lineHint: "library-admin validateLibraryScope: required section" });
  }

  if (subjectId) {
    logLibraryStep(request_id, api, "subject-trace-before-validation", {
      subject_id: subjectId,
      required_source_table: "public.subjects",
      subject_lookup_sql: "SELECT id,name,is_active,stage,grade,section,category FROM public.subjects WHERE id = $1",
    });
    const { data } = await admin
      .from("subjects")
      .select("id,name,is_active,stage,grade,section,category")
      .eq("id", subjectId)
      .maybeSingle();
    sourceSubject = data;
    if (!sourceSubject) {
      throwDiagnostic({ request_id, functionName: "validateLibraryScope", api, table: "subjects", column: "subject_id", sentValue: subjectId, expectedValue: "public.subjects.id فقط", failureReason: "subject_id_not_found_in_public_subjects", errorType: "relationship_error", details: { source_table_detected: "unknown", forbidden_source_table: "public.library_subjects", stage_id: stageId, grade_id: gradeId, section_id: sectionId, track_id: trackId, subject_lookup_sql: "SELECT id,name,is_active,stage,grade,section,category FROM public.subjects WHERE id = $1", insert_sql: "INSERT INTO public.library_books (..., subject_id, ...) VALUES (..., $1, ...)" }, lineHint: "library-admin validateLibraryScope: subject lookup must use public.subjects" });
    }
    logLibraryStep(request_id, api, "subject-trace-validation-ok", { subject_id: sourceSubject.id, source_table_detected: "public.subjects", subject_name: sourceSubject.name, subject_stage: sourceSubject.stage, subject_grade: sourceSubject.grade, subject_section: sourceSubject.section, subject_category: sourceSubject.category });
    if (sourceSubject.is_active === false) throwDiagnostic({ request_id, functionName: "validateLibraryScope", api, table: "subjects", column: "subject_id", sentValue: subjectId, expectedValue: "مادة فعّالة في subjects", correctValue: sourceSubject.id, failureReason: "subject_is_inactive", errorType: "validation_error", details: { subject_name: sourceSubject.name }, lineHint: "library-admin validateLibraryScope: subject active check" });
    if (stageCode && normalizeStageCode(sourceSubject.stage) !== normalizeStageCode(stageCode)) throwDiagnostic({ request_id, functionName: "validateLibraryScope", api, table: "subjects", column: "subject_id", sentValue: body.subject_id || subjectId, expectedValue: `مادة مرحلتها ${stageCode}`, correctValue: sourceSubject.id, failureReason: "invalid_subject_for_stage", errorType: "relationship_error", details: { subject_stage: sourceSubject.stage, selected_stage_code: stageCode }, lineHint: "library-admin validateLibraryScope: subject-stage match" });
    if (gradeCode && normalizeGradeCode(sourceSubject.grade) !== sourceGradeFromLibraryGradeCode(gradeCode)) throwDiagnostic({ request_id, functionName: "validateLibraryScope", api, table: "subjects", column: "subject_id", sentValue: body.subject_id || subjectId, expectedValue: `مادة صفها ${sourceGradeFromLibraryGradeCode(gradeCode)}`, correctValue: sourceSubject.id, failureReason: "invalid_subject_for_grade", errorType: "relationship_error", details: { subject_grade: sourceSubject.grade, selected_grade_code: gradeCode }, lineHint: "library-admin validateLibraryScope: subject-grade match" });
    const requiredSourceSection = sourceSectionFromTrackCode(trackCode);
    if (requiredSourceSection && sourceSectionFromTrackCode(sourceSubject.section) !== requiredSourceSection) throwDiagnostic({ request_id, functionName: "validateLibraryScope", api, table: "subjects", column: "subject_id", sentValue: body.subject_id || subjectId, expectedValue: `مادة شعبتها ${requiredSourceSection}`, correctValue: sourceSubject.id, failureReason: "invalid_subject_for_track", errorType: "relationship_error", details: { subject_section: sourceSubject.section, selected_track_code: trackCode }, lineHint: "library-admin validateLibraryScope: subject-track match" });
    const sourceName = String(sourceSubject.name || "");
    if (trackCode === "sci_science" && (sourceName.includes("رياضيات") || sourceName.includes("الرياضيات"))) throwDiagnostic({ request_id, functionName: "validateLibraryScope", api, table: "subjects", column: "subject_id", sentValue: body.subject_id || subjectId, expectedValue: "مادة علمي علوم وليست رياضيات", correctValue: sourceSubject.id, failureReason: "invalid_subject_for_sci_science_track", errorType: "relationship_error", details: { subject_name: sourceName }, lineHint: "library-admin validateLibraryScope: sci_science guard" });
    if (trackCode === "sci_math" && (sourceName.includes("أحياء") || sourceName.includes("احياء") || sourceName.includes("الأحياء"))) throwDiagnostic({ request_id, functionName: "validateLibraryScope", api, table: "subjects", column: "subject_id", sentValue: body.subject_id || subjectId, expectedValue: "مادة علمي رياضة وليست أحياء", correctValue: sourceSubject.id, failureReason: "invalid_subject_for_sci_math_track", errorType: "relationship_error", details: { subject_name: sourceName }, lineHint: "library-admin validateLibraryScope: sci_math guard" });
    const sourceCategory = String(sourceSubject.category || "").toLowerCase();
    if ((body.education_type === "عام" || sectionCode === "general") && ["sharia", "religious"].includes(sourceCategory)) throwDiagnostic({ request_id, functionName: "validateLibraryScope", api, table: "subjects", column: "subject_id", sentValue: body.subject_id || subjectId, expectedValue: "مادة غير شرعية عند اختيار النظام العام", correctValue: sourceSubject.id, failureReason: "invalid_general_subject_category", errorType: "relationship_error", details: { subject_category: sourceCategory, section_code: sectionCode }, lineHint: "library-admin validateLibraryScope: general category guard" });
  }
  if (subSubjectId) {
    const { data: subSubject } = await admin
      .from("subjects")
      .select("id,name,is_active,stage,grade,section,category")
      .eq("id", subSubjectId)
      .maybeSingle();
    if (!subSubject?.id || subSubject.is_active === false) {
      throwDiagnostic({ request_id, functionName: "validateLibraryScope", api, table: "subjects", column: "sub_subject_id", sentValue: subSubjectId, expectedValue: "public.subjects.id فعّال للمادة الفرعية", failureReason: "sub_subject_id_not_found_in_public_subjects", errorType: "relationship_error", details: { source_table_detected: "public.subjects", subject_lookup_sql: "SELECT id,name,is_active,stage,grade,section,category FROM public.subjects WHERE id = $1" }, lineHint: "library-admin validateLibraryScope: sub subject lookup" });
    }
  }
  const sourceTrack = sourceSectionFromTrackCode(sourceSubject?.section);
  let resolvedTrackId = trackId;
  if (stageCode === "secondary" && sourceTrack && !resolvedTrackId) {
    const inferredTrack = await ensureLibraryTrack(admin, request_id, api, sourceTrack);
    resolvedTrackId = inferredTrack.id;
    trackCode = inferredTrack.code || sourceTrack;
    logLibraryStep(request_id, api, "secondary-track-inferred-from-subject", {
      subject_id: subjectId,
      subject_section: sourceSubject?.section,
      inferred_track_code: trackCode,
      inferred_track_id: resolvedTrackId,
    });
  } else if (stageCode === "secondary" && sourceTrack && resolvedTrackId && !trackCode) {
    const inferredTrack = await ensureLibraryTrack(admin, request_id, api, sourceTrack);
    resolvedTrackId = inferredTrack.id;
    trackCode = inferredTrack.code || sourceTrack;
    logLibraryStep(request_id, api, "invalid-provided-track-replaced-from-subject", {
      provided_track_id: trackId,
      subject_id: subjectId,
      subject_section: sourceSubject?.section,
      inferred_track_code: trackCode,
      inferred_track_id: resolvedTrackId,
    });
  }
  return { track_id: resolvedTrackId, track_code: trackCode, subject: sourceSubject };
}

function missingSchemaColumn(error: any): string | null {
  const message = String(error?.message || error || "");
  const match = message.match(/'([^']+)' column/i) || message.match(/column\s+[^.]+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  return match?.[1] || null;
}

async function insertWithSchemaRetry(admin: any, tableName: string, payload: Record<string, unknown>, request_id: string, api: string) {
  let clean = { ...payload };
  for (let attempt = 0; attempt < 6; attempt++) {
    if (tableName === "library_books") {
      const subjectId = typeof clean.subject_id === "string" ? clean.subject_id : null;
      let subjectRow: any = null;
      if (subjectId) {
        const { data: s } = await admin
          .from("subjects")
          .select("id,name,category,stage,grade,section,is_active")
          .eq("id", subjectId)
          .maybeSingle();
        subjectRow = s;
      }
      const insertSql = `INSERT INTO public.${tableName} (${Object.keys(clean).join(", ")}) VALUES (${Object.keys(clean).map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`;
      logLibraryStep(request_id, api, "library-books-subject-pre-insert-trace", {
        all_subject_ids_before_insert: [subjectId].filter(Boolean),
        subject_id: subjectId,
        exists_in_public_subjects: !!subjectRow,
        source_table_detected: subjectRow ? "public.subjects" : "unknown",
        forbidden_source_table: "public.library_subjects",
        subject_row: subjectRow,
        subject_lookup_sql: "SELECT id,name,category,stage,grade,section,is_active FROM public.subjects WHERE id = $1",
        insert_sql: insertSql,
      });
      if (subjectId && !subjectRow) {
        throwDiagnostic({ request_id, functionName: "insertWithSchemaRetry", api, table: tableName, column: "subject_id", sentValue: subjectId, expectedValue: "public.subjects.id موجود قبل INSERT", failureReason: "subject_id_missing_before_insert", errorType: "relationship_error", layer: "database", details: { source_table_detected: "unknown", forbidden_source_table: "public.library_subjects", subject_lookup_sql: "SELECT id,name,category,stage,grade,section,is_active FROM public.subjects WHERE id = $1", insert_sql: insertSql }, lineHint: "library-admin insertWithSchemaRetry: subject pre-insert trace" });
      }
    }
    logLibraryStep(request_id, api, "db-insert-attempt", { table: tableName, attempt: attempt + 1, payload: clean });
    const { data, error } = await admin.from(tableName).insert(clean).select().single();
    if (!error) return { data, error: null };
    const missing = missingSchemaColumn(error);
    if (!missing || !(missing in clean)) throw dbErrorToDiagnostic(error, { request_id, functionName: "insertWithSchemaRetry", api, table: tableName, payload: clean });
    logLibraryStep(request_id, api, "db-insert-schema-cache-column-removed", { table: tableName, missing_column: missing });
    delete clean[missing];
  }
  throwDiagnostic({ request_id, functionName: "insertWithSchemaRetry", api, table: tableName, column: "schema", sentValue: Object.keys(payload), expectedValue: "أعمدة موجودة في schema cache", failureReason: "schema_retry_exhausted", errorType: "schema_cache_error", layer: "database" });
}

async function updateWithSchemaRetry(admin: any, tableName: string, patch: Record<string, unknown>, id: string, request_id: string, api: string) {
  let clean = { ...patch };
  for (let attempt = 0; attempt < 6; attempt++) {
    logLibraryStep(request_id, api, "db-update-attempt", { table: tableName, id, attempt: attempt + 1, patch: clean });
    const { data, error } = await admin.from(tableName).update(clean).eq("id", id).select().single();
    if (!error) return { data, error: null };
    const missing = missingSchemaColumn(error);
    if (!missing || !(missing in clean)) throw dbErrorToDiagnostic(error, { request_id, functionName: "updateWithSchemaRetry", api, table: tableName, payload: { id, ...clean } });
    logLibraryStep(request_id, api, "db-update-schema-cache-column-removed", { table: tableName, missing_column: missing });
    delete clean[missing];
  }
  throwDiagnostic({ request_id, functionName: "updateWithSchemaRetry", api, table: tableName, column: "schema", sentValue: Object.keys(patch), expectedValue: "أعمدة موجودة في schema cache", failureReason: "schema_retry_exhausted", errorType: "schema_cache_error", layer: "database" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const rid = req.headers.get("x-library-trace-id") || requestId();

  const gate = await requireAdmin(req);
  if ("error" in gate) return gate.error;
  const { admin, user } = gate;

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "stats";
  const api = `library-admin?action=${action}`;

  try {
    logLibraryStep(rid, action, "request-start", { method: req.method, action });
    switch (action) {
      case "stats": {
        const [{ count: booksTotal }, { count: booksReady }, { count: booksProcessing }, { count: booksFailed }, { data: recent }] = await Promise.all([
          admin.from("library_books").select("id", { count: "exact", head: true }),
          admin.from("library_books").select("id", { count: "exact", head: true }).eq("status", "ready"),
          admin.from("library_books").select("id", { count: "exact", head: true }).in("status", ["uploading", "processing"]),
          admin.from("library_books").select("id", { count: "exact", head: true }).eq("status", "failed"),
          admin.from("library_books").select("id,title,status,cover_url,subject_name_ar,page_count,created_at").order("created_at", { ascending: false }).limit(10),
        ]);
        // (pages count is derived below from allBooks; skip optional RPC)
        const { data: allBooks } = await admin.from("library_books").select("file_size,page_count,subject_id,stage_id");
        const totalPages = (allBooks ?? []).reduce((s, b: any) => s + (b.page_count || 0), 0);
        const totalBytes = (allBooks ?? []).reduce((s, b: any) => s + Number(b.file_size || 0), 0);
        const subjectsCount = new Set((allBooks ?? []).map((b: any) => b.subject_id).filter(Boolean)).size;
        const stagesCount = new Set((allBooks ?? []).map((b: any) => b.stage_id).filter(Boolean)).size;
        const { count: audioCount } = await admin.from("library_section_explanations").select("id", { count: "exact", head: true }).not("audio_path", "is", null);

        return json({
          version: LIBRARY_ADMIN_VERSION,
          totals: {
            books: booksTotal || 0,
            pages: totalPages,
            subjects: subjectsCount,
            stages: stagesCount,
            ready: booksReady || 0,
            processing: booksProcessing || 0,
            failed: booksFailed || 0,
            audioClips: audioCount || 0,
            storageBytes: totalBytes,
          },
          recent: recent || [],
        });
      }

      case "list": {
        const status = url.searchParams.get("status");
        let q = admin.from("library_books").select("*").order("created_at", { ascending: false }).limit(200);
        if (status) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) throw error;
        return json({ version: LIBRARY_ADMIN_VERSION, books: data ?? [] });
      }

      case "get": {
        const id = url.searchParams.get("id");
        if (!id) return json({ error: "id required" }, 400);
        const { data, error } = await admin.from("library_books").select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        return json({ version: LIBRARY_ADMIN_VERSION, book: data });
      }

      case "create": {
        const body = await req.json().catch(() => ({}));
        logLibraryStep(rid, action, "create-body-received", {
          title: body?.title,
          education_type: body?.education_type,
          stage_id: body?.stage_id,
          grade_id: body?.grade_id,
          section_id: body?.section_id,
          track_id: body?.track_id,
          subject_id: body?.subject_id,
          term: body?.term,
          debug: body?._debug,
          version: LIBRARY_ADMIN_VERSION,
        });
        const scope = await validateLibraryScope(admin, body, rid, api);
        const insertData: any = {
          title: String(body.title || "بدون عنوان").slice(0, 300),
          description: body.description ? String(body.description).slice(0, 2000) : null,
          education_type: ["عام", "أزهر", "both"].includes(body.education_type) ? body.education_type : "عام",
          stage_id: body.stage_id || null,
          grade_id: body.grade_id || null,
          section_id: body.section_id || null,
          track_id: scope.track_id || body.track_id || null,
          subject_id: body.subject_id || null,
          sub_subject_id: body.sub_subject_id || body.subject_id || null,
          subject_name_ar: body.subject_name_ar || null,
          sub_subject_name: body.sub_subject_name || null,
          term: ["annual", "term1", "term2"].includes(body.term) ? body.term : null,
          access_tier: ["free", "premium", "vip"].includes(body.access_tier) ? body.access_tier : "free",
          status: "draft",
          created_by: user.id,
        };
        const { data } = await insertWithSchemaRetry(admin, "library_books", insertData, rid, api);
        logLibraryStep(rid, action, "create-success", { version: LIBRARY_ADMIN_VERSION, book_id: data?.id, subject_id: data?.subject_id, sub_subject_id: data?.sub_subject_id, term: data?.term });
        return json({ version: LIBRARY_ADMIN_VERSION, book: data });
      }

      case "update": {
        const body = await req.json().catch(() => ({}));
        const { id, ...patch } = body || {};
        if (!id) return json({ error: "id required" }, 400);
        if (["stage_id", "grade_id", "section_id", "track_id", "subject_id"].some((k) => k in patch)) {
          const { data: current } = await admin.from("library_books").select("stage_id,grade_id,section_id,track_id,subject_id").eq("id", id).maybeSingle();
          await validateLibraryScope(admin, { ...(current || {}), ...patch }, rid, api);
        }
        const allowed = ["title", "description", "cover_url", "pdf_path", "education_type", "stage_id", "grade_id", "section_id", "track_id", "subject_id", "sub_subject_id", "subject_name_ar", "sub_subject_name", "term", "page_count", "file_size", "status", "processing_progress", "processing_stage", "processing_error", "access_tier", "published_at"];
        const clean: Record<string, unknown> = {};
        for (const k of allowed) if (k in patch) clean[k] = (patch as any)[k];
        const { data } = await updateWithSchemaRetry(admin, "library_books", clean, id, rid, api);
        return json({ version: LIBRARY_ADMIN_VERSION, book: data });
      }

      case "publish": {
        // Enqueue background processing. The library-worker will parse the PDF,
        // extract per-page text, save sections, and flip status to 'ready' on
        // completion. Progress is tracked in library_books.processing_progress
        // and per-job rows in library_processing_jobs.
        const body = await req.json().catch(() => ({}));
        const id = body.id;
        if (!id) return json({ error: "id required" }, 400);
        const jobId = await enqueueLibraryBookProcessing(admin, id, rid, api);
        await logLibraryProcessingEvent(admin, id, jobId, "publish_requested", "تم نشر الكتاب وطلب بدء المعالجة فوراً", "info", 0, { trace_id: rid });
        // Kick the worker immediately so the user sees progress without waiting for the next cron tick.
        const workerKick = await kickWorker();
        await logLibraryProcessingEvent(
          admin,
          id,
          jobId,
          workerKick.ok ? "worker_kick_succeeded" : "worker_kick_failed",
          workerKick.ok ? "تم استدعاء عامل معالجة المكتبة فوراً" : "فشل الاستدعاء الفوري لعامل المكتبة وستحاول الجدولة الدورية تشغيله",
          workerKick.ok ? "success" : "warning",
          workerKick.ok ? 1 : 0,
          { trace_id: rid, status: workerKick.status ?? null, error: workerKick.error ?? null, body: workerKick.body ?? null },
        );
        const { data: book } = await admin.from("library_books").select("*").eq("id", id).maybeSingle();
        return json({ version: LIBRARY_ADMIN_VERSION, book, job_id: jobId, worker_kick: workerKick });
      }

      case "retry_book": {
        const body = await req.json().catch(() => ({}));
        const id = body.id;
        if (!id) return json({ error: "id required" }, 400);
        // Wipe extracted content so the fresh run rebuilds everything.
        await admin.from("library_generated_quizzes").delete().eq("book_id", id);
        await admin.from("library_section_explanations").delete().eq("book_id", id);
        await admin.from("library_book_chunks").delete().eq("book_id", id);
        await admin.from("library_book_index").delete().eq("book_id", id);
        await admin.from("library_book_sections").delete().eq("book_id", id);
        await admin.from("library_book_pages").delete().eq("book_id", id);
        await admin.from("library_processing_jobs").delete().eq("book_id", id);
        const jobId = await enqueueLibraryBookProcessing(admin, id, rid, api);
        await logLibraryProcessingEvent(admin, id, jobId, "retry_book_requested", "تم طلب إعادة معالجة الكتاب بالكامل", "info", 0, { trace_id: rid });
        const workerKick = await kickWorker();
        await logLibraryProcessingEvent(admin, id, jobId, workerKick.ok ? "worker_kick_succeeded" : "worker_kick_failed", workerKick.ok ? "تم استدعاء عامل معالجة المكتبة فوراً" : "فشل الاستدعاء الفوري لعامل المكتبة وستحاول الجدولة الدورية تشغيله", workerKick.ok ? "success" : "warning", workerKick.ok ? 1 : 0, { trace_id: rid, status: workerKick.status ?? null, error: workerKick.error ?? null, body: workerKick.body ?? null });
        return json({ version: LIBRARY_ADMIN_VERSION, ok: true, job_id: jobId, worker_kick: workerKick });
      }

      case "retry_page": {
        const body = await req.json().catch(() => ({}));
        const bookId = body.book_id;
        const pageNumber = Number(body.page_number || 0);
        if (!bookId || !pageNumber) return json({ error: "book_id and page_number required" }, 400);
        // Insert or replace a single-page job.
        await admin.from("library_generated_quizzes").delete().eq("book_id", bookId);
        await admin.from("library_section_explanations").delete().eq("book_id", bookId);
        await admin
          .from("library_processing_jobs")
          .delete()
          .eq("book_id", bookId)
          .eq("kind", "extract_page")
          .eq("page_number", pageNumber);
        const { data: job, error: jErr } = await admin
          .from("library_processing_jobs")
          .insert({
            book_id: bookId,
            kind: "extract_page",
            page_number: pageNumber,
            stage: "extract_page",
            state: "queued",
          })
          .select()
          .single();
        if (jErr) throw jErr;
        await logLibraryProcessingEvent(admin, bookId, job.id, "retry_page_requested", "تم طلب إعادة معالجة صفحة واحدة", "info", null, { trace_id: rid, page_number: pageNumber });
        const workerKick = await kickWorker();
        await logLibraryProcessingEvent(admin, bookId, job.id, workerKick.ok ? "worker_kick_succeeded" : "worker_kick_failed", workerKick.ok ? "تم استدعاء عامل معالجة المكتبة فوراً" : "فشل الاستدعاء الفوري لعامل المكتبة وستحاول الجدولة الدورية تشغيله", workerKick.ok ? "success" : "warning", null, { trace_id: rid, status: workerKick.status ?? null, error: workerKick.error ?? null, body: workerKick.body ?? null });
        return json({ version: LIBRARY_ADMIN_VERSION, ok: true, job, worker_kick: workerKick });
      }

      case "book_progress": {
        const id = url.searchParams.get("id");
        if (!id) return json({ error: "id required" }, 400);
        const [{ data: book }, { data: jobs }, { data: events }, { count: pagesCount }] = await Promise.all([
          admin.from("library_books").select("*").eq("id", id).maybeSingle(),
          admin
            .from("library_processing_jobs")
            .select("*")
            .eq("book_id", id)
            .order("created_at", { ascending: false })
            .limit(50),
          admin
            .from("library_processing_events")
            .select("*")
            .eq("book_id", id)
            .order("created_at", { ascending: false })
            .limit(100),
          admin
            .from("library_book_pages")
            .select("id", { count: "exact", head: true })
            .eq("book_id", id),
        ]);
        return json({
          version: LIBRARY_ADMIN_VERSION,
          book,
          jobs: jobs ?? [],
          events: events ?? [],
          pages_done: pagesCount ?? 0,
          pages_total: book?.page_count ?? 0,
        });
      }

      case "worker_tick": {
        const r = await kickWorker();
        return json({ version: LIBRARY_ADMIN_VERSION, ok: true, result: r });
      }

      case "hide":
      case "pause":
      case "resume": {
        const body = await req.json().catch(() => ({}));
        const id = body.id;
        if (!id) return json({ error: "id required" }, 400);
        const nextStatus = action === "hide" ? "hidden" : action === "pause" ? "paused" : "ready";
        const { data, error } = await admin.from("library_books").update({ status: nextStatus }).eq("id", id).select().single();
        if (error) throw error;
        return json({ version: LIBRARY_ADMIN_VERSION, book: data });
      }

      case "delete": {
        const body = await req.json().catch(() => ({}));
        const id = body.id;
        if (!id) return json({ error: "id required" }, 400);
        const { error } = await admin.from("library_books").delete().eq("id", id);
        if (error) throw error;
        return json({ version: LIBRARY_ADMIN_VERSION, ok: true });
      }

      case "taxonomy": {
        // Returns live picker data for the wizard. Do not call legacy sync RPCs
        // here: the upload UI is now linked to the real `subjects` table and
        // must not depend on optional library_subjects grade columns.
        const [{ data: stages }, { data: grades }, { data: sections }, { data: tracks }, { data: subjects }] = await Promise.all([
          admin.from("library_stages").select("id,code,name_ar,sort_order").eq("is_active", true).order("sort_order"),
          admin.from("library_grades").select("id,stage_id,code,name_ar,sort_order").eq("is_active", true).order("sort_order"),
          admin.from("library_sections").select("id,code,name_ar,sort_order").eq("is_active", true).order("sort_order"),
          admin.from("library_tracks").select("id,code,name_ar,sort_order").eq("is_active", true).order("sort_order"),
          admin.from("subjects").select("id,name,category,section,stage,grade,is_active").eq("is_active", true).order("category", { ascending: true }).order("name", { ascending: true }),
        ]);
        return json({ version: LIBRARY_ADMIN_VERSION, stages: stages ?? [], grades: grades ?? [], sections: sections ?? [], tracks: tracks ?? [], subjects: subjects ?? [], subject_source_table: "public.subjects" });
      }

      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    const diagnostic = err instanceof LibraryDiagnosticError ? err.report : diagnosticReport({
      request_id: rid,
      functionName: "Deno.serve",
      api,
      table: "library_books",
      column: "unknown",
      sentValue: null,
      expectedValue: "عملية مكتبة ناجحة",
      failureReason: String(err?.message || err),
      errorType: err?.name || "unhandled_error",
      layer: "api",
      details: { stack: err?.stack },
    });
    console.error("[library-admin-debug] error", JSON.stringify({ request_id: rid, action, diagnostic }));
    return json({ error: diagnostic.failure_reason || String(err?.message || err), diagnostic }, err instanceof LibraryDiagnosticError ? err.status : 500);
  }
});
