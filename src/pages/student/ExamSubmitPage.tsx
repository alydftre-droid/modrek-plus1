import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useExam, useStudentExamQuestions, useModrekTrainingQuestionsForAttempt, useMyAttempts, useSubmitAttempt, useAttempt } from "@/hooks/useExams";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen, Star, Clock, User, LogOut as ExitIcon,
  CheckCircle2, Circle, ClipboardList, Lightbulb, Send, Shield, ChevronLeft,
  AlertTriangle, Bug,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const PURPLE = "#6D4AFF";

const activeAttemptStorageKey = (examId?: string, userId?: string) =>
  examId && userId ? `exam-active-attempt-${examId}-${userId}` : null;

const legacyAttemptStorageKey = (examId?: string) =>
  examId ? `exam-active-attempt-${examId}` : null;

const getStoredAttemptId = (examId?: string, userId?: string) => {
  if (!examId) return null;
  try {
    const scoped = activeAttemptStorageKey(examId, userId);
    if (scoped) {
      const value = localStorage.getItem(scoped);
      if (value) return value;
    }
    return localStorage.getItem(`exam-active-attempt-${examId}`);
  } catch {
    return null;
  }
};

const isAttemptNotFoundError = (error: unknown) => {
  const anyError: any = error || {};
  const message = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  return anyError?.code === "attempt_not_found" || message.includes("attempt_not_found") || message.includes("محاولة غير صالحة");
};

type SubmitDiagnostic = {
  title: string;
  message: string;
  details: Record<string, unknown>;
};

