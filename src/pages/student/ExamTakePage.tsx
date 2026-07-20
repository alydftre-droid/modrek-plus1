import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  useExam,
  useStudentExamQuestions,
  useModrekTrainingQuestionsForAttempt,
  useMyAttempts,
  useSaveAnswer,
  useStartAttempt,
  useStartModrekTrainingAttempt,
  useAttempt,
} from "@/hooks/useExams";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  Star,
  Clock,
  User,
  ChevronLeft,
  AlertTriangle,
  PanelsTopLeft,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ExamQuestion } from "@/types/exam";
import { SignedImage } from "@/components/common/SignedImage";

type AnswerState = {
  selectedOptionIds: string[];
  answerText: string;
  // For true_false matrix: index -> "true"|"false"
  matrix?: Record<number, "true" | "false">;
  flagged: boolean;
};

const PURPLE = "#6D4AFF";

export default function ExamTakePage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routeAttemptId = searchParams.get("attempt");
  const { user } = useAuth();
  const { data: exam, isLoading: examLoading } = useExam(examId);
  const { data: attempts = [], isLoading: attemptsLoading } = useMyAttempts(examId);
  const saveAnswer = useSaveAnswer();
  const startAttempt = useStartAttempt();
  const startModrekAttempt = useStartModrekTrainingAttempt();
  const autoStartRequestedRef = useRef<string | null>(null);

  const isModrekTraining = (exam as any)?.source === "modrek_ai";
  const inProgressAttempt = attempts.find(a => a.status === "in_progress");
  const routeAttempt = routeAttemptId ? attempts.find(a => a.id === routeAttemptId) : undefined;
  const cachedAttempt = routeAttempt?.status === "in_progress"
    ? routeAttempt
    : inProgressAttempt || routeAttempt;
  const { data: fetchedAttempt } = useAttempt(routeAttemptId && !cachedAttempt ? routeAttemptId : undefined);
  const attempt = cachedAttempt || ((fetchedAttempt as any)?.status === "in_progress" ? fetchedAttempt as any : null) || (fetchedAttempt as any) || null;
  const trainingAttemptId = isModrekTraining ? (routeAttemptId || attempt?.id) : undefined;
  const { data: regularQuestionsRaw = [], isLoading: regularQLoading } = useStudentExamQuestions(examId, Boolean(exam) && !isModrekTraining);
  const { data: trainingQuestionsRaw = [], isLoading: trainingQLoading } = useModrekTrainingQuestionsForAttempt(trainingAttemptId);
  const questionsRaw = isModrekTraining ? trainingQuestionsRaw : regularQuestionsRaw;
  const qLoading = isModrekTraining ? Boolean(trainingAttemptId) && trainingQLoading : regularQLoading;
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [reloadCount, setReloadCount] = useState(0);
  const [showWarning, setShowWarning] = useState<string | null>(null);
  const [leavingToSubmit, setLeavingToSubmit] = useState(false);
  const [profile, setProfile] = useState<{ full_name?: string; grade?: string } | null>(null);
  const draftKey = `exam-draft-${examId}-${attempt?.id || "init"}`;
  const antiCheatKey = `exam-anti-${examId}-${attempt?.id || "init"}`;
  const answersRef = useRef<Record<string, AnswerState>>({});
  const draftHydratedRef = useRef(false);
  const skipNextDraftPersistRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("full_name,grade").eq("id", user.id).single()
      .then(({ data }) => setProfile(data as any));
  }, [user?.id]);

  useEffect(() => {
    if (!examId || !exam || attemptsLoading || attempt || startAttempt.isPending || startModrekAttempt.isPending) return;
    if (autoStartRequestedRef.current === examId) return;
    autoStartRequestedRef.current = examId;

    if ((exam as any).source !== "modrek_ai") {
      startAttempt.mutateAsync(examId).then((res: any) => {
        if (!res?.success) {
          toast.error(res?.error || "تعذّر بدء الامتحان");
          return;
        }
        if (res.attempt_id) {
          try { localStorage.setItem(`exam-active-attempt-${examId}`, res.attempt_id); } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
          navigate(`/student/exams/${examId}/take?attempt=${res.attempt_id}`, { replace: true });
        }
      }).catch((e: any) => {
        toast.error(e?.message || "تعذّر بدء الامتحان");
      });
      return;
    }

    startModrekAttempt.mutateAsync({ examId, attemptId: routeAttemptId }).then((res: any) => {
      if (res?.redirect_to_review && res?.attempt_id) {
        // Training exam already completed — send student to the results dashboard,
        // NOT directly to review. Student chooses review/AI-chat/score from there.
        navigate(`/student/exams/${examId}/result/${res.attempt_id}`, { replace: true });
        return;
      }
      if (!res?.success) toast.error(res?.error || "تعذّر بدء الامتحان");
      else if (res.attempt_id && routeAttemptId !== res.attempt_id) {
        navigate(`/student/exams/${examId}/take?attempt=${res.attempt_id}`, { replace: true });
      }
    }).catch((e: any) => {
      toast.error(e?.message || "تعذّر بدء الامتحان");
    });
  }, [examId, exam, attemptsLoading, attempt, startAttempt, startAttempt.isPending, startModrekAttempt, startModrekAttempt.isPending, routeAttemptId, navigate]);

  useEffect(() => {
    if (!examId || !isModrekTraining || !attempt?.id || routeAttemptId === attempt.id) return;
    navigate(`/student/exams/${examId}/take?attempt=${attempt.id}`, { replace: true });
  }, [examId, isModrekTraining, attempt?.id, routeAttemptId, navigate]);

  // Keep original teacher ordering for sections+questions; only shuffle non-section questions
  // within their containing section (or globally if no sections), preserving section positions.
  const questions = useMemo(() => {
    if (!exam?.shuffle_questions) return questionsRaw;
    const out: typeof questionsRaw = [];
    let buffer: typeof questionsRaw = [];
    const flush = () => {
      out.push(...[...buffer].sort((a, b) => a.id.localeCompare(b.id)));
      buffer = [];
    };
    for (const q of questionsRaw) {
      if ((q as any).question_type === "section") { flush(); out.push(q); }
      else buffer.push(q);
    }
    flush();
    return out;
  }, [questionsRaw, exam?.shuffle_questions]);

  const realQuestions = useMemo(
    () => questions.filter(q => (q as any).question_type !== "section"),
    [questions]
  );

  const buildSubmitUrl = useCallback((auto = false) => {
    const activeAttemptId = (attempt?.status === "in_progress" ? attempt.id : undefined) || inProgressAttempt?.id || routeAttemptId || trainingAttemptId;
    const params = new URLSearchParams();
    if (auto) params.set("auto", "1");
    if (activeAttemptId) params.set("attempt", activeAttemptId);
    const query = params.toString();
    return `/student/exams/${examId}/submit${query ? `?${query}` : ""}`;
  }, [attempt?.id, attempt?.status, examId, inProgressAttempt?.id, routeAttemptId, trainingAttemptId]);

  useEffect(() => {
    if (!examId || !attempt?.id || attempt.status !== "in_progress") return;
    try { localStorage.setItem(`exam-active-attempt-${examId}`, attempt.id); } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
  }, [examId, attempt?.id, attempt?.status]);

  // Timer
  useEffect(() => {
    if (!exam || !attempt) return;
    const started = new Date(attempt.started_at).getTime();
    const endsAt = started + exam.duration_minutes * 60 * 1000;
    const tick = () => {
      const left = Math.max(0, Math.floor((endsAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) navigate(buildSubmitUrl(true), { replace: true });
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, attempt, buildSubmitUrl, navigate]);

  const persistAntiCheat = useCallback((patch: Record<string, number>) => {
    try {
      const current = JSON.parse(localStorage.getItem(antiCheatKey) || "{}");
      localStorage.setItem(antiCheatKey, JSON.stringify({ ...current, ...patch }));
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
  }, [antiCheatKey]);

  const recordViolation = useCallback((kind: "tab" | "reload" | "screenshot") => {
    if (!exam || !attempt) return;
    const maxExits = Math.max(0, Number((exam as any).max_cheat_exits ?? 2));
    if (kind === "tab") {
      setTabSwitches((value) => {
        const next = value + 1;
        persistAntiCheat({ tabSwitches: next });
        if (next > maxExits) {
          toast.error("تم تجاوز عدد محاولات الخروج، سيتم تسليم الامتحان تلقائياً");
          navigate(buildSubmitUrl(true), { replace: true });
        } else {
          setShowWarning(`⚠️ تم رصد محاولة خروج (${next}/${maxExits}) — عند تجاوز الحد سيتم تسليم الامتحان تلقائياً`);
        }
        return next;
      });
    }
    if (kind === "reload") {
      setReloadCount((value) => {
        const next = value + 1;
        persistAntiCheat({ reloads: next });
        if ((exam as any).prevent_reload !== false && next > maxExits) {
          navigate(buildSubmitUrl(true), { replace: true });
        }
        return next;
      });
    }
    if (kind === "screenshot") {
      persistAntiCheat({ screenshots: Date.now() });
      setShowWarning("⚠️ تم رصد محاولة لقطة شاشة أو طباعة داخل الامتحان");
    }
  }, [exam, attempt, persistAntiCheat, navigate, buildSubmitUrl]);

  // Anti-cheat
  useEffect(() => {
    if (!exam || !attempt) return;
    try {
      const stored = JSON.parse(localStorage.getItem(antiCheatKey) || "{}");
      setTabSwitches(Number(stored.tabSwitches || 0));
      setReloadCount(Number(stored.reloads || 0));
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }

    const onVis = () => {
      if (document.hidden && exam.prevent_tab_switch) {
        recordViolation("tab");
      }
    };
    const block = (e: Event) => { if (exam.prevent_copy_paste) e.preventDefault(); };
    const onKey = (e: KeyboardEvent) => {
      if (!exam.prevent_copy_paste) return;
      const k = e.key.toLowerCase();
      if (e.ctrlKey && ["c", "x", "v", "a", "u", "s", "p"].includes(k)) e.preventDefault();
      if (e.key === "F12") e.preventDefault();
      if (e.key === "PrintScreen") recordViolation("screenshot");
      if (e.ctrlKey && e.shiftKey && ["i", "j", "c"].includes(k)) e.preventDefault();
    };

    // Reload counter via sessionStorage
    const rKey = `exam-reload-${examId}-${attempt?.id || ""}`;
    const prev = Number(sessionStorage.getItem(rKey) || "0");
    if (prev > 0) {
      setReloadCount(prev);
      persistAntiCheat({ reloads: prev });
      if ((exam as any).prevent_reload !== false && prev > Number((exam as any).max_cheat_exits ?? 2)) {
        toast.error("تم تجاوز عدد إعادات التحميل، سيتم تسليم الامتحان تلقائياً");
          navigate(buildSubmitUrl(true), { replace: true });
      } else {
        setShowWarning(`⚠️ تم رصد إعادة تحميل (${prev}/${Number((exam as any).max_cheat_exits ?? 2)})`);
      }
    }
    const onBeforeUnload = () => {
      sessionStorage.setItem(rKey, String(prev + 1));
      try {
        const stored = JSON.parse(localStorage.getItem(antiCheatKey) || "{}");
        localStorage.setItem(antiCheatKey, JSON.stringify({ ...stored, reloads: Math.max(Number(stored.reloads || 0), prev + 1) }));
      } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
    };
    const onBlur = () => { if (exam.prevent_tab_switch) recordViolation("tab"); };

    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("paste", block);
    document.addEventListener("contextmenu", block);
    document.addEventListener("selectstart", block);
    document.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("selectstart", block);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("blur", onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, attempt?.id, antiCheatKey, recordViolation, persistAntiCheat]);

  // Local draft
  useEffect(() => {
    if (!attempt) return;
    draftHydratedRef.current = false;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        answersRef.current = parsed;
        skipNextDraftPersistRef.current = true;
        setAnswers(parsed);
      } else {
        answersRef.current = {};
        skipNextDraftPersistRef.current = true;
        setAnswers({});
      }
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
    draftHydratedRef.current = true;
  }, [draftKey, attempt]);
  useEffect(() => {
    if (!attempt) return;
    if (!draftHydratedRef.current) return;
    if (skipNextDraftPersistRef.current) {
      skipNextDraftPersistRef.current = false;
      return;
    }
    answersRef.current = answers;
    try { localStorage.setItem(draftKey, JSON.stringify(answers)); } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
  }, [answers, draftKey, attempt]);

  const saveTimers = useRef<Record<string, any>>({});
  const updateAnswer = useCallback((qId: string, patch: Partial<AnswerState>) => {
    const nextAnswer = { selectedOptionIds: [], answerText: "", flagged: false, ...(answersRef.current[qId] || {}), ...patch };
    const nextAnswers = { ...answersRef.current, [qId]: nextAnswer };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    try { localStorage.setItem(draftKey, JSON.stringify(nextAnswers)); } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
    if (!attempt) return;
    if (saveTimers.current[qId]) clearTimeout(saveTimers.current[qId]);
    saveTimers.current[qId] = setTimeout(() => {
      saveAnswer.mutate({
        attemptId: attempt.id,
        questionId: qId,
        selectedOptionIds: nextAnswer.selectedOptionIds,
        answerText: nextAnswer.matrix ? JSON.stringify(nextAnswer.matrix) : nextAnswer.answerText,
        flagged: nextAnswer.flagged,
      });
    }, 700);
  }, [attempt, draftKey, saveAnswer]);

  const isRecoverableAttemptError = (error: unknown) => {
    const message = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
    return message.includes("محاولة") || message.includes("attempt") || message.includes("not found");
  };

  const goToSubmit = useCallback(async () => {
    if (!attempt || leavingToSubmit) return;
    setLeavingToSubmit(true);
    try {
      for (const qId of Object.keys(saveTimers.current)) {
        if (saveTimers.current[qId]) clearTimeout(saveTimers.current[qId]);
      }
      const realIds = new Set(realQuestions.map((q: any) => q.id));
      const draftEntries = Object.entries(answersRef.current).filter(([qId, value]) => {
        if (!realIds.has(qId)) return false;
        const answer = value as AnswerState;
        return answer.selectedOptionIds?.length > 0 || String(answer.answerText || "").trim().length > 0 || (answer.matrix && Object.keys(answer.matrix).length > 0);
      });
      await Promise.all(draftEntries.map(([qId, answer]) => saveAnswer.mutateAsync({
        attemptId: attempt.id,
        questionId: qId,
        selectedOptionIds: answer.selectedOptionIds || [],
        answerText: answer.matrix ? JSON.stringify(answer.matrix) : (answer.answerText || ""),
        flagged: answer.flagged,
      })));
      navigate(buildSubmitUrl(false));
    } catch (error: any) {
      setLeavingToSubmit(false);
      if (isRecoverableAttemptError(error)) {
        toast.info("سيتم تثبيت المحاولة وحفظ الإجابات أثناء التسليم النهائي");
        navigate(buildSubmitUrl(false));
        return;
      }
      toast.error(error?.message || "تعذّر حفظ الإجابات قبل التسليم");
    }
  }, [attempt, leavingToSubmit, realQuestions, saveAnswer, navigate, buildSubmitUrl]);

  if (
    examLoading ||
    qLoading ||
    attemptsLoading ||
    startAttempt.isPending ||
    startModrekAttempt.isPending ||
    (!attempt && autoStartRequestedRef.current === examId) ||
    (isModrekTraining && !attempt && autoStartRequestedRef.current !== examId)
  ) {
    return <div className="p-4 max-w-3xl mx-auto space-y-3 bg-[#F8F8FC] min-h-screen">
      <Skeleton className="h-20" /><Skeleton className="h-[500px]" />
    </div>;
  }
  if (!exam || !attempt) {
    return (
      <div className="p-8 text-center space-y-4 bg-[#F8F8FC] min-h-screen">
        <p className="text-[#3F3F4A]">لم يتم العثور على محاولة جارية</p>
          <button
            onClick={() => {
              autoStartRequestedRef.current = null;
              if (examId) startAttempt.mutate(examId);
            }}
            className="px-4 py-2 rounded-xl bg-[#6D4AFF] text-white"
          >إعادة تثبيت المحاولة</button>
          <button onClick={() => navigate(`/student/exams/${examId}`)} className="px-4 py-2 rounded-xl bg-white border border-[#E5E1F2] text-[#3F3F4A]">العودة لصفحة الامتحان</button>
      </div>
    );
  }
  if (realQuestions.length === 0) {
    return <div className="p-8 text-center text-muted-foreground bg-[#F8F8FC] min-h-screen">لا توجد أسئلة في هذا الامتحان</div>;
  }

  const answeredCount = realQuestions.filter(q => {
    const a = answers[q.id];
    return a && (a.selectedOptionIds.length > 0 || (a.answerText && a.answerText.trim().length > 0) || (a.matrix && Object.keys(a.matrix).length > 0));
  }).length;

  const mins = Math.floor((secondsLeft || 0) / 60);
  const secs = (secondsLeft || 0) % 60;
  const hours = Math.floor(mins / 60);
  const dMins = mins % 60;
  const timeWarning = secondsLeft !== null && secondsLeft < 60;
  const subjectName = (exam as any).subjects?.name_ar || (exam as any).subject_name || "المادة";

  return (
    <div dir="rtl" className="min-h-screen bg-[#F8F8FC] pb-32 select-none">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-[#EFEDF7]">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-3">
          <div className="w-9 sm:w-32" />
          <div className="flex-1 flex flex-col items-center min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen className="h-4 w-4 text-[#6D4AFF] shrink-0" />
              <h1 className="text-[13px] sm:text-[15px] font-bold text-[#1A1A2E] truncate">{exam.title}</h1>
            </div>
            <div className="flex items-center gap-4 mt-1 text-[11px] sm:text-[12px] text-[#6B6B7B]">
              <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />{subjectName}</span>
              <span className="flex items-center gap-1"><Star className="h-3 w-3" />{exam.total_marks} درجة</span>
              <span className={`flex items-center gap-1 font-bold tabular-nums ${timeWarning ? "text-[#EF4444]" : "text-[#1A1A2E]"}`}>
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

      {/* Warning toast banner */}
      {showWarning && (
        <div className="max-w-5xl mx-auto px-3 sm:px-4 pt-3">
          <div className="rounded-xl border border-[#FCD9B3] bg-[#FFF4E5] text-[#92400E] text-[12.5px] px-3 py-2.5 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span className="flex-1">{showWarning}</span>
            <button className="text-[#92400E]/70 hover:text-[#92400E] text-[18px] leading-none" onClick={() => setShowWarning(null)}>×</button>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-5 space-y-4">
        {/* Questions stack with section headers (sections are NOT answerable) */}
        <div className="space-y-4">
          {(() => {
            const nodes: JSX.Element[] = [];
            let qNum = 0;
            for (let i = 0; i < questions.length; i++) {
              const q: any = questions[i];
              if (q.question_type === "section") {
                // Count sub-questions belonging to this section (until next section)
                let subCount = 0;
                let subMarks = 0;
                for (let j = i + 1; j < questions.length; j++) {
                  const n: any = questions[j];
                  if (n.question_type === "section") break;
                  subCount++;
                  subMarks += Number(n.marks || 0);
                }
                const totalMarks = Number(q.marks || 0) || subMarks;
                nodes.push(
                  <section key={q.id} className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-[18px] sm:text-[20px] font-extrabold text-[#6D4AFF]">{q.question_text || "قسم"}</h2>
                      <div className="flex items-center gap-2">
                        <span className="text-[11.5px] font-semibold text-[#6D4AFF] bg-[#EFEAFF] rounded-full px-2.5 py-1">{subCount} أسئلة</span>
                        {totalMarks > 0 && (
                          <span className="text-[11.5px] font-semibold text-[#F59E0B] bg-[#FFF4E5] rounded-full px-2.5 py-1">{totalMarks} درجة</span>
                        )}
                      </div>
                    </div>
                    {q.image_url && <SignedImage bucket="exams" url={q.image_url} alt="" className="rounded-xl max-h-48 object-contain mx-auto mb-2" />}
                  </section>
                );
              } else {
                nodes.push(
                  <QuestionCard
                    key={q.id}
                    q={q}
                    idx={qNum}
                    state={answers[q.id]}
                    onChange={(patch) => updateAnswer(q.id, patch)}
                  />
                );
                qNum++;
              }
            }
            return nodes;
          })()}
        </div>
      </main>


      {/* Bottom bar */}
      <footer className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#EFEDF7]">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-3">
          <button
            onClick={goToSubmit}
            disabled={leavingToSubmit}
            className="h-11 px-5 sm:px-7 rounded-xl text-white font-bold text-[13.5px] flex items-center gap-2 shadow-[0_8px_18px_-6px_rgba(109,74,255,0.55)] active:scale-[0.99] transition"
            style={{ background: `linear-gradient(135deg, ${PURPLE} 0%, #8B5CFF 100%)` }}
          >
            <span>{leavingToSubmit ? "جاري الحفظ..." : "التالي"}</span>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-[12px] text-[#6B6B7B]">
            <PanelsTopLeft className="h-4 w-4 text-[#6D4AFF]" />
            <span className="font-semibold text-[#1A1A2E]">السؤال {Math.min(answeredCount + 1, realQuestions.length)} من {realQuestions.length}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function QuestionCard({ q, idx, state, onChange }: {
  q: ExamQuestion;
  idx: number;
  state?: AnswerState;
  onChange: (p: Partial<AnswerState>) => void;
}) {
  const typeLabel =
    q.question_type === "mcq" ? "اختيار من متعدد" :
    q.question_type === "true_false" ? "صح / خطأ" :
    q.question_type === "short_answer" ? "إجابة قصيرة" :
    q.question_type === "essay" ? "مقالي" : "أكمل الفراغ";

  const typeColor =
    q.question_type === "mcq" ? { bg: "#EFEAFF", text: "#6D4AFF" } :
    q.question_type === "true_false" ? { bg: "#E8F8EE", text: "#16A34A" } :
    q.question_type === "short_answer" ? { bg: "#E8F8EE", text: "#16A34A" } :
    q.question_type === "essay" ? { bg: "#FFF4E5", text: "#F59E0B" } :
    { bg: "#EFEAFF", text: "#6D4AFF" };

  return (
    <article className="bg-white rounded-[20px] border border-[#EFEDF7] shadow-[0_2px_10px_rgba(20,20,40,0.04)] p-4 sm:p-5">
      {/* Top labels */}
      <div className="flex items-center justify-end gap-2 mb-3 flex-wrap">
        <span className="text-[11px] font-semibold bg-[#EFEAFF] text-[#6D4AFF] rounded-full px-2.5 py-1">السؤال {idx + 1}</span>
        <span className="text-[11px] font-semibold bg-[#EFEAFF] text-[#6D4AFF] rounded-full px-2.5 py-1">{q.marks} {q.marks === 1 ? "درجة" : "درجات"}</span>
        <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ background: typeColor.bg, color: typeColor.text }}>{typeLabel}</span>
      </div>

      {/* Question text */}
      <p className="text-right text-[14.5px] sm:text-[15.5px] font-bold text-[#1A1A2E] leading-[1.9] mb-4 whitespace-pre-wrap">{q.question_text}</p>
      {q.image_url && <SignedImage bucket="exams" url={q.image_url} alt="" className="rounded-xl max-h-64 object-contain mx-auto mb-4" />}

      {/* MCQ */}
      {q.question_type === "mcq" && <McqBlock q={q} state={state} onChange={onChange} />}

      {/* True / False as single selection */}
      {q.question_type === "true_false" && <McqBlock q={q} state={state} onChange={onChange} />}

      {/* Short answer */}
      {q.question_type === "short_answer" && (
        <input
          value={state?.answerText || ""}
          onChange={(e) => onChange({ answerText: e.target.value })}
          placeholder="اكتب إجابتك هنا..."
          className="w-full h-12 rounded-xl border border-[#E5E1F2] bg-white px-4 text-right text-[14px] text-[#1A1A2E] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/15"
        />
      )}

      {/* Fill blank */}
      {q.question_type === "fill_blank" && (
        <input
          value={state?.answerText || ""}
          onChange={(e) => onChange({ answerText: e.target.value })}
          placeholder="اكتب إجابتك هنا..."
          className="w-full h-12 rounded-xl border border-[#E5E1F2] bg-white px-4 text-right text-[14px] text-[#1A1A2E] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/15"
        />
      )}

      {/* Essay */}
      {q.question_type === "essay" && (
        <textarea
          value={state?.answerText || ""}
          onChange={(e) => onChange({ answerText: e.target.value })}
          placeholder="اكتب إجابتك التفصيلية هنا..."
          rows={6}
          className="w-full rounded-xl border border-[#E5E1F2] bg-white p-4 text-right text-[14px] text-[#1A1A2E] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/15 resize-none"
        />
      )}
    </article>
  );
}

function McqBlock({ q, state, onChange }: { q: ExamQuestion; state?: AnswerState; onChange: (p: Partial<AnswerState>) => void }) {
  const opts = q.options || [];
  const selected = state?.selectedOptionIds?.[0];
  const letters = ["أ", "ب", "ج", "د", "هـ", "و"];
  return (
    <div className="space-y-2.5">
      <div className="text-[12px] text-[#6B6B7B] mb-1">اختر الإجابة الصحيحة:</div>
      {opts.map((opt, i) => {
        const isSel = selected === opt.id;
        return (
          <button
            type="button"
            key={opt.id}
            onClick={() => onChange({ selectedOptionIds: [opt.id] })}
            className={`w-full h-12 rounded-xl border px-4 flex items-center justify-between gap-3 transition text-right ${
              isSel
                ? "border-[#6D4AFF] bg-[#F4F0FF] shadow-[0_0_0_2px_rgba(109,74,255,0.15)]"
                : "border-[#E5E1F2] bg-white hover:border-[#C7BAFF]"
            }`}
          >
            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
              isSel ? "border-[#6D4AFF]" : "border-[#CFCAE0]"
            }`}>
              {isSel && <span className="w-2.5 h-2.5 rounded-full bg-[#6D4AFF]" />}
            </span>
            <span className="flex-1 text-[14px] text-[#1A1A2E] truncate">
              <span className="text-[#6B6B7B] ml-1">{letters[i] || String.fromCharCode(0x0623 + i)})</span>
              {opt.option_text}
            </span>
          </button>
        );
      })}
    </div>
  );
}
