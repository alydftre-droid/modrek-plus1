import { useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Save, Send, Paperclip, Sparkles, Upload, FileText, Type, ImageIcon, Loader2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCreateExam, useReplaceExamQuestions } from "@/hooks/useExamMutations";
import type { EditorQuestion, EditorQType } from "@/components/exams/teacher/QuestionEditorCard";
import ExamWizardStepper from "@/components/exams/teacher/ExamWizardStepper";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "ai", label: "المساعد الذكي" },
  { id: "review", label: "مراجعة الأسئلة" },
  { id: "settings", label: "إعدادات الامتحان" },
  { id: "preview", label: "معاينة ونشر" },
];

type Msg = { id: string; role: "user" | "assistant"; text: string };

function fileToBase64(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

export default function AiAssistantPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([
    { id: "w", role: "assistant", text: "مرحباً بك! 👋\nأنا مساعدك الذكي في إنشاء الامتحانات.\nيمكنني استخراج الأسئلة من أي محتوى دراسي وتحويله إلى امتحان متكامل.\n\nما نوع المحتوى الذي تريد استخدامه؟" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [attached, setAttached] = useState<{ name: string; base64?: string; text?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const createExam = useCreateExam();
  const replaceQuestions = useReplaceExamQuestions();

  const quickOptions = useMemo(() => [
    { icon: Upload, label: "رفع امتحان ورقي", sub: "صورة لامتحان ورقي", color: "bg-sky-100 text-sky-600" },
    { icon: ImageIcon, label: "صور من الكتاب", sub: "صور صفحات من كتاب", color: "bg-violet-100 text-violet-600" },
    { icon: FileText, label: "ملف PDF", sub: "ملف PDF أو Word", color: "bg-rose-100 text-rose-600" },
    { icon: Type, label: "نص الدرس", sub: "اكتب أو ألصق نص الدرس", color: "bg-violet-100 text-violet-600" },
  ], []);

  const handleAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast.error("الملف كبير جداً (الحد 8MB)"); return; }
    const base64 = await fileToBase64(f);
    setAttached({ name: f.name, base64 });
    toast.success(`تم إرفاق: ${f.name}`);
    e.target.value = "";
  };

  const send = async () => {
    if (!input.trim() && !attached) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", text: input || (attached ? `📎 ${attached.name}` : "") };
    setMessages((m) => [...m, userMsg]);
    const text = input;
    setInput("");
    setBusy(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-exam", {
        body: {
          subjectName: "",
          lessonTitle: "",
          lessonText: text,
          questionCount: 10,
          difficulty: "متوسط",
          imageBase64: attached?.base64,
        },
      });
      if (error) throw error;

      const questions: EditorQuestion[] = (data?.questions || []).map((q: any, i: number) => ({
        id: crypto.randomUUID(),
        index: i + 1,
        type: (q.type || "mcq") as EditorQType,
        text: q.question || q.text || "",
        marks: q.marks || 1,
        modelAnswer: q.correctAnswer || q.modelAnswer || "",
        options: (q.options || []).map((o: any, j: number) => ({
          id: crypto.randomUUID(),
          text: typeof o === "string" ? o : (o.text || ""),
          isCorrect: typeof o === "object" ? !!o.isCorrect : (q.correctIndex === j),
        })),
      }));

      setMessages((m) => [...m, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: `✨ تم استخراج ${questions.length} سؤال بنجاح! جاري الانتقال لصفحة المراجعة...`,
      }]);

      // Create draft exam + save questions, navigate to review
      const exam = await createExam.mutateAsync({
        title: "امتحان مولد بالذكاء الاصطناعي",
        duration_minutes: 60,
        difficulty: "medium",
        is_ai_generated: true,
      });
      await replaceQuestions.mutateAsync({ examId: exam.id, questions });
      setAttached(null);
      setTimeout(() => navigate(`/teacher/exams/${exam.id}/review`), 800);
    } catch (e: any) {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: `⚠️ حدث خطأ: ${e?.message || "تعذر توليد الأسئلة"}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Top bar */}
      <div className="border-b bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/teacher/exams/new")} className="gap-2">
            <ArrowRight className="w-4 h-4" /> العودة
          </Button>
          <div className="flex-1 hidden md:block">
            <ExamWizardStepper steps={STEPS} currentStep="ai" />
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <Save className="w-4 h-4" /> حفظ كمسودة
          </Button>
        </div>
        <div className="md:hidden border-t">
          <ExamWizardStepper steps={STEPS} currentStep="ai" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center justify-center gap-2">
            نظام الامتحان الذكي <Sparkles className="w-6 h-6 text-violet-500" />
          </h1>
          <p className="text-muted-foreground text-sm">استخدم الذكاء الاصطناعي لاستخراج الأسئلة من أي محتوى دراسي</p>
        </div>

        {/* Welcome card */}
        <Card className="p-5 flex gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-100 dark:from-violet-500/20 dark:to-fuchsia-500/20 flex items-center justify-center shrink-0">
            <Bot className="w-7 h-7 text-violet-600" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold">مرحباً بك! 👋</h3>
            <p className="text-sm text-muted-foreground">أنا مساعدك الذكي في إنشاء الامتحانات. يمكنني استخراج الأسئلة من أي محتوى دراسي وتحويله إلى امتحان متكامل.</p>
            <p className="text-sm text-violet-600 font-medium">ما نوع المحتوى الذي تريد استخدامه؟</p>
          </div>
        </Card>

        <div>
          <p className="text-sm text-muted-foreground mb-2">بإمكانك تجربة:</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quickOptions.map((o) => (
              <button
                key={o.label}
                onClick={() => o.label.includes("نص") ? document.getElementById("ai-input")?.focus() : fileRef.current?.click()}
                className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card hover:shadow-md hover:border-primary/40 transition-all text-start"
              >
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", o.color)}>
                  <o.icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{o.label}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{o.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Conversation */}
        <Card className="min-h-[280px] p-5 space-y-3">
          <AnimatePresence>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn("flex gap-3", m.role === "user" ? "justify-start flex-row-reverse" : "")}
              >
                {m.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-violet-600" />
                  </div>
                )}
                <div className={cn(
                  "rounded-2xl px-4 py-2.5 max-w-[80%] text-sm whitespace-pre-wrap leading-relaxed",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                )}>
                  {m.text}
                </div>
              </motion.div>
            ))}
            {busy && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-violet-600" />
                </div>
                <div className="rounded-2xl px-4 py-2.5 bg-muted text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> جاري التحليل واستخراج الأسئلة...
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* Composer */}
        <Card className="p-3 flex items-end gap-2 sticky bottom-4 shadow-lg">
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleAttach} />
          <Button variant="ghost" size="icon" onClick={() => fileRef.current?.click()} className="shrink-0">
            <Paperclip className="w-5 h-5" />
          </Button>
          <div className="flex-1 relative">
            {attached && (
              <div className="mb-2 inline-flex items-center gap-2 px-2 py-1 rounded-md bg-violet-50 dark:bg-violet-500/15 text-xs">
                📎 {attached.name}
                <button onClick={() => setAttached(null)} className="text-muted-foreground hover:text-foreground">✕</button>
              </div>
            )}
            <Textarea
              id="ai-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="اكتب طلبك هنا... مثال: استخرج كل الأسئلة المقالية والاختيار من متعدد من هذا المحتوى"
              rows={1}
              className="resize-none border-0 focus-visible:ring-0 px-2"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
          </div>
          <Button
            onClick={send}
            disabled={busy || (!input.trim() && !attached)}
            className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
            size="icon"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </Card>

        <p className="text-center text-xs text-muted-foreground">المساعد الذكي قد يخطئ. يرجى مراجعة الأسئلة والإجابات قبل اعتمادها.</p>
      </div>
    </div>
  );
}
