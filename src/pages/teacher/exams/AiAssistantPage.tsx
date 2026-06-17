import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Loader2, Paperclip, Save, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ExamWizardStepper from "@/components/exams/teacher/ExamWizardStepper";
import type { EditorQuestion, EditorQType } from "@/components/exams/teacher/QuestionEditorCard";
import { useCreateExam, useReplaceExamQuestions } from "@/hooks/useExamMutations";
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

function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export default function AiAssistantPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");
  const [fileMimeType, setFileMimeType] = useState("");
  const [assistantReply, setAssistantReply] = useState("");
  const [busy, setBusy] = useState(false);
  const createExam = useCreateExam();
  const replaceQuestions = useReplaceExamQuestions();

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileMimeType(file.type);
    if (file.type.startsWith("text/")) {
      const text = await fileToText(file);
      setPrompt((current) => [current, text].filter(Boolean).join("\n\n"));
      setFileBase64("");
    } else {
      setFileBase64(await fileToBase64(file));
    }
    event.target.value = "";
  };

  const generate = async () => {
    if (!prompt.trim() && !fileBase64) {
      toast.error("أضف محتوى أو ارفع ملفاً أولاً");
      return;
    }

    setBusy(true);
    setAssistantReply("أحلّل المحتوى الآن وأستخرج منه أسئلة جاهزة للمراجعة...");
    try {
      const { data, error } = await supabase.functions.invoke("generate-exam", {
        body: {
          lessonText: prompt,
          questionCount: 20,
          difficulty: "متوسط",
          fileBase64: fileBase64 || undefined,
          fileMimeType: fileMimeType || undefined,
          fileName: fileName || undefined,
          imageBase64: fileMimeType.startsWith("image/") ? fileBase64 : undefined,
        },
      });
      if (error) throw error;

      const questions: EditorQuestion[] = (data?.questions || []).map((q: any, index: number) => ({
        id: crypto.randomUUID(),
        index: index + 1,
        type: (q.type || "mcq") as EditorQType,
        text: q.question || q.text || "",
        marks: q.points || q.marks || 1,
        modelAnswer: q.correct_answer || q.correctAnswer || q.model_answer || q.modelAnswer || "",
        options: (q.options || []).map((option: any, optionIndex: number) => ({
          id: crypto.randomUUID(),
          text: typeof option === "string" ? option : option.text,
          isCorrect: typeof option === "object" ? !!option.isCorrect : (q.correct_answer || q.correctAnswer) === option || q.correctIndex === optionIndex,
        })),
      }));

      const exam = await createExam.mutateAsync({
        title: "امتحان مولد بالذكاء الاصطناعي",
        duration_minutes: 90,
        difficulty: "medium",
        is_ai_generated: true,
        subject_id: params.get("subject_id") || undefined,
        group_id: params.get("group_id") || undefined,
        term: params.get("term") || undefined,
      });
      await replaceQuestions.mutateAsync({ examId: exam.id, questions });
      setAssistantReply(`تم استخراج ${questions.length} سؤال بنجاح. سأفتح لك صفحة المراجعة الآن.`);
      toast.success("تم إنشاء الأسئلة بنجاح");
      navigate(`/teacher/exams/${exam.id}/review`);
    } catch (error: any) {
      toast.error(error?.message || "تعذر توليد الامتحان");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fbfaff]">
      <div className="sticky top-0 z-20 border-b border-violet/20 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 md:px-4 md:py-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/teacher/exams/new")} className="h-8 rounded-xl border-violet/20 px-3 text-[11px] text-slate-700 md:h-10 md:text-sm">
            <ArrowRight className="ml-1 h-3.5 w-3.5 md:h-4 md:w-4" /> العودة
          </Button>
          <div className="hidden flex-1 md:block md:px-6">
            <ExamWizardStepper steps={STEPS} currentStep="ai" />
          </div>
          <Button variant="outline" size="sm" className="h-8 rounded-xl border-violet/20 px-3 text-[11px] text-violet md:h-10 md:text-sm">
            <Save className="ml-1 h-3.5 w-3.5 md:h-4 md:w-4" /> حفظ كمسودة
          </Button>
        </div>
        <div className="overflow-x-auto border-t border-violet/10 md:hidden">
          <ExamWizardStepper steps={STEPS} currentStep="ai" />
        </div>
      </div>

      <main className="mx-auto flex min-h-[calc(100vh-92px)] max-w-3xl flex-col px-3 py-4 [letter-spacing:0] [word-spacing:0] md:min-h-[calc(100vh-112px)] md:px-6 md:py-6">
        <section className="flex flex-1 flex-col justify-center pb-4">
          <div className="mx-auto w-full max-w-2xl text-center">
            <img src={aiBot} alt="المساعد الذكي" width={132} height={132} loading="eager" className="mx-auto mb-2 h-24 w-24 object-contain md:h-32 md:w-32" />
            <h1 className="mb-1 text-[22px] font-bold leading-tight text-slate-950 [letter-spacing:0] [word-spacing:0] md:text-4xl">
              المساعد الذكي للامتحانات
            </h1>
            <p className="mx-auto max-w-xl px-2 text-[12px] leading-6 text-slate-500 [letter-spacing:0] [word-spacing:0] md:text-base md:leading-8">
              اكتب طلبك أو ارفع محتوى الدرس، وسيستخرج لك أسئلة منظمة وإجابات نموذجية جاهزة للمراجعة.
            </p>

            <Card className="mt-6 rounded-[24px] border-violet/20 bg-white p-2.5 text-right shadow-[0_18px_55px_rgba(109,40,217,0.10)] md:mt-8 md:rounded-[30px] md:p-3.5">
              {assistantReply ? (
                <div className="mb-3 flex items-start gap-2.5 rounded-2xl bg-violet/10 p-3 text-right md:p-4">
                  <img src={aiBot} alt="المساعد" width={44} height={44} className="h-9 w-9 shrink-0 object-contain md:h-11 md:w-11" />
                  <p className="flex-1 text-[12px] font-semibold leading-6 text-violet [letter-spacing:0] [word-spacing:0] md:text-sm md:leading-7">
                    {assistantReply}
                  </p>
                </div>
              ) : null}

              <div className="rounded-[22px] border border-violet/20 bg-gradient-to-b from-white to-violet/10 px-2.5 py-2.5 shadow-inner md:px-3.5 md:py-3.5">
                <input ref={inputFileRef} type="file" accept="image/*,application/pdf,.txt,text/plain" className="hidden" onChange={handleFile} />
                {fileName ? (
                  <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 text-[11px] font-semibold text-violet shadow-sm ring-1 ring-violet/20 md:text-xs">
                    <span className="truncate">📎 {fileName}</span>
                    <button type="button" onClick={() => { setFileName(""); setFileBase64(""); setFileMimeType(""); }} className="shrink-0 rounded-full p-1 hover:bg-violet/10" aria-label="حذف الملف">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
                <div className="flex items-end gap-2">
                  <button type="button" onClick={() => inputFileRef.current?.click()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-violet shadow-sm ring-1 ring-violet/20 transition hover:bg-violet/10 md:h-12 md:w-12" aria-label="رفع ملف أو صورة">
                    <Paperclip className="h-4 w-4 md:h-5 md:w-5" />
                  </button>
                  <Textarea id="exam-ai-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} placeholder="اكتب طلبك هنا... مثال: استخرج 20 سؤال اختيار من متعدد" className="min-h-[52px] flex-1 resize-none border-0 bg-transparent p-1 text-[13px] leading-6 text-slate-950 shadow-none [letter-spacing:0] [word-spacing:0] placeholder:text-slate-400 focus-visible:ring-0 md:min-h-[66px] md:text-base" />
                  <button type="button" onClick={generate} disabled={busy} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet text-primary-foreground shadow-[0_10px_24px_rgba(124,58,237,0.28)] transition hover:opacity-90 disabled:opacity-70 md:h-12 md:w-12" aria-label="إرسال للمساعد">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin md:h-5 md:w-5" /> : <Send className="h-4 w-4 md:h-5 md:w-5" />}
                  </button>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
