import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, FileText, Image as ImageIcon, Link as LinkIcon, Minus, Paperclip, Plus, Save, Send, Sparkles, Type, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [count, setCount] = useState(20);
  const [difficulty, setDifficulty] = useState("متوسط");
  const [selectedTypes, setSelectedTypes] = useState<EditorQType[]>(["mcq", "true_false", "short_answer"]);
  const [busy, setBusy] = useState(false);
  const createExam = useCreateExam();
  const replaceQuestions = useReplaceExamQuestions();

  const sourceCards = useMemo(
    () => [
      { icon: Upload, label: "رفع امتحان ورقي", sub: "صورة لامتحان ورقي", action: () => inputFileRef.current?.click(), color: "text-violet-600 bg-violet-100" },
      { icon: ImageIcon, label: "صور من الكتاب", sub: "صور صفحات من كتاب", action: () => inputFileRef.current?.click(), color: "text-fuchsia-600 bg-fuchsia-100" },
      { icon: FileText, label: "ملف PDF", sub: "ملف PDF أو Word", action: () => inputFileRef.current?.click(), color: "text-rose-600 bg-rose-100" },
      { icon: Type, label: "نص الدرس", sub: "اكتب أو الصق نص الدرس", action: () => document.getElementById("exam-ai-prompt")?.focus(), color: "text-sky-600 bg-sky-100" },
      { icon: LinkIcon, label: "رابط إلكتروني", sub: "رابط لمحتوى تعليمي", action: () => document.getElementById("exam-ai-prompt")?.focus(), color: "text-violet-600 bg-violet-100" },
    ],
    []
  );

  const toggleType = (type: EditorQType) => {
    setSelectedTypes((current) => (current.includes(type) ? current.filter((item) => item !== type) : [...current, type]));
  };

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
          questionCount: count,
          difficulty,
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
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 md:px-4 md:py-4">
          <Button variant="outline" size="sm" onClick={() => navigate("/teacher/exams/new")} className="h-9 md:h-12 rounded-xl md:rounded-2xl border-slate-200 px-3 md:px-5 text-xs md:text-base">
            <ArrowRight className="ml-1 md:ml-2 h-4 w-4" /> العودة
          </Button>
          <div className="hidden flex-1 md:block">
            <ExamWizardStepper steps={STEPS} currentStep="ai" />
          </div>
          <Button variant="outline" size="sm" className="h-9 md:h-12 rounded-xl md:rounded-2xl border-slate-200 px-3 md:px-5 text-xs md:text-base text-violet-700">
            <Save className="ml-1 md:ml-2 h-4 w-4" /> حفظ كمسودة
          </Button>
        </div>
        <div className="border-t border-slate-100 md:hidden overflow-x-auto">
          <ExamWizardStepper steps={STEPS} currentStep="ai" />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-3 py-4 md:px-6 md:py-6">
        <div className="mb-4 md:mb-6 text-center">
          <h1 className="mb-1 md:mb-2 flex items-center justify-center gap-2 text-lg md:text-5xl font-bold text-slate-900">
            نظام الامتحان الذكي <Sparkles className="h-4 w-4 md:h-8 md:w-8 text-violet-500" />
          </h1>
          <p className="text-[11px] md:text-base text-slate-500 px-2">استخدم الذكاء الاصطناعي لاستخراج الأسئلة من أي محتوى دراسي</p>
        </div>

        <div className="grid gap-3 md:gap-5 xl:grid-cols-[1fr_320px]">
          <div className="space-y-3 md:space-y-4">
            <Card className="rounded-2xl md:rounded-[24px] border-slate-200 bg-white p-3 md:p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
              <div className="flex items-start gap-3 md:gap-4">
                <img src={aiBot} alt="AI" width={80} height={80} loading="lazy" className="h-14 w-14 md:h-20 md:w-20 shrink-0 object-contain" />
                <div className="flex-1 text-right">
                  <p className="mb-1 text-sm md:text-2xl font-bold text-slate-900">مرحباً بك! 👋 يا محمد</p>
                  <p className="text-[11px] md:text-base leading-6 md:leading-8 text-slate-500">أنا مساعدك الذكي في إنشاء الامتحانات. يمكنني استخراج الأسئلة من أي محتوى دراسي وتحويله إلى امتحان متكامل.</p>
                  <p className="mt-1.5 md:mt-2 text-xs md:text-lg font-semibold text-violet-600">ما نوع المحتوى الذي تريد استخدامه؟</p>
                </div>
              </div>
            </Card>

            <div>
              <p className="mb-2 md:mb-3 text-right text-xs md:text-sm font-semibold text-slate-600">بإمكانك تجربة:</p>
              <div className="grid gap-2 md:gap-3 md:grid-cols-2 xl:grid-cols-5">
                {sourceCards.map((card) => (
                  <button key={card.label} type="button" onClick={card.action} className="rounded-2xl md:rounded-[20px] border border-slate-200 bg-white p-3 md:p-4 text-right shadow-[0_12px_40px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
                    <div className={cn("mb-2 md:mb-3 flex h-8 w-8 md:h-11 md:w-11 items-center justify-center rounded-lg md:rounded-xl", card.color)}>
                      <card.icon className="h-4 w-4 md:h-5 md:w-5" />
                    </div>
                    <p className="text-xs md:text-base font-bold text-slate-800">{card.label}</p>
                    <p className="mt-0.5 md:mt-1 text-[10px] md:text-xs text-slate-500">{card.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            <Card className="rounded-2xl md:rounded-[24px] border-slate-200 bg-white p-3 md:p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
              <div className="flex min-h-[200px] md:min-h-[280px] items-center justify-center rounded-2xl md:rounded-[20px] bg-[#fbfbff] p-4 md:p-6 text-center">
                <div>
                  <img src={aiBot} alt="AI" width={120} height={120} loading="lazy" className="mx-auto mb-3 md:mb-4 h-20 w-20 md:h-32 md:w-32 object-contain" />
                  <p className="mb-1.5 md:mb-2 text-sm md:text-2xl font-bold text-violet-600">ابدأ المحادثة مع المساعد الذكي</p>
                  <p className="text-[11px] md:text-base text-slate-500">اكتب طلبك أو ارفع محتوى وسأقوم بإعداد الأسئلة لك</p>
                </div>
              </div>

              <div className="mt-3 md:mt-4 flex items-end gap-2 md:gap-3 rounded-2xl md:rounded-[20px] border border-slate-200 bg-white px-2 md:px-3 py-2 md:py-3 shadow-sm">
                <input ref={inputFileRef} type="file" accept="image/*,application/pdf,.doc,.docx,.txt" className="hidden" onChange={handleFile} />
                <button type="button" onClick={() => inputFileRef.current?.click()} className="flex h-9 w-9 md:h-11 md:w-11 shrink-0 items-center justify-center rounded-lg md:rounded-xl text-slate-500 hover:bg-slate-100">
                  <Paperclip className="h-4 w-4 md:h-5 md:w-5" />
                </button>
                <div className="flex-1 min-w-0">
                  {fileName ? <div className="mb-1.5 truncate rounded-lg bg-violet-50 px-2 py-1 text-[10px] md:text-xs text-violet-700">📎 {fileName}</div> : null}
                  <Textarea id="exam-ai-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} placeholder="اكتب طلبك هنا..." className="min-h-[44px] md:min-h-[58px] resize-none border-0 p-0 text-xs md:text-base shadow-none focus-visible:ring-0" />
                </div>
                <Button onClick={generate} disabled={busy} className="h-9 w-9 md:h-11 md:w-11 shrink-0 rounded-lg md:rounded-xl bg-violet-600 p-0 hover:bg-violet-700">
                  <Send className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </Button>
              </div>
            </Card>

            <p className="text-center text-[11px] md:text-sm text-slate-500">المساعد الذكي قد يخطئ. يرجى مراجعة الأسئلة والإجابات قبل اعتمادها.</p>
          </div>

          <div className="space-y-4">
            <Card className="rounded-[24px] border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
              <div className="mb-4 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-violet-600" />
                <h3 className="text-xl font-bold text-slate-900">مصادر المحتوى</h3>
              </div>
              <p className="mb-4 text-sm text-slate-500">أضف المحتوى الذي تريد استخراج الأسئلة منه</p>
              <div className="rounded-[20px] border border-dashed border-slate-200 bg-[#fbfbff] px-4 py-8 text-center text-slate-500">
                <div className="mb-3 flex items-center justify-center gap-3 text-slate-400">
                  <ImageIcon className="h-5 w-5" />
                  <FileText className="h-5 w-5" />
                  <Upload className="h-5 w-5" />
                </div>
                <p className="mb-2 text-base font-semibold text-violet-600">اسحب الملفات هنا أو اضغط للاختيار</p>
                <p className="text-sm">PDF, DOCX, TXT, صور (JPG, PNG)</p>
              </div>
              <div className="mt-4 rounded-[20px] border border-slate-200 p-4 text-center text-sm text-slate-500">المحتوى المضاف ({fileName ? 1 : 0})</div>
            </Card>

            <Card className="rounded-[24px] border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">خيارات الأسئلة</h3>
                <Sparkles className="h-5 w-5 text-violet-600" />
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">عدد الأسئلة المطلوبة</label>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setCount((c) => Math.max(1, c - 1))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200"><Minus className="h-4 w-4" /></button>
                    <Input value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} className="h-10 rounded-xl text-center" />
                    <button type="button" onClick={() => setCount((c) => c + 1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200"><Plus className="h-4 w-4" /></button>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">مستوى الصعوبة</label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="سهل">سهل</SelectItem>
                      <SelectItem value="متوسط">متوسط</SelectItem>
                      <SelectItem value="صعب">صعب</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-3 block text-sm font-semibold text-slate-700">أنواع الأسئلة</label>
                  <div className="space-y-3">
                    {[
                      ["mcq", "اختيار من متعدد"],
                      ["true_false", "صح / خطأ"],
                      ["short_answer", "مقالية قصيرة"],
                      ["essay", "أخرى"],
                    ].map(([value, label]) => (
                      <div key={value} className="flex items-center justify-between">
                        <label className="text-sm text-slate-700">{label}</label>
                        <Checkbox checked={selectedTypes.includes(value as EditorQType)} onCheckedChange={() => toggleType(value as EditorQType)} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
