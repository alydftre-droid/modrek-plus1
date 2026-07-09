import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpen, ChevronLeft, Clock, Eye, Save, Send, ShieldCheck, Sparkles, Star, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import ExamWizardStepper from "@/components/exams/teacher/ExamWizardStepper";
import { useExam, useExamQuestions } from "@/hooks/useExams";
import { usePublishExam, useUpdateExam } from "@/hooks/useExamMutations";

const STEPS = [
  { id: "ai", label: "المساعد الذكي" },
  { id: "review", label: "مراجعة الأسئلة" },
  { id: "settings", label: "إعدادات الامتحان" },
  { id: "preview", label: "معاينة ونشر" },
];

const PURPLE = "#6D4AFF";

const typeLabelOf = (t: string) =>
  t === "mcq" ? "اختيار من متعدد" :
  t === "true_false" ? "صح / خطأ" :
  t === "short_answer" ? "إجابة قصيرة" :
  t === "essay" ? "مقالي" :
  t === "fill_blank" ? "أكمل الفراغ" : t;

const typeColorOf = (t: string) =>
  t === "mcq" ? { bg: "#EFEAFF", text: "#6D4AFF" } :
  t === "true_false" ? { bg: "#E8F8EE", text: "#16A34A" } :
  t === "short_answer" ? { bg: "#E8F8EE", text: "#16A34A" } :
  t === "essay" ? { bg: "#FFF4E5", text: "#F59E0B" } :
  { bg: "#EFEAFF", text: "#6D4AFF" };

