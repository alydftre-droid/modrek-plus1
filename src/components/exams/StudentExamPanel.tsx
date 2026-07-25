import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStudentExamCatalog } from "@/hooks/useExams";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Clock, ArrowLeft, Lock, Sparkles, AlertTriangle, Copy, Bug } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  subjectId: string;
  subjectName?: string;
  groupId?: string;
  subSubjectId?: string;
  isSubscribed?: boolean;
  currentTerm?: string;
  onRequireSubscription?: () => void;
}

type ExamVisibilityDebugRow = {
  exam_id: string | null;
  title: string | null;
  visibility_status: "visible" | "hidden" | string | null;
  reason_code: string | null;
  reason: string | null;
  source_file: string | null;
  source_function: string | null;
  requested_group_id: string | null;
  exam_group_id: string | null;
  exam_subject_id: string | null;
  requested_subject_id: string | null;
  normalized_target_section: string | null;
  normalized_target_education_type: string | null;
  student_section: string | null;
  student_education_type: string | null;
  term_matches: boolean | null;
  target_matches: boolean | null;
  in_broadcast_scope: boolean | null;
  sub_subject_matches: boolean | null;
  is_published: boolean | null;
  status: string | null;
};

const EXAM_DIAGNOSTIC_SOURCE = "src/components/exams/StudentExamPanel.tsx";
const EXAM_DIAGNOSTIC_LOCATIONS = {
  panelFilter: "src/components/exams/StudentExamPanel.tsx:67-85",
  diagnosticLoader: "src/components/exams/StudentExamPanel.tsx:91-122",
  catalogHook: "src/hooks/useExams.ts:50-105",
  createExamHook: "src/hooks/useExamMutations.ts:201-274",
  databaseCatalog: "database:function public.get_student_group_exam_catalog",
  databaseDiagnostic: "database:function public.diagnose_student_group_exam_visibility",
  databaseBroadcast: "database:function public.exam_broadcast_group_ids",
  databaseTargeting: "database:function public.exam_target_matches_student",
};