const compactValue = (value: unknown) => {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value || "فارغ";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const buildSubmitDiagnostic = ({
  error,
  response,
  context,
}: {
  error?: any;
  response?: any;
  context: Record<string, unknown>;
}): SubmitDiagnostic => {
  const backend = response || error?.response || error?.data || null;
  const code = backend?.code || error?.code || "unknown_error";
  const rootCause = backend?.root_cause || backend?.message || error?.message || "لم يرجع الخادم سببًا محددًا";
  const latestAttempt = backend?.latest_any_attempt_id
    ? `${backend.latest_any_attempt_id} (${backend.latest_any_attempt_status || "unknown"})`
    : "غير موجود";

  return {
    title: code === "attempt_not_found" ? "فشل تسليم الامتحان: attempt_not_found" : "فشل تسليم الامتحان",
    message: `السبب المباشر: ${rootCause}`,
    details: {
      frontend_file: "src/pages/student/ExamSubmitPage.tsx",
      hook_file: "src/hooks/useExams.ts",
      backend_rpc: "public.submit_exam_attempt_resilient",
      backend_code: code,
      backend_root_cause: rootCause,
      received_attempt_id: backend?.received_attempt_id ?? context.attempt_id_for_submit ?? null,
      received_exam_id: backend?.received_exam_id ?? context.exam_id ?? null,
      resolved_attempt_id: backend?.resolved_attempt_id ?? backend?.attempt_id ?? null,
      latest_in_progress_count: backend?.latest_in_progress_count ?? "غير مرسل من الخادم",
      latest_any_attempt: latestAttempt,
      route_attempt_id: context.route_attempt_id ?? null,
      persisted_attempt_id: context.persisted_attempt_id ?? null,
      active_attempt_id: context.active_attempt_id ?? null,
      attempt_status_on_page: context.attempt_status ?? null,
      answers_count_sent: context.answers_count ?? 0,
      student_id: context.student_id ?? null,
      raw_backend_response: backend,
      raw_error_message: error?.message || null,
    },
  };
};

export default function ExamSubmitPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const auto = sp.get("auto") === "1";
  const routeAttemptId = sp.get("attempt");

  const { user } = useAuth();
  const { data: exam, isLoading: examLoading } = useExam(examId);
  const { data: attempts = [] } = useMyAttempts(examId);
  const submit = useSubmitAttempt();

  const isModrekTraining = (exam as any)?.source === "modrek_ai";
  const attemptStorageKey = activeAttemptStorageKey(examId, user?.id);
  const legacyStorageKey = legacyAttemptStorageKey(examId);
  const persistedAttemptId = useMemo(() => {
    if (routeAttemptId) return routeAttemptId;
    return getStoredAttemptId(examId, user?.id);
  }, [routeAttemptId, examId, user?.id]);
  const inProgressAttempt = attempts.find(a => a.status === "in_progress");
  const persistedAttempt = persistedAttemptId ? attempts.find(a => a.id === persistedAttemptId) : undefined;
  const cachedAttempt = inProgressAttempt || persistedAttempt;
  const { data: fetchedAttempt, isLoading: attemptLookupLoading } = useAttempt(persistedAttemptId && !cachedAttempt ? persistedAttemptId : undefined);
  const attempt = cachedAttempt || ((fetchedAttempt as any)?.status === "in_progress" ? fetchedAttempt as any : null) || (fetchedAttempt as any) || null;
  const activeAttemptId = (attempt?.status === "in_progress" ? attempt.id : undefined) || inProgressAttempt?.id || persistedAttemptId || undefined;
  const trainingAttemptId = isModrekTraining ? activeAttemptId : undefined;
  const { data: regularQuestions = [], isLoading: regularQLoading } = useStudentExamQuestions(examId, Boolean(exam) && !isModrekTraining);
  const { data: trainingQuestions = [], isLoading: trainingQLoading } = useModrekTrainingQuestionsForAttempt(trainingAttemptId);
  const questions = isModrekTraining ? trainingQuestions : regularQuestions;
  const qLoading = isModrekTraining ? Boolean(trainingAttemptId) && trainingQLoading : regularQLoading;
  const [profile, setProfile] = useState<{ full_name?: string; grade?: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitDiagnostic, setSubmitDiagnostic] = useState<SubmitDiagnostic | null>(null);
  const [isSubmittingNow, setIsSubmittingNow] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const autoFiredRef = useRef(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("full_name,grade").eq("id", user.id).single()
      .then(({ data }) => setProfile(data as any));
  }, [user?.id]);

  // Timer
  useEffect(() => {
    if (!exam || !attempt) return;
    const started = new Date(attempt.started_at).getTime();
    const endsAt = started + exam.duration_minutes * 60 * 1000;
    const tick = () => {
      const left = Math.max(0, Math.floor((endsAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0 && !autoFiredRef.current) {
        autoFiredRef.current = true;
        doSubmit(true);
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, attempt]);

  // Load local draft answers
  const draftKey = `exam-draft-${examId}-${activeAttemptId || "init"}`;
  const antiCheatKey = `exam-anti-${examId}-${activeAttemptId || "init"}`;
  const draft = useMemo<Record<string, any>>(() => {
    try { return JSON.parse(localStorage.getItem(draftKey) || "{}"); } catch { return {}; }
  }, [draftKey]);

  const realQuestions = useMemo(
    () => (questions || []).filter((q: any) => q.question_type !== "section"),
    [questions]
  );
  const realQuestionIds = useMemo(() => new Set(realQuestions.map((q: any) => q.id)), [realQuestions]);

  const clearStaleAttemptContext = () => {
    try {
      if (attemptStorageKey) localStorage.removeItem(attemptStorageKey);
      if (legacyStorageKey) localStorage.removeItem(legacyStorageKey);
      if (examId) {
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
          const key = localStorage.key(index);
          if (key?.startsWith(`exam-active-attempt-${examId}`)) localStorage.removeItem(key);
        }
      }
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
  };

  const answeredCount = Object.keys(draft).filter(k => {
    if (!realQuestionIds.has(k)) return false;
    const a = draft[k];
    return a && (a.selectedOptionIds?.length > 0 || (a.answerText && String(a.answerText).trim().length > 0) || (a.matrix && Object.keys(a.matrix).length > 0));
  }).length;
  const unanswered = Math.max(0, realQuestions.length - answeredCount);

  // auto-submit on load if requested
  useEffect(() => {
    if (auto && attempt && !autoFiredRef.current) {
      autoFiredRef.current = true;
      doSubmit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, attempt]);

  const doSubmit = async (isAuto = false) => {
    const attemptIdForSubmit = (attempt?.status === "in_progress" ? attempt.id : undefined) || activeAttemptId;
    if (!examId) return;
    if (submittingRef.current) return;
    if (attempt?.id && attempt.status !== "in_progress") {
      clearStaleAttemptContext();
      toast.info("تم تسليم هذا الامتحان بالفعل — جاري فتح النتيجة");
      navigate(`/student/exams/${examId}/result/${attempt.id}`, { replace: true });
      return;
    }
    submittingRef.current = true;
    setIsSubmittingNow(true);
    setConfirmOpen(false);
    setSubmitDiagnostic(null);
    try {
      const draftAnswers = Object.keys(draft).filter((qId) => realQuestionIds.has(qId)).map((qId) => {
        const a = draft[qId];
        return {
          questionId: qId,
          selectedOptionIds: a.selectedOptionIds || [],
          answerText: a.matrix ? JSON.stringify(a.matrix) : (a.answerText || ""),
          flagged: !!a.flagged,
        };
      });
      let antiCheat = { tabSwitches: 0, reloads: 0 };
      try { antiCheat = { ...antiCheat, ...JSON.parse(localStorage.getItem(antiCheatKey) || "{}") }; } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
      const submitPayload = { attemptId: attemptIdForSubmit || null, tabSwitches: Number(antiCheat.tabSwitches || 0), fullscreenExits: Number(antiCheat.reloads || 0) };
      const diagnosticContext = {
        student_id: user?.id || null,
        exam_id: examId || null,
        route_attempt_id: routeAttemptId || null,
        persisted_attempt_id: persistedAttemptId || null,
        active_attempt_id: activeAttemptId || null,
        attempt_id_for_submit: attemptIdForSubmit || null,
        attempt_status: attempt?.status || null,
        answers_count: draftAnswers.length,
        is_auto: isAuto,
      };
      console.debug("[exam-debug] ExamSubmitPage.beforeSubmit", {
        ...diagnosticContext,
      });
      const res: any = await submit.mutateAsync({ ...submitPayload, examId: examId!, answers: draftAnswers });
      if (res?.success) {
        const finalAttemptId = res.resolved_attempt_id || res.attempt_id || attemptIdForSubmit;
        console.debug("[exam-debug] ExamSubmitPage.submitSuccess", {
          student_id: user?.id || null,
          exam_id: examId || null,
          final_attempt_id: finalAttemptId || null,
          response: res,
        });
        if (!finalAttemptId) {
          toast.error("تم التسليم لكن تعذّر فتح النتيجة تلقائياً");
          navigate(`/student/exams/${examId}`, { replace: true });
          return;
        }
        // Always invoke smart grading so every question type (mcq / tf / fill_blank /
        // short_answer / essay) receives the rich 3-part teacher feedback shown in
        // the review page — not only attempts that contain essays.
        void supabase.functions.invoke("grade-essay", { body: { attemptId: finalAttemptId } }).then(({ error }) => {
          if (error) {
            console.warn("[exam-debug] background smart grading failed, retrying once", error);
            // Retry once after a short delay to recover from transient gateway/timeout errors.
            window.setTimeout(() => {
              void supabase.functions.invoke("grade-essay", { body: { attemptId: finalAttemptId } }).then(({ error: err2 }) => {
                if (err2) {
                  console.warn("[exam-debug] background smart grading retry failed", err2);
                  toast.info("تم التسليم — سيتم تصحيح الأسئلة تلقائياً، أو يمكنك إعادة المحاولة من صفحة النتيجة");
                }
              });
            }, 2500);
          }
        });
        try { localStorage.removeItem(draftKey); } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
        try { localStorage.removeItem(antiCheatKey); } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
        clearStaleAttemptContext();
        if (isAuto) toast.info("انتهى الوقت — تم التسليم تلقائياً");
        else toast.success("تم تسليم الامتحان");
        navigate(`/student/exams/${examId}/result/${finalAttemptId}`, { replace: true });
      } else {
        const diagnostic = buildSubmitDiagnostic({ response: res, context: diagnosticContext });
        setSubmitDiagnostic(diagnostic);
        submittingRef.current = false;
        setIsSubmittingNow(false);
        toast.error(diagnostic.title);
      }
    } catch (e: any) {
      submittingRef.current = false;
      setIsSubmittingNow(false);
      const diagnostic = buildSubmitDiagnostic({
        error: e,
        context: {
          student_id: user?.id || null,
          exam_id: examId || null,
          route_attempt_id: routeAttemptId || null,
          persisted_attempt_id: persistedAttemptId || null,
          active_attempt_id: activeAttemptId || null,
          attempt_id_for_submit: attemptIdForSubmit || null,
          attempt_status: attempt?.status || null,
          answers_count: Object.keys(draft).filter((qId) => realQuestionIds.has(qId)).length,
          is_auto: isAuto,
        },
      });
      setSubmitDiagnostic(diagnostic);
      if (isAttemptNotFoundError(e)) clearStaleAttemptContext();
      console.debug("[exam-debug] ExamSubmitPage.submitError", {
        student_id: user?.id || null,
        exam_id: examId || null,
        attempt_id_for_submit: attemptIdForSubmit || null,
        message: e?.message || String(e || ""),
        diagnostic,
      });
      toast.error(diagnostic.title);
    }
  };

  const takeUrl = `/student/exams/${examId}/take${activeAttemptId ? `?attempt=${activeAttemptId}` : ""}`;

  if (examLoading || qLoading || attemptLookupLoading) {
    return <div className="p-4 max-w-3xl mx-auto space-y-3 bg-[#F8F8FC] min-h-screen">
      <Skeleton className="h-20" /><Skeleton className="h-[500px]" />
    </div>;
  }
  if (!exam || (isModrekTraining && !attempt && !activeAttemptId)) {
    return <div className="p-8 text-center bg-[#F8F8FC] min-h-screen">
      <p className="text-[#3F3F4A]">لم يتم العثور على محاولة جارية</p>
    </div>;
  }

  const mins = Math.floor((secondsLeft || 0) / 60);
  const secs = (secondsLeft || 0) % 60;
  const hours = Math.floor(mins / 60);
  const dMins = mins % 60;
  const subjectName = (exam as any).subjects?.name_ar || (exam as any).subject_name || "المادة";

  return (
    <div dir="rtl" className="min-h-screen bg-[#F8F8FC]">
      {/* Header */}
      <header className="bg-white border-b border-[#EFEDF7]">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate(takeUrl)}
            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#EF4444] bg-white border border-[#FECACA] rounded-xl px-3 py-2 hover:bg-[#FEF2F2] transition"
          >
            <ExitIcon className="h-4 w-4" />
            <span className="hidden sm:inline">خروج من الامتحان</span>
            <span className="sm:hidden">خروج</span>
          </button>
          <div className="flex-1 flex flex-col items-center min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen className="h-4 w-4 text-[#6D4AFF] shrink-0" />
              <h1 className="text-[13px] sm:text-[15px] font-bold text-[#1A1A2E] truncate">{exam.title}</h1>
            </div>
            <div className="flex items-center gap-4 mt-1 text-[11px] sm:text-[12px] text-[#6B6B7B]">
              <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />{subjectName}</span>
              <span className="flex items-center gap-1"><Star className="h-3 w-3" />{exam.total_marks} درجة</span>
              <span className="flex items-center gap-1 font-bold tabular-nums text-[#16A34A]">
                <Clock className="h-3.5 w-3.5" />
                الوقت المتبقي: {hours > 0 ? `${String(hours).padStart(2,"0")}:` : ""}{String(dMins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <div className="text-[12.5px] font-bold text-[#1A1A2E] leading-tight">{profile?.full_name || "—"}</div>
              <div className="text-[10.5px] text-[#6B6B7B]">{profile?.grade || ""}</div>
            </div>
            <div className="w-9 h-9 rounded-full bg-[#EFEAFF] flex items-center justify-center">
              <User className="h-4 w-4 text-[#6D4AFF]" />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-5 sm:py-7 space-y-5">
        <section className="bg-white rounded-[22px] border border-[#F0EEF8] shadow-[0_2px_16px_rgba(109,74,255,0.06)] p-5 sm:p-8">
          {/* Hero */}
          <div className="flex flex-col items-center text-center">
            <CompletedHero />
            <h2 className="mt-4 text-[18px] sm:text-[22px] font-extrabold text-[#1A1A2E]">لقد أكملت جميع أسئلة الامتحان</h2>
            <p className="mt-2 text-[13px] sm:text-[14px] text-[#6B6B7B]">يمكنك مراجعة إجاباتك قبل تسليم الامتحان.</p>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-3 gap-3 bg-[#F8F8FC] rounded-2xl p-4">
            <Stat label="الأسئلة" value={`${realQuestions.length} من ${realQuestions.length}`} icon={<ClipboardList className="h-4 w-4 text-[#6D4AFF]" />} />
            <Stat label="تمت الإجابة" value={String(answeredCount)} icon={<CheckCircle2 className="h-4 w-4 text-[#22C55E]" />} />
            <Stat label="لم تتم الإجابة" value={String(unanswered)} icon={<Circle className="h-4 w-4 text-[#9CA3AF]" />} />
          </div>

          {/* Time remaining banner */}
          <div className="mt-5 rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] p-4 sm:p-5 flex items-center justify-between gap-4">
            <div className="w-11 h-11 rounded-full bg-white border border-[#BBF7D0] flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-[#16A34A]" />
            </div>
            <div className="flex-1 text-center">
              <div className="text-[13px] font-semibold text-[#16A34A]">الوقت المتبقي لانتهاء الامتحان</div>
              <div className="text-[22px] sm:text-[26px] font-extrabold text-[#16A34A] tabular-nums my-0.5">
                {hours > 0 ? `${String(hours).padStart(2,"0")}:` : ""}{String(dMins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
              </div>
              <div className="text-[11.5px] text-[#16A34A]/80">يرجى إدارة وقتك بعناية قبل تسليم الامتحان.</div>
            </div>
            <div className="w-11" />
          </div>

          {/* Warning */}
          <div className="mt-4 rounded-2xl border border-[#FFE7BF] bg-[#FFFBF1] p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-white border border-[#FFE7BF] flex items-center justify-center shrink-0">
              <Lightbulb className="h-4 w-4 text-[#F59E0B]" />
            </div>
            <div className="flex-1">
              <div className="text-[12.5px] font-bold text-[#F59E0B]">تنبيه مهم</div>
              <div className="text-[12.5px] text-[#3F3F4A] mt-0.5">بعد تسليم الامتحان لن تتمكن من العودة أو تعديل إجاباتك.</div>
            </div>
          </div>

          {submitDiagnostic && (
            <div className="mt-4 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-right">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-white border border-[#FECACA] flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-[#DC2626]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-extrabold text-[#991B1B]">{submitDiagnostic.title}</div>
                  <div className="mt-1 text-[12.5px] leading-6 text-[#7F1D1D]">{submitDiagnostic.message}</div>
                </div>
              </div>
              <div className="mt-3 rounded-xl bg-white border border-[#FECACA] p-3 space-y-2">
                <div className="flex items-center gap-2 text-[12px] font-bold text-[#991B1B]">
                  <Bug className="h-3.5 w-3.5" />
                  تفاصيل التشخيص
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11.5px] leading-5">
                  {Object.entries(submitDiagnostic.details).map(([key, value]) => (
                    <div key={key} className="rounded-lg bg-[#FEF2F2] border border-[#FEE2E2] p-2 min-w-0">
                      <div className="font-bold text-[#991B1B] break-words">{key}</div>
                      <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[#7F1D1D] text-[10.5px]">{compactValue(value)}</pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={submit.isPending || isSubmittingNow}
              className="h-12 rounded-xl text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-[0_10px_22px_-8px_rgba(109,74,255,0.6)] disabled:opacity-60 active:scale-[0.99] transition"
              style={{ background: `linear-gradient(135deg, ${PURPLE} 0%, #8B5CFF 100%)` }}
            >
              <Send className="h-4 w-4" />
              {submit.isPending || isSubmittingNow ? "جاري التسليم..." : "تسليم الامتحان الآن"}
            </button>
            <button
              onClick={() => navigate(takeUrl)}
              className="h-12 rounded-xl border-2 border-[#6D4AFF] text-[#6D4AFF] font-bold text-[14px] flex items-center justify-center gap-2 bg-white hover:bg-[#F4F0FF] active:scale-[0.99] transition"
            >
              <ChevronLeft className="h-4 w-4" />
              مراجعة الامتحان
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-center text-[11.5px] text-[#6B6B7B]">
            <span>سيتم تسليم إجاباتك نهائياً</span>
            <span>راجع إجاباتك وتأكد منها قبل التسليم</span>
          </div>
        </section>

        <div className="flex items-center justify-center gap-2 text-[12px] text-[#6B6B7B]">
          <Shield className="h-3.5 w-3.5" />
          إجاباتك آمنة ولا يتم حفظها أو مشاركتها لأي شخص.
        </div>
      </main>

      {/* Confirm dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setConfirmOpen(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 sm:p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-full bg-[#EFEAFF] mx-auto flex items-center justify-center">
              <Send className="h-6 w-6 text-[#6D4AFF]" />
            </div>
            <h3 className="mt-3 text-[16px] font-extrabold text-[#1A1A2E]">هل أنت متأكد من تسليم الامتحان؟</h3>
            <p className="mt-1 text-[13px] text-[#6B6B7B]">لن تتمكن من تعديل إجاباتك بعد التسليم.</p>
            <div className="mt-5 flex gap-2.5">
              <button onClick={() => setConfirmOpen(false)} className="flex-1 h-11 rounded-xl border border-[#E5E1F2] text-[#3F3F4A] font-semibold text-[13px]">إلغاء</button>
              <button
                onClick={() => doSubmit(false)}
                disabled={submit.isPending || isSubmittingNow}
                className="flex-1 h-11 rounded-xl text-white font-bold text-[13px] flex items-center justify-center gap-2"
                style={{ background: `linear-gradient(135deg, ${PURPLE} 0%, #8B5CFF 100%)` }}
              >
                <Send className="h-4 w-4" />
                {submit.isPending || isSubmittingNow ? "جاري التسليم..." : "تأكيد التسليم"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl p-3 text-center">
      <div className="text-[11px] text-[#6B6B7B]">{label}</div>
      <div className="mt-1 flex items-center justify-center gap-1.5 text-[15px] font-extrabold text-[#1A1A2E]">
        <span>{value}</span>{icon}
      </div>
    </div>
  );
}

function CompletedHero() {
  return (
    <div className="relative w-[120px] h-[120px] sm:w-[140px] sm:h-[140px]">
      <div className="absolute inset-0 rounded-full bg-[#F2EEFF]" />
      <svg viewBox="0 0 120 120" className="relative w-full h-full">
        <rect x="30" y="22" width="60" height="78" rx="8" fill="#fff" stroke="#6D4AFF" strokeWidth="2.5" />
        <rect x="50" y="14" width="20" height="12" rx="3" fill="#6D4AFF" />
        <rect x="40" y="42" width="42" height="3" rx="1.5" fill="#E5E0F8" />
        <rect x="40" y="56" width="42" height="3" rx="1.5" fill="#E5E0F8" />
        <rect x="40" y="70" width="42" height="3" rx="1.5" fill="#E5E0F8" />
        <circle cx="88" cy="88" r="16" fill="#22C55E" />
        <path d="M81 88l5 5 9-11" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