export default function PreviewPublishPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const creationQuery = params.toString();
  const { data: exam } = useExam(examId);
  const { data: questions = [] } = useExamQuestions(examId);
  const publishExam = usePublishExam();
  const updateExam = useUpdateExam();
  const [selected, setSelected] = useState<Record<string, string>>({});

  const totalMarks = questions.reduce((sum, q: any) => sum + Number(q.marks || 0), 0);
  const realQuestions = useMemo(
    () => questions.filter((q: any) => q.question_type !== "section"),
    [questions],
  );

  const returnQuery = new URLSearchParams();
  if (exam?.subject_id) returnQuery.set("subject_id", exam.subject_id);
  if (exam?.group_id) returnQuery.set("group_id", exam.group_id);
  if ((exam as any)?.sub_subject_id) returnQuery.set("sub_subject_id", (exam as any).sub_subject_id);
  if (exam?.term) returnQuery.set("term", exam.term);
  const teacherExamsPath = `/teacher/exams${returnQuery.toString() ? `?${returnQuery.toString()}` : ""}`;
  const returnTo = params.get("return_to") || "";
  const completionPath = returnTo.startsWith("/") ? returnTo : teacherExamsPath;

  const publish = async () => {
    if (!examId) return;
    try {
      await publishExam.mutateAsync(examId);
      toast.success("تم نشر الامتحان بنجاح");
      navigate(completionPath);
    } catch (error: any) {
      toast.error(error?.message || "تعذر نشر الامتحان");
    }
  };

  const saveDraft = async () => {
    if (!examId) return;
    try {
      await updateExam.mutateAsync({ id: examId, patch: { status: "draft", is_published: false } });
      toast.success("تم حفظ الامتحان كمسودة");
      navigate(completionPath);
    } catch (error: any) {
      toast.error(error?.message || "تعذر حفظ المسودة");
    }
  };

  const subjectName = (exam as any)?.subjects?.name || "المادة";
  const hours = Math.floor((exam?.duration_minutes || 0) / 60);
  const dMins = (exam?.duration_minutes || 0) % 60;

  return (
    <div className="min-h-screen bg-[#F8F8FC]" dir="rtl">
      {/* Wizard top bar */}
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
            <Button variant="outline" onClick={() => navigate(`/teacher/exams/${examId}/settings${creationQuery ? `?${creationQuery}` : ""}`)} className="h-11 rounded-2xl border-slate-200 px-4 text-sm">
            <ArrowRight className="ml-2 h-4 w-4" /> عودة
          </Button>
          <div className="hidden flex-1 md:block">
            <ExamWizardStepper steps={STEPS} currentStep="preview" />
          </div>
          <Button variant="outline" onClick={saveDraft} disabled={updateExam.isPending} className="h-11 rounded-2xl border-slate-200 px-4 text-sm text-violet-700">
            <Save className="ml-2 h-4 w-4" /> حفظ كمسودة
          </Button>
        </div>
        <div className="border-t border-slate-100 md:hidden">
          <ExamWizardStepper steps={STEPS} currentStep="preview" />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-3 pb-28 pt-4 md:px-6">
        <div className="mb-4 text-center">
          <h1 className="mb-1 flex items-center justify-center gap-2 text-2xl font-bold text-slate-900 md:text-3xl">
            <Eye className="h-6 w-6 text-violet-500" />
            معاينة الامتحان كما يراها الطالب
          </h1>
          <p className="text-sm text-slate-500">هذه الصفحة هي نفس صفحة حل الامتحان لدى الطلاب تمامًا (بدون إمكانية الحل)</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          {/* Student-look preview */}
          <div className="rounded-[24px] border border-[#EFEDF7] bg-[#F8F8FC] shadow-[0_12px_40px_rgba(15,23,42,0.04)] overflow-hidden">
            {/* Student-style sticky header */}
            <header className="bg-white border-b border-[#EFEDF7]">
              <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-3 py-3 sm:px-4">
                <div className="w-9 sm:w-32" />
                <div className="flex-1 flex flex-col items-center min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <BookOpen className="h-4 w-4 text-[#6D4AFF] shrink-0" />
                    <h2 className="text-[13px] sm:text-[15px] font-bold text-[#1A1A2E] truncate">{exam?.title || "امتحان جديد"}</h2>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-[11px] sm:text-[12px] text-[#6B6B7B]">
                    <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />{subjectName}</span>
                    <span className="flex items-center gap-1"><Star className="h-3 w-3" />{totalMarks} درجة</span>
                    <span className="flex items-center gap-1 font-bold tabular-nums text-[#1A1A2E]">
                      <Clock className="h-3.5 w-3.5" />
                      المدة: {hours > 0 ? `${String(hours).padStart(2,"0")}:` : ""}{String(dMins).padStart(2, "0")}:00
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right hidden sm:block">
                    <div className="text-[12.5px] font-bold text-[#1A1A2E] leading-tight">اسم الطالب</div>
                    <div className="text-[10.5px] text-[#6B6B7B]">الصف</div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-[#EFEAFF] flex items-center justify-center">
                    <User className="h-4 w-4 text-[#6D4AFF]" />
                  </div>
                </div>
              </div>
            </header>

            <main className="mx-auto max-w-5xl px-3 sm:px-4 py-4 sm:py-5 space-y-4">
              {questions.length === 0 && (
                <div className="rounded-2xl bg-white border border-dashed border-[#E5E1F2] p-10 text-center text-[#6B6B7B]">
                  لا توجد أسئلة بعد
                </div>
              )}
              {(() => {
                const nodes: JSX.Element[] = [];
                let qNum = 0;
                for (let i = 0; i < questions.length; i++) {
                  const q: any = questions[i];
                  if (q.question_type === "section") {
                    let subCount = 0;
                    let subMarks = 0;
                    for (let j = i + 1; j < questions.length; j++) {
                      const n: any = questions[j];
                      if (n.question_type === "section") break;
                      subCount++;
                      subMarks += Number(n.marks || 0);
                    }
                    const totalM = Number(q.marks || 0) || subMarks;
                    nodes.push(
                      <section key={q.id} className="pt-2">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-[18px] sm:text-[20px] font-extrabold text-[#6D4AFF]">{q.question_text || "قسم"}</h3>
                          <div className="flex items-center gap-2">
                            <span className="text-[11.5px] font-semibold text-[#6D4AFF] bg-[#EFEAFF] rounded-full px-2.5 py-1">{subCount} أسئلة</span>
                            {totalM > 0 && (
                              <span className="text-[11.5px] font-semibold text-[#F59E0B] bg-[#FFF4E5] rounded-full px-2.5 py-1">{totalM} درجة</span>
                            )}
                          </div>
                        </div>
                      </section>,
                    );
                  } else {
                    nodes.push(
                      <PreviewQuestionCard
                        key={q.id}
                        q={q}
                        idx={qNum}
                        selectedOptionId={selected[q.id]}
                        onSelect={(optId) => setSelected((prev) => ({ ...prev, [q.id]: optId }))}
                      />,
                    );
                    qNum++;
                  }
                }
                return nodes;
              })()}
            </main>

            {/* Student-style footer (disabled) */}
            <footer className="bg-white border-t border-[#EFEDF7]">
              <div className="mx-auto max-w-5xl px-3 sm:px-4 py-3 flex items-center justify-between gap-3">
                <div
                  className="h-11 px-5 sm:px-7 rounded-xl text-white font-bold text-[13.5px] flex items-center gap-2 opacity-70 cursor-not-allowed"
                  style={{ background: `linear-gradient(135deg, ${PURPLE} 0%, #8B5CFF 100%)` }}
                  aria-disabled
                >
                  <span>التالي</span>
                  <ChevronLeft className="h-4 w-4" />
                </div>
                <div className="text-[12px] text-[#6B6B7B]">
                  <span className="font-semibold text-[#1A1A2E]">إجمالي الأسئلة: {realQuestions.length}</span>
                </div>
              </div>
            </footer>
          </div>

          {/* Right sidebar summary + publish actions */}
          <div className="space-y-4">
            <Card className="rounded-[24px] border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
              <div className="mb-4 flex items-center gap-2">
                <Eye className="h-5 w-5 text-violet-600" />
                <h3 className="text-xl font-bold text-slate-900">ملخص الامتحان</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-3"><span className="text-slate-500">العنوان</span><span className="text-right font-semibold text-slate-900">{exam?.title || "—"}</span></div>
                <div className="flex items-start justify-between gap-3"><span className="text-slate-500">المادة</span><span className="font-semibold text-slate-900">{subjectName}</span></div>
                <div className="flex items-start justify-between gap-3"><span className="text-slate-500">عدد الأسئلة</span><span className="font-semibold text-slate-900">{realQuestions.length} سؤال</span></div>
                <div className="flex items-start justify-between gap-3"><span className="text-slate-500">الدرجة الكلية</span><span className="font-semibold text-slate-900">{totalMarks} درجة</span></div>
                <div className="flex items-start justify-between gap-3"><span className="text-slate-500">المدة</span><span className="font-semibold text-slate-900">{exam?.duration_minutes || 90} دقيقة</span></div>
              </div>
            </Card>

            <Card className="rounded-[24px] border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-violet-600" />
                <h3 className="text-lg font-bold text-slate-900">الفئة المستهدفة</h3>
              </div>
              <div className="space-y-2 text-sm text-slate-700">
                <Badge variant="outline" className="rounded-full px-3 py-1">المجموعة الحالية فقط</Badge>
                <p className="text-xs leading-6 text-slate-500">
                  الامتحان مربوط بالمجموعة/الشعبة التي أنشأته منها. سيظهر فقط لطلاب هذه الشعبة الذين اشتركوا في هذه المجموعة (علمي/أدبي أو عام/أزهر حسب المادة).
                </p>
              </div>
            </Card>

            <Card className="rounded-[24px] border border-violet-100 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-5 text-center shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
              <Sparkles className="mx-auto mb-3 h-6 w-6 text-violet-600" />
              <h4 className="mb-2 text-xl font-bold text-violet-700">جاهز للنشر</h4>
              <p className="text-sm leading-7 text-slate-500">سيظهر الامتحان فورًا لطلاب هذه المجموعة بمجرد الضغط على "نشر".</p>
            </Card>

            <Button onClick={publish} disabled={publishExam.isPending} className="settings-primary-button h-14 w-full rounded-2xl text-base">
              <Send className="ml-2 h-4 w-4" /> {publishExam.isPending ? "جاري النشر..." : "نشر الامتحان الآن"}
            </Button>
            <Button variant="outline" onClick={saveDraft} disabled={updateExam.isPending} className="h-12 w-full rounded-2xl border-slate-200 text-violet-700">
              <Save className="ml-2 h-4 w-4" /> حفظ كمسودة
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile fixed publish bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 backdrop-blur xl:hidden">
        <Button onClick={publish} disabled={publishExam.isPending} className="settings-primary-button h-12 w-full rounded-2xl text-sm">
          <Send className="ml-2 h-4 w-4" /> {publishExam.isPending ? "جاري النشر..." : "نشر الامتحان الآن"}
        </Button>
      </div>
    </div>
  );
}

function PreviewQuestionCard({
  q,
  idx,
  selectedOptionId,
  onSelect,
}: {
  q: any;
  idx: number;
  selectedOptionId?: string;
  onSelect: (id: string) => void;
}) {
  const typeColor = typeColorOf(q.question_type);
  const letters = ["أ", "ب", "ج", "د", "هـ", "و"];
  return (
    <article className="bg-white rounded-[20px] border border-[#EFEDF7] shadow-[0_2px_10px_rgba(20,20,40,0.04)] p-4 sm:p-5">
      <div className="flex items-center justify-end gap-2 mb-3 flex-wrap">
        <span className="text-[11px] font-semibold bg-[#EFEAFF] text-[#6D4AFF] rounded-full px-2.5 py-1">السؤال {idx + 1}</span>
        <span className="text-[11px] font-semibold bg-[#EFEAFF] text-[#6D4AFF] rounded-full px-2.5 py-1">
          {Number(q.marks || 0)} {Number(q.marks || 0) === 1 ? "درجة" : "درجات"}
        </span>
        <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ background: typeColor.bg, color: typeColor.text }}>
          {typeLabelOf(q.question_type)}
        </span>
      </div>

      <p className="text-right text-[14.5px] sm:text-[15.5px] font-bold text-[#1A1A2E] leading-[1.9] mb-4 whitespace-pre-wrap">
        {q.question_text}
      </p>

      {(q.question_type === "mcq" || q.question_type === "true_false") && (
        <div className="space-y-2.5">
          <div className="text-[12px] text-[#6B6B7B] mb-1">اختر الإجابة الصحيحة:</div>
          {(q.options || []).map((opt: any, i: number) => {
            const isSel = selectedOptionId === opt.id;
            return (
              <button
                type="button"
                key={opt.id}
                onClick={() => onSelect(opt.id)}
                className={`w-full h-12 rounded-xl border px-4 flex items-center justify-between gap-3 transition text-right ${
                  isSel
                    ? "border-[#6D4AFF] bg-[#F4F0FF] shadow-[0_0_0_2px_rgba(109,74,255,0.15)]"
                    : "border-[#E5E1F2] bg-white hover:border-[#C7BAFF]"
                }`}
              >
                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSel ? "border-[#6D4AFF]" : "border-[#CFCAE0]"}`}>
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
      )}

      {q.question_type === "short_answer" && (
        <input
          disabled
          placeholder="اكتب إجابتك هنا..."
          className="w-full h-12 rounded-xl border border-[#E5E1F2] bg-[#FAFAFF] px-4 text-right text-[14px] text-[#1A1A2E] placeholder:text-[#9CA3AF]"
        />
      )}
      {q.question_type === "fill_blank" && (
        <input
          disabled
          placeholder="اكتب إجابتك هنا..."
          className="w-full h-12 rounded-xl border border-[#E5E1F2] bg-[#FAFAFF] px-4 text-right text-[14px] text-[#1A1A2E] placeholder:text-[#9CA3AF]"
        />
      )}
      {q.question_type === "essay" && (
        <textarea
          disabled
          rows={5}
          placeholder="اكتب إجابتك التفصيلية هنا..."
          className="w-full rounded-xl border border-[#E5E1F2] bg-[#FAFAFF] p-4 text-right text-[14px] text-[#1A1A2E] placeholder:text-[#9CA3AF] resize-none"
        />
      )}
    </article>
  );
}