const createTraceId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `exam-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const formatDebugValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "غير محدد";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  return String(value);
};

/**
 * Lightweight in-tab listing of exams scoped to a subject/group.
 * Full experience lives at /student/exams.
 */
export default function StudentExamPanel({ subjectId, groupId, subSubjectId, isSubscribed = true, currentTerm, onRequireSubscription }: Props) {
  const navigate = useNavigate();
  const { data: catalog, isLoading, error: catalogError } = useStudentExamCatalog({ subjectId, groupId, term: currentTerm, subSubjectId });
  const [debugRows, setDebugRows] = useState<ExamVisibilityDebugRow[]>([]);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [traceId, setTraceId] = useState(() => createTraceId());
  const catalogErrorMessage = catalogError
    ? catalogError instanceof Error
      ? catalogError.message
      : String((catalogError as any)?.message || catalogError)
    : null;
  const exams = catalog?.exams || [];
  const attempts = catalog?.attempts || [];
  const attemptByExam = new Map(attempts.map((attempt: any) => [attempt.exam_id, attempt]));
  const filtered = exams.filter((e: any) => {
    if (groupId) return true;
    if (subSubjectId && e.sub_subject_id && e.sub_subject_id !== subSubjectId) return false;
    if (currentTerm && e.term && e.term !== currentTerm) return false;
    if (e.subject_id !== subjectId) return false;
    return true;
  });

  useEffect(() => {
    setTraceId(createTraceId());
  }, [groupId, subSubjectId, subjectId, currentTerm]);

  useEffect(() => {
    let cancelled = false;
    if (!groupId) {
      setDebugRows([]);
      setDebugError(null);
      setDebugLoading(false);
      return;
    }

    const loadDiagnostics = async () => {
      setDebugLoading(true);
      let { data, error } = await (supabase as any).rpc("diagnose_student_group_exam_visibility", {
        _group_id: groupId,
        _sub_subject_id: subSubjectId || null,
      });

      if (error && /schema cache|could not find the function/i.test(error.message || "")) {
        const fallback = await (supabase as any).rpc("debug_student_group_exam_visibility", {
          _group_id: groupId,
          _sub_subject_id: subSubjectId || null,
        });
        data = fallback.data;
        error = fallback.error;
      }

      if (cancelled) return;
      setDebugLoading(false);
      if (error) {
        setDebugRows([]);
        setDebugError(error.message || "تعذر تشغيل تشخيص الامتحانات");
        return;
      }
      setDebugRows((data || []) as ExamVisibilityDebugRow[]);
      setDebugError(null);
    };

    loadDiagnostics();
    return () => {
      cancelled = true;
    };
  }, [currentTerm, groupId, subSubjectId, subjectId]);

  const hiddenDebugRows = useMemo(
    () => debugRows.filter((row) => row.visibility_status !== "visible"),
    [debugRows],
  );
  const visibleDebugRows = useMemo(
    () => debugRows.filter((row) => row.visibility_status === "visible"),
    [debugRows],
  );

  const catalogMismatch = filtered.length === 0 && visibleDebugRows.length > 0;
  const noDiagnosticSignal = !debugLoading && !debugError && debugRows.length === 0;
  const shouldShowDiagnostics = Boolean(
    !isLoading
      && groupId
      && (
        filtered.length === 0
        || debugLoading
        || Boolean(catalogErrorMessage)
        || Boolean(debugError)
        || catalogMismatch
        || noDiagnosticSignal
        || hiddenDebugRows.length > 0
      ),
  );

  const diagnosticReport = useMemo(() => {
    const lines = [
      "EXAM_VISIBILITY_DIAGNOSTIC",
      `Trace ID: ${traceId}`,
      `UI File: ${EXAM_DIAGNOSTIC_SOURCE}`,
      `UI Hook: useStudentExamCatalog`,
      `Frontend filter location: ${EXAM_DIAGNOSTIC_LOCATIONS.panelFilter}`,
      `Diagnostic loader location: ${EXAM_DIAGNOSTIC_LOCATIONS.diagnosticLoader}`,
      `Catalog hook location: ${EXAM_DIAGNOSTIC_LOCATIONS.catalogHook}`,
      `Exam creation hook location: ${EXAM_DIAGNOSTIC_LOCATIONS.createExamHook}`,
      `Database catalog function: ${EXAM_DIAGNOSTIC_LOCATIONS.databaseCatalog}`,
      `Database diagnostic function: ${EXAM_DIAGNOSTIC_LOCATIONS.databaseDiagnostic}`,
      `Database broadcast function: ${EXAM_DIAGNOSTIC_LOCATIONS.databaseBroadcast}`,
      `Database targeting function: ${EXAM_DIAGNOSTIC_LOCATIONS.databaseTargeting}`,
      `Group ID: ${formatDebugValue(groupId)}`,
      `Subject ID: ${formatDebugValue(subjectId)}`,
      `Sub Subject ID: ${formatDebugValue(subSubjectId)}`,
      `Current Term: ${formatDebugValue(currentTerm)}`,
      `Returned exams count: ${exams.length}`,
      `Displayed exams count: ${filtered.length}`,
      `Database visible exams count: ${visibleDebugRows.length}`,
      `Catalog mismatch: ${formatDebugValue(catalogMismatch)}`,
      `Diagnostic loading: ${formatDebugValue(debugLoading)}`,
      `No diagnostic signal: ${formatDebugValue(noDiagnosticSignal)}`,
      `Subscribed: ${formatDebugValue(isSubscribed)}`,
    ];

    if (noDiagnosticSignal) {
      lines.push(
        "Primary issue: diagnostic_returned_no_rows",
        "Reason code: diagnostic_returned_no_rows",
        `Source file: ${EXAM_DIAGNOSTIC_LOCATIONS.databaseDiagnostic} + ${EXAM_DIAGNOSTIC_LOCATIONS.catalogHook}`,
        "Reason: دالة التشخيص لم تُرجع أي صفوف بعد اختفاء الامتحانات. هذا يعني أن طلب التشخيص لم يصل أو أن شروط البحث عن الامتحانات ضيقة جداً قبل مرحلة تحديد السبب.",
      );
    }

    if (catalogErrorMessage) {
      lines.push(`Catalog RPC Error: ${catalogErrorMessage}`);
    }

    if (debugError) {
      lines.push(`Diagnostic RPC Error: ${debugError}`);
    }

    if (debugRows.length === 0 && !debugError) {
      lines.push("Diagnostic rows: 0");
    }

    debugRows.forEach((row, index) => {
      lines.push(
        "---",
        `#${index + 1}`,
        `Exam: ${formatDebugValue(row.title)} (${formatDebugValue(row.exam_id)})`,
        `Visibility: ${formatDebugValue(row.visibility_status)}`,
        `Reason code: ${formatDebugValue(row.reason_code)}`,
        `Reason: ${formatDebugValue(row.reason)}`,
        `Source file: ${formatDebugValue(row.source_file)}`,
        `Source function: ${formatDebugValue(row.source_function)}`,
        `Requested group: ${formatDebugValue(row.requested_group_id)}`,
        `Exam group: ${formatDebugValue(row.exam_group_id)}`,
        `Requested subject: ${formatDebugValue(row.requested_subject_id)}`,
        `Exam subject: ${formatDebugValue(row.exam_subject_id)}`,
        `Student section: ${formatDebugValue(row.student_section)}`,
        `Student education type: ${formatDebugValue(row.student_education_type)}`,
        `Target section: ${formatDebugValue(row.normalized_target_section)}`,
        `Target education type: ${formatDebugValue(row.normalized_target_education_type)}`,
        `Term matches: ${formatDebugValue(row.term_matches)}`,
        `Target matches: ${formatDebugValue(row.target_matches)}`,
        `Broadcast scope: ${formatDebugValue(row.in_broadcast_scope)}`,
        `Sub-subject matches: ${formatDebugValue(row.sub_subject_matches)}`,
        `Published: ${formatDebugValue(row.is_published)}`,
        `Status: ${formatDebugValue(row.status)}`,
      );
    });

    return lines.join("\n");
  }, [catalogErrorMessage, catalogMismatch, currentTerm, debugError, debugLoading, debugRows, exams.length, filtered.length, groupId, isSubscribed, noDiagnosticSignal, subSubjectId, subjectId, traceId, visibleDebugRows.length]);

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticReport);
      toast.success("تم نسخ تقرير تشخيص الامتحانات");
    } catch (error) {
      toast.error("تعذر نسخ التقرير تلقائياً");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="space-y-3">
        <Card className="text-center p-8 border-dashed">
          <ClipboardList className="h-12 w-12 mx-auto text-primary mb-3" />
          <p className="text-muted-foreground">لا توجد امتحانات متاحة حالياً</p>
        </Card>
        {shouldShowDiagnostics && (
          <ExamVisibilityDiagnostics
            traceId={traceId}
            rows={debugRows}
            hiddenRows={hiddenDebugRows}
            isLoading={debugLoading}
            noDiagnosticSignal={noDiagnosticSignal}
            catalogMismatch={catalogMismatch}
            catalogError={catalogErrorMessage}
            error={debugError}
            report={diagnosticReport}
            onCopy={copyDiagnostics}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {shouldShowDiagnostics && (
        <ExamVisibilityDiagnostics
          traceId={traceId}
          rows={debugRows}
          hiddenRows={hiddenDebugRows}
          isLoading={debugLoading}
          noDiagnosticSignal={noDiagnosticSignal}
          catalogMismatch={catalogMismatch}
          catalogError={catalogErrorMessage}
          error={debugError}
          report={diagnosticReport}
          onCopy={copyDiagnostics}
        />
      )}
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-foreground">الامتحانات المتاحة ({filtered.length})</h3>
        <Button variant="ghost" size="sm" className="text-primary" onClick={() => navigate("/student/exams")}>
          عرض الكل <ArrowLeft className="h-4 w-4 mr-1" />
        </Button>
      </div>
      {filtered.map((exam: any) => {
        const now = Date.now();
        const startsAt = exam.start_at ? new Date(exam.start_at).getTime() : null;
        const endsAt = exam.end_at ? new Date(exam.end_at).getTime() : null;
        const isUpcoming = startsAt && now < startsAt;
        const myAttempt: any = attemptByExam.get(exam.id);
        const isEnded = (endsAt && now > endsAt) || (myAttempt && myAttempt.status !== "in_progress");
        const isAvailable = !isUpcoming && !isEnded;
        const isLockedBySubscription = !isSubscribed || exam.is_accessible === false;
        const canOpenExam = !isLockedBySubscription && isAvailable;
        return (
          <Card
            key={exam.id}
            className="cursor-pointer overflow-hidden rounded-[20px] border-border bg-card shadow-sm transition hover:shadow-md"
            onClick={() => {
              if (canOpenExam) navigate(`/student/exams/${exam.id}`);
              else if (isLockedBySubscription) {
                toast("🔒 يجب الاشتراك في هذه المجموعة أولاً لمشاهدة جميع المحتويات التعليمية.", {
                  duration: 3500,
                });
              }
            }}
          >
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-extrabold truncate text-foreground">{exam.title}</h4>
                  {exam.is_ai_generated && <Badge variant="outline" className="text-[10px]">AI</Badge>}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{exam.duration_minutes} د</span>
                  {isUpcoming && <Badge variant="secondary">قادم</Badge>}
                  {isEnded && <Badge variant="destructive">{myAttempt ? `${myAttempt.percentage}%` : "منتهي"}</Badge>}
                  {!isLockedBySubscription && isAvailable && <Badge className="border-0 bg-primary text-primary-foreground">متاح</Badge>}
                </div>
              </div>
              <div className="shrink-0">
                {isLockedBySubscription ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <Lock className="h-2.5 w-2.5" />
                    مقفول
                  </span>
                ) : (
                  <Button
                    size="sm"
                    disabled={!canOpenExam}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (canOpenExam) navigate(`/student/exams/${exam.id}`);
                    }}
                  >
                    افتح
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ExamVisibilityDiagnostics({
  traceId,
  rows,
  hiddenRows,
  isLoading,
  noDiagnosticSignal,
  catalogMismatch,
  catalogError,
  error,
  report,
  onCopy,
}: {
  traceId: string;
  rows: ExamVisibilityDebugRow[];
  hiddenRows: ExamVisibilityDebugRow[];
  isLoading: boolean;
  noDiagnosticSignal: boolean;
  catalogMismatch: boolean;
  catalogError: string | null;
  error: string | null;
  report: string;
  onCopy: () => void;
}) {
  const primaryIssue = catalogError
    ? { title: "تعذر تحميل كتالوج الامتحانات", reason_code: "catalog_rpc_failed", reason: catalogError, source_file: `${EXAM_DIAGNOSTIC_LOCATIONS.catalogHook} + ${EXAM_DIAGNOSTIC_LOCATIONS.databaseCatalog}`, source_function: "useStudentExamCatalog" }
    : catalogMismatch
      ? { title: "القاعدة ترى امتحان ظاهر لكن الواجهة لا تعرضه", reason_code: "frontend_catalog_mismatch", reason: "دالة التشخيص أعادت امتحانًا ظاهرًا، لكن قائمة الامتحانات المعروضة للطالب فارغة. افحص فلترة useStudentExamCatalog أو StudentExamPanel.", source_file: `${EXAM_DIAGNOSTIC_LOCATIONS.catalogHook} + ${EXAM_DIAGNOSTIC_LOCATIONS.panelFilter}`, source_function: "useStudentExamCatalog" }
      : error
    ? { title: "تعذر تشغيل تشخيص الامتحانات", reason_code: "diagnostic_rpc_failed", reason: error, source_file: EXAM_DIAGNOSTIC_LOCATIONS.databaseDiagnostic, source_function: "diagnose_student_group_exam_visibility" }
    : isLoading
    ? { title: "جاري تشغيل تتبع الامتحانات", reason_code: "diagnostic_loading", reason: "الواجهة استدعت نظام التشخيص وتنتظر رد قاعدة البيانات.", source_file: `${EXAM_DIAGNOSTIC_LOCATIONS.diagnosticLoader} + ${EXAM_DIAGNOSTIC_LOCATIONS.databaseDiagnostic}`, source_function: "diagnose_student_group_exam_visibility" }
    : noDiagnosticSignal
    ? { title: "التشخيص لم يرجع أي سبب", reason_code: "diagnostic_returned_no_rows", reason: "دالة التشخيص لم تُرجع أي صفوف. افحص استدعاء التشخيص ودالة الكتالوج لأن الامتحان اختفى قبل مرحلة تحليل الأسباب.", source_file: `${EXAM_DIAGNOSTIC_LOCATIONS.databaseDiagnostic} + ${EXAM_DIAGNOSTIC_LOCATIONS.catalogHook}`, source_function: "diagnose_student_group_exam_visibility" }
    : hiddenRows[0] || rows[0] || null;

  return (
    <Card className="overflow-hidden border-destructive/30 bg-destructive/5">
      <CardContent className="space-y-3 p-4 text-right">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-extrabold text-destructive">تشخيص اختفاء الامتحان</p>
                <Badge variant="outline" className="border-destructive/30 text-destructive">Trace ID</Badge>
              </div>
              <p className="break-all font-mono text-[11px] text-muted-foreground" dir="ltr">{traceId}</p>
            </div>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={onCopy}>
            <Copy className="h-3.5 w-3.5" />
            نسخ
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-background/80 p-3 text-sm">
          <div className="mb-2 flex items-center gap-2 font-bold text-foreground">
            <Bug className="h-4 w-4 text-destructive" />
            <span>{formatDebugValue(primaryIssue?.title) || "سبب الإخفاء"}</span>
          </div>
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <DebugLine label="كود السبب" value={primaryIssue?.reason_code} />
            <DebugLine label="السبب" value={primaryIssue?.reason} />
            <DebugLine label="الملف / الدالة" value={primaryIssue?.source_file} dir="ltr" />
            <DebugLine label="Function" value={primaryIssue?.source_function} dir="ltr" />
            {"student_section" in (primaryIssue || {}) && <DebugLine label="شعبة الطالب" value={(primaryIssue as ExamVisibilityDebugRow | null)?.student_section} />}
            {"student_education_type" in (primaryIssue || {}) && <DebugLine label="نوع تعليم الطالب" value={(primaryIssue as ExamVisibilityDebugRow | null)?.student_education_type} />}
            {"normalized_target_section" in (primaryIssue || {}) && <DebugLine label="استهداف الشعبة" value={(primaryIssue as ExamVisibilityDebugRow | null)?.normalized_target_section} />}
            {"normalized_target_education_type" in (primaryIssue || {}) && <DebugLine label="استهداف نوع التعليم" value={(primaryIssue as ExamVisibilityDebugRow | null)?.normalized_target_education_type} />}
          </div>
        </div>

        <textarea
          readOnly
          value={report}
          dir="ltr"
          className="h-36 w-full resize-none rounded-lg border border-border bg-background p-3 font-mono text-[11px] text-foreground outline-none"
          aria-label="تقرير تشخيص اختفاء الامتحان"
        />
      </CardContent>
    </Card>
  );
}

function DebugLine({ label, value, dir = "rtl" }: { label: string; value: unknown; dir?: "rtl" | "ltr" }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/40 p-2">
      <div className="font-semibold text-foreground">{label}</div>
      <div className="mt-0.5 break-words" dir={dir}>{formatDebugValue(value)}</div>
    </div>
  );
}
