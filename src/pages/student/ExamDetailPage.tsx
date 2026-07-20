import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useExam, useStudentExamQuestions, useModrekTrainingQuestionsForAttempt, useMyAttempts, useStartAttempt, useStartModrekTrainingAttempt } from "@/hooks/useExams";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  BookOpen,
  GraduationCap,
  Star,
  Clock,
  ClipboardList,
  Calendar,
  AlertCircle,
  FileText,
  Ban,
  LogOut,
  RotateCw,
  Wifi,
  Hourglass,
  User,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const PURPLE = "#6D4AFF";

export default function ExamDetailPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: exam, isLoading } = useExam(examId);
  const { data: attempts = [] } = useMyAttempts(examId);
  const inProgress = attempts.find(a => a.status === "in_progress");
  const isModrekTraining = (exam as any)?.source === "modrek_ai";
  const trainingAttemptId = isModrekTraining ? inProgress?.id : undefined;
  const { data: regularQuestions = [] } = useStudentExamQuestions(examId, Boolean(exam) && !isModrekTraining);
  const { data: trainingQuestions = [] } = useModrekTrainingQuestionsForAttempt(trainingAttemptId);
  const questions = isModrekTraining ? trainingQuestions : regularQuestions;
  const start = useStartAttempt();
  const startModrek = useStartModrekTrainingAttempt();
  const [profile, setProfile] = useState<{ full_name?: string; grade?: string } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("full_name,grade").eq("id", user.id).single()
      .then(({ data }) => setProfile(data as any));
  }, [user?.id]);

  if (isLoading) {
    return <div className="p-4 space-y-4 max-w-3xl mx-auto bg-[#F8F8FC] min-h-screen">
      <Skeleton className="h-20" /><Skeleton className="h-72" /><Skeleton className="h-48" />
    </div>;
  }
  if (!exam) return <div className="p-8 text-center text-muted-foreground bg-[#F8F8FC] min-h-screen">الامتحان غير موجود</div>;

  const submittedAttempts = attempts.filter(a => a.status !== "in_progress");
  const remaining = Math.max(0, exam.max_attempts - submittedAttempts.length);
  const canStart = remaining > 0 || !!inProgress;

  const handleStart = async () => {
    try {
      if (isModrekTraining) {
        const res = await startModrek.mutateAsync({ examId: examId!, attemptId: trainingAttemptId });
        if (res?.redirect_to_review && res?.attempt_id) {
          // Already completed — open results dashboard, not review directly.
          navigate(`/student/exams/${examId}/result/${res.attempt_id}`);
          return;
        }
        if (!res?.success) { toast.error(res?.error || "تعذّر بدء التدريب"); return; }
        navigate(`/student/exams/${examId}/take?attempt=${res.attempt_id || trainingAttemptId}`);
        return;
      }
      let attemptIdToUse = inProgress?.id as string | undefined;
      if (!attemptIdToUse) {
        const res = await start.mutateAsync(examId!);
        if (!res?.success) { toast.error(res?.error || "تعذّر بدء الامتحان"); return; }
        attemptIdToUse = res.attempt_id;
      }
      navigate(`/student/exams/${examId}/take${attemptIdToUse ? `?attempt=${attemptIdToUse}` : ""}`);
    } catch (e: any) {
      toast.error(e?.message || "حدث خطأ");
    }
  };

  const dateStr = exam.start_at
    ? new Date(exam.start_at).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  const subjectName = (exam as any).subjects?.name_ar || (exam as any).subject_name || "المادة";

  return (
    <div dir="rtl" className="min-h-screen bg-[#F8F8FC]">
      {/* Top Header */}
      <header className="bg-white border-b border-[#EFEDF7]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate("/student/exams")}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-[#4B4B5A] bg-white border border-[#EFEDF7] rounded-xl px-3 py-2 hover:bg-[#F8F8FC] transition"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">رجوع إلى الامتحانات</span>
            <span className="sm:hidden">رجوع</span>
          </button>

          <div className="flex-1 flex flex-col items-center text-center min-w-0">
            <div className="flex items-center gap-2 text-[#1A1A2E] min-w-0">
              <BookOpen className="h-4 w-4 text-[#6D4AFF] shrink-0" />
              <h1 className="text-[13px] sm:text-[15px] font-bold truncate">{exam.title}</h1>
            </div>
            <div className="hidden md:flex items-center gap-5 mt-1.5 text-[12px] text-[#6B6B7B]">
              <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{subjectName}</span>
              <span className="flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" />{profile?.grade || "—"}</span>
              <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5" />{exam.total_marks} درجة</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />الوقت: {exam.duration_minutes} دقيقة</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="text-right hidden sm:block">
              <div className="text-[13px] font-bold text-[#1A1A2E] leading-tight">{profile?.full_name || "—"}</div>
              <div className="text-[11px] text-[#6B6B7B]">{profile?.grade || ""}</div>
            </div>
            <div className="w-9 h-9 rounded-full bg-[#EFEAFF] flex items-center justify-center">
              <User className="h-4.5 w-4.5 text-[#6D4AFF]" />
            </div>
          </div>
        </div>
        {/* Mobile meta row */}
        <div className="md:hidden max-w-5xl mx-auto px-4 pb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-[#6B6B7B]">
          <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />{subjectName}</span>
          <span className="flex items-center gap-1"><Star className="h-3 w-3" />{exam.total_marks} درجة</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{exam.duration_minutes} دقيقة</span>
        </div>
      </header>

      {/* Main Card */}
      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-5 sm:py-6 space-y-5">
        <section className="bg-white rounded-[20px] shadow-[0_2px_16px_rgba(109,74,255,0.06)] border border-[#F0EEF8] p-5 sm:p-8">
          {/* Hero icon */}
          <div className="flex flex-col items-center text-center">
            <ExamHeroIcon />
            <h2 className="mt-4 text-[18px] sm:text-[22px] font-extrabold text-[#1A1A2E] leading-snug">{exam.title}</h2>
            {exam.description && (
              <p className="mt-2 text-[13px] sm:text-[14px] text-[#6B6B7B] max-w-xl leading-relaxed">{exam.description}</p>
            )}
          </div>

          {/* Info tiles */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 bg-[#F8F8FC] rounded-2xl p-3">
            <InfoTile icon={<ClipboardList className="h-4 w-4" />} label="عدد الأسئلة" value={`${questions.length} أسئلة`} />
            <InfoTile icon={<Star className="h-4 w-4" />} label="الدرجة الكلية" value={`${exam.total_marks} درجة`} />
            <InfoTile icon={<Clock className="h-4 w-4" />} label="مدة الاختبار" value={`${exam.duration_minutes} دقيقة`} />
            <InfoTile icon={<Calendar className="h-4 w-4" />} label="تاريخ الامتحان" value={dateStr} />
          </div>

          {/* Important Notes */}
          <div className="mt-6 rounded-2xl border border-[#FFE7BF] bg-[#FFFBF1] p-4 sm:p-5">
            <div className="flex items-center gap-2 text-[#F59E0B] font-bold text-[14px] mb-3">
              <AlertCircle className="h-5 w-5" />
              <span>ملاحظات مهمة</span>
            </div>
            <ul className="space-y-2.5 text-[12.5px] sm:text-[13.5px] text-[#3F3F4A]">
              <Note icon={<FileText className="h-4 w-4 text-[#F59E0B]" />}>أجب عن جميع الأسئلة ثم اضغط على زر "إنهاء الامتحان" في النهاية.</Note>
              {exam.prevent_tab_switch && (
                <Note icon={<Ban className="h-4 w-4 text-[#F59E0B]" />}>يجب عدم مغادرة شاشة الامتحان أثناء الامتحان.</Note>
              )}
              {exam.prevent_tab_switch && (
                <Note icon={<LogOut className="h-4 w-4 text-[#F59E0B]" />}>في حال خروجك من الامتحان أكثر من مرة سيتم تسليم الامتحان تلقائياً.</Note>
              )}
              <Note icon={<RotateCw className="h-4 w-4 text-[#F59E0B]" />}>في حال إعادة تحميل الصفحة أكثر من مرة سيتم تسليم الامتحان تلقائياً.</Note>
              <Note icon={<Wifi className="h-4 w-4 text-[#F59E0B]" />}>تأكد من استقرار اتصال الإنترنت قبل البدء.</Note>
              <Note icon={<Hourglass className="h-4 w-4 text-[#F59E0B]" />}>لن تتمكن من إيقاف الوقت أو الرجوع بعد تسليم الامتحان.</Note>
            </ul>
          </div>
        </section>

        {/* Start button */}
        <div className="flex flex-col items-center gap-2 pt-2 pb-8">
          <button
            disabled={!canStart || (!isModrekTraining && questions.length === 0) || start.isPending || startModrek.isPending}
            onClick={handleStart}
            className="w-full sm:w-[460px] h-[54px] rounded-2xl text-white font-bold text-[15px] flex items-center justify-center gap-3 shadow-[0_10px_24px_-8px_rgba(109,74,255,0.55)] disabled:opacity-60 disabled:cursor-not-allowed transition active:scale-[0.99]"
            style={{ background: `linear-gradient(135deg, ${PURPLE} 0%, #8B5CFF 100%)` }}
          >
            <ArrowLeft className="h-5 w-5" />
            <span>{inProgress ? "استكمل الامتحان" : "بدء الامتحان الآن"}</span>
          </button>
          <p className="text-[12px] text-[#6B6B7B]">بمجرد البدء، سيبدأ الوقت في العد التنازلي</p>
        </div>
      </main>
    </div>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl px-3 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-[#EFEAFF] text-[#6D4AFF] flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] text-[#6B6B7B] leading-tight">{label}</div>
        <div className="text-[13px] font-bold text-[#1A1A2E] leading-tight mt-0.5 truncate">{value}</div>
      </div>
    </div>
  );
}

function Note({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

function ExamHeroIcon() {
  return (
    <div className="relative w-[120px] h-[120px] sm:w-[140px] sm:h-[140px]">
      <div className="absolute inset-0 rounded-full bg-[#F2EEFF]" />
      <svg viewBox="0 0 120 120" className="relative w-full h-full">
        <rect x="30" y="22" width="60" height="78" rx="8" fill="#fff" stroke="#6D4AFF" strokeWidth="2.5" />
        <rect x="50" y="14" width="20" height="12" rx="3" fill="#6D4AFF" />
        <path d="M40 44l5 5 9-9" stroke="#6D4AFF" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="56" y="44" width="26" height="3" rx="1.5" fill="#E5E0F8" />
        <path d="M40 60l5 5 9-9" stroke="#6D4AFF" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="56" y="60" width="26" height="3" rx="1.5" fill="#E5E0F8" />
        <path d="M40 76l5 5 9-9" stroke="#6D4AFF" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="56" y="76" width="26" height="3" rx="1.5" fill="#E5E0F8" />
        <circle cx="86" cy="86" r="14" fill="#fff" stroke="#F59E0B" strokeWidth="2.5" />
        <path d="M86 80v6l4 3" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d="M80 71l-2-2M92 71l2-2" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
