import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, FileText, Image as ImageIcon, Link as LinkIcon, Paperclip, Save, Send, Sparkles, Type, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ExamWizardStepper from "@/components/exams/teacher/ExamWizardStepper";
import type { EditorQuestion, EditorQType } from "@/components/exams/teacher/QuestionEditorCard";
import { useCreateExam, useReplaceExamQuestions } from "@/hooks/useExamMutations";
import { cn } from "@/lib/utils";
import aiBot from "@/assets/ai-bot-mascot.png";

const STEPS = [
  { id: "ai", label: "المساعد الذكي" },
  { id: "review", label: "مراجعة الأسئلة" },
  { id: "settings", label: "إعدادات الامتحان" },
  { id: "preview", label: "معاينة ونشر" },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AiAssistantPage() {
  const navigate = useNavigate();
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");
  const [busy, setBusy] = useState(false);
  const createExam = useCreateExam();
  const replaceQuestions = useReplaceExamQuestions();

  const capabilities = [
    { icon: Upload, label: "امتحان ورقي", color: "text-violet-700 bg-violet-50" },
    { icon: ImageIcon, label: "صور كتاب", color: "text-fuchsia-700 bg-fuchsia-50" },
    { icon: FileText, label: "PDF / Word", color: "text-slate-700 bg-slate-50" },
    { icon: Type, label: "نص درس", color: "text-sky-700 bg-sky-50" },
    { icon: LinkIcon, label: "رابط", color: "text-violet-700 bg-violet-50" },
  ];

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileBase64(await fileToBase64(file));
    event.target.value = "";
  };

  const generate = async () => {
    if (!prompt.trim() && !fileBase64) {
      toast.error("أضف محتوى أو ارفع ملفاً أولاً");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-exam", {
        body: {
          lessonText: prompt,
          questionCount: 20,
          difficulty: "متوسط",
          imageBase64: fileBase64 || undefined,
        },
      });
      if (error) throw error;

      const questions: EditorQuestion[] = (data?.questions || []).map((q: any, index: number) => ({
        id: crypto.randomUUID(),
        index: index + 1,
        type: (q.type || "mcq") as EditorQType,
        text: q.question || q.text || "",
        marks: q.marks || 1,
        modelAnswer: q.correctAnswer || q.modelAnswer || "",
        options: (q.options || []).map((option: any, optionIndex: number) => ({
          id: crypto.randomUUID(),
          text: typeof option === "string" ? option : option.text,
          isCorrect: typeof option === "object" ? !!option.isCorrect : q.correctIndex === optionIndex,
        })),
      }));

      const exam = await createExam.mutateAsync({
        title: "امتحان مولد بالذكاء الاصطناعي",
        duration_minutes: 90,
        difficulty: "medium",
        is_ai_generated: true,
      });
      await replaceQuestions.mutateAsync({ examId: exam.id, questions });
      toast.success("تم إنشاء الأسئلة بنجاح");
      navigate(`/teacher/exams/${exam.id}/review`);
    } catch (error: any) {
      toast.error(error?.message || "تعذر توليد الامتحان");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfcff]">
      <div className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 md:px-4 md:py-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/teacher/exams/new")} className="h-8 rounded-xl border-slate-200 px-3 text-[11px] text-slate-700 md:h-10 md:text-sm">
            <ArrowRight className="ml-1 h-3.5 w-3.5 md:h-4 md:w-4" /> العودة
          </Button>
          <div className="hidden flex-1 md:block md:px-6">
            <ExamWizardStepper steps={STEPS} currentStep="ai" />
          </div>
          <Button variant="outline" size="sm" className="h-8 rounded-xl border-slate-200 px-3 text-[11px] text-violet-700 md:h-10 md:text-sm">
            <Save className="ml-1 h-3.5 w-3.5 md:h-4 md:w-4" /> حفظ كمسودة
          </Button>
        </div>
        <div className="overflow-x-auto border-t border-slate-50 md:hidden">
          <ExamWizardStepper steps={STEPS} currentStep="ai" />
        </div>
      </div>

      <main className="mx-auto flex min-h-[calc(100vh-92px)] max-w-3xl flex-col px-3 py-4 md:min-h-[calc(100vh-112px)] md:px-6 md:py-6">
        <section className="flex flex-1 flex-col justify-center pb-4">
          <div className="mx-auto w-full max-w-2xl text-center">
            <img src={aiBot} alt="المساعد الذكي" width={120} height={120} loading="eager" className="mx-auto mb-2 h-20 w-20 object-contain md:h-28 md:w-28" />
            <h1 className="mb-1 flex items-center justify-center gap-2 text-[22px] font-bold text-slate-950 md:text-4xl">
              نظام الامتحان الذكي <Sparkles className="h-4 w-4 text-violet-500 md:h-6 md:w-6" />
            </h1>
            <p className="mx-auto max-w-xl px-2 text-[12px] leading-6 text-slate-500 md:text-base md:leading-8">
              ارفع صورة أو ملفًا أو اكتب وصف الدرس، وسأحوّله إلى امتحان منظم بأسئلة وإجابات جاهزة للمراجعة.
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 md:mt-5">
              {capabilities.map((item) => (
                <div key={item.label} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold md:text-xs", item.color)}>
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </div>
              ))}
            </div>

            <Card className="mt-5 rounded-[22px] border-slate-200 bg-white p-3 text-right shadow-[0_14px_44px_rgba(15,23,42,0.05)] md:mt-8 md:rounded-[28px] md:p-4">
              <div className="mb-3 flex items-start gap-2.5 rounded-2xl bg-[#fbfbff] p-3 md:p-4">
                <img src={aiBot} alt="المساعد" width={48} height={48} className="h-10 w-10 shrink-0 object-contain md:h-12 md:w-12" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-950 md:text-base">مرحباً يا محمد 👋</p>
                  <p className="mt-1 text-[12px] leading-6 text-slate-500 md:text-sm md:leading-7">
                    أخبرني بما تريد: عدد الأسئلة، نوعها، أو ارفع ملف المحتوى مباشرة.
                  </p>
                </div>
              </div>

              <div className="flex min-h-[130px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center md:min-h-[170px]">
                <div>
                  <Sparkles className="mx-auto mb-2 h-5 w-5 text-violet-500 md:h-6 md:w-6" />
                  <p className="text-sm font-bold text-slate-900 md:text-lg">ابدأ بطلبك أو أرفق المحتوى</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500 md:text-sm">مثال: استخرج 20 سؤال اختيار من متعدد من هذا الملف.</p>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-2 py-2 shadow-sm md:px-3 md:py-3">
                <input ref={inputFileRef} type="file" accept="image/*,application/pdf,.doc,.docx,.txt" className="hidden" onChange={handleFile} />
                {fileName ? (
                  <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-violet-50 px-3 py-2 text-[11px] text-violet-700 md:text-xs">
                    <span className="truncate">📎 {fileName}</span>
                    <button type="button" onClick={() => { setFileName(""); setFileBase64(""); }} className="shrink-0 rounded-full p-1 hover:bg-violet-100" aria-label="حذف الملف">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
                <div className="flex items-end gap-2">
                  <button type="button" onClick={() => inputFileRef.current?.click()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 md:h-11 md:w-11" aria-label="رفع ملف أو صورة">
                    <Paperclip className="h-4 w-4 md:h-5 md:w-5" />
                  </button>
                  <Textarea id="exam-ai-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} placeholder="اكتب وصف الامتحان أو اطلب استخراج الأسئلة..." className="min-h-[44px] flex-1 resize-none border-0 p-0 text-[13px] leading-6 text-slate-900 shadow-none placeholder:text-slate-400 focus-visible:ring-0 md:min-h-[58px] md:text-base" />
                  <Button onClick={generate} disabled={busy} className="h-9 w-9 shrink-0 rounded-xl bg-violet-600 p-0 hover:bg-violet-700 md:h-11 md:w-11" aria-label="إنشاء الامتحان">
                    <Send className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  </Button>
                </div>
              </div>
            </Card>
            <p className="mt-3 text-center text-[10px] leading-5 text-slate-400 md:text-xs">سيتم فتح صفحة مراجعة الأسئلة بعد إنشاء الامتحان.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
