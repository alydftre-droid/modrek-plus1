import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Loader2, Paperclip, RotateCcw, Save, Send, ShieldCheck, StopCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import ExamWizardStepper from "@/components/exams/teacher/ExamWizardStepper";
import type { EditorQuestion, EditorQType } from "@/components/exams/teacher/QuestionEditorCard";
import { useCreateExam, useReplaceExamQuestions } from "@/hooks/useExamMutations";
import { confidenceLabel, invokeModrekReason, isAbort, type ModrekCitation, type ModrekReasonRequest } from "@/lib/modrekReason";
import aiBot from "@/assets/ai-bot-mascot.png";


const STEPS = [
  { id: "ai", label: "المساعد الذكي" },
  { id: "review", label: "مراجعة الأسئلة" },
  { id: "settings", label: "إعدادات الامتحان" },
  { id: "preview", label: "معاينة ونشر" },
];

type Difficulty = "سهل" | "متوسط" | "صعب" | "مختلط";

function normalizeAiQuestionType(value: unknown): EditorQType {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["tf", "truefalse", "true-false", "true false", "صح/خطأ", "صح وخطأ", "صح خطأ"].includes(raw)) return "true_false";
  if (["essay", "short_answer", "fill_blank", "section", "true_false"].includes(raw)) return raw as EditorQType;
  return "mcq";
}

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
  const abortRef = useRef<AbortController | null>(null);
  const lastPayloadRef = useRef<ModrekReasonRequest | null>(null);

  const [prompt, setPrompt] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");
  const [fileMimeType, setFileMimeType] = useState("");
  const [assistantReply, setAssistantReply] = useState("");
  const [citations, setCitations] = useState<ModrekCitation[]>([]);
  const [confidence, setConfidence] = useState<number>(0);
  const [libraryUsed, setLibraryUsed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");

  // Advanced controls
  const [total, setTotal] = useState(20);
  const [difficulty, setDifficulty] = useState<Difficulty>("متوسط");
  const [mcqPct, setMcqPct] = useState(60);
  const [tfPct, setTfPct] = useState(25);
  const [essayPct, setEssayPct] = useState(15);
  const [distribution, setDistribution] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const createExam = useCreateExam();
  const replaceQuestions = useReplaceExamQuestions();
  const creationQuery = params.toString();
  const createHomePath = params.get("return_to") || `/teacher/exams${creationQuery ? `?${creationQuery}` : ""}`;

  const distribution100 = useMemo(() => mcqPct + tfPct + essayPct, [mcqPct, tfPct, essayPct]);
  const counts = useMemo(() => {
    const norm = distribution100 || 1;
    const mcq = Math.round((mcqPct / norm) * total);
    const tf = Math.round((tfPct / norm) * total);
    const essay = Math.max(0, total - mcq - tf);
    return { mcq, tf, essay };
  }, [total, mcqPct, tfPct, essayPct, distribution100]);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("الحد الأقصى لحجم الملف 20MB");
      return;
    }
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

  const runProgress = () => {
    const stages = [
      { at: 15, label: "أخطط للطلب…" },
      { at: 35, label: "أبحث داخل مكتبة Modrek AI…" },
      { at: 55, label: "أرتب أفضل المصادر…" },
      { at: 78, label: "أُولّد الأسئلة والإجابات النموذجية…" },
      { at: 92, label: "أراجع الجودة والتوزيع…" },
    ];
    let i = 0;
    setProgress(5);
    setProgressLabel("أبدأ التنفيذ…");
    const id = setInterval(() => {
      if (i >= stages.length) return;
      const s = stages[i++];
      setProgress(s.at);
      setProgressLabel(s.label);
    }, 1400);
    return () => clearInterval(id);
  };

  const generate = async (retry = false) => {
    if (!retry && !prompt.trim() && !fileBase64) {
      toast.error("أضف محتوى أو ارفع ملفاً أولاً");
      return;
    }
    const payload: ModrekReasonRequest = retry && lastPayloadRef.current ? lastPayloadRef.current : {
      mode: "generate_exam",
      query: prompt.trim(),
      file_base64: fileBase64 || undefined,
      file_mime: fileMimeType || undefined,
      file_name: fileName || undefined,
      image_base64: fileMimeType.startsWith("image/") ? fileBase64 : undefined,
      image_mime: fileMimeType.startsWith("image/") ? fileMimeType : undefined,
      exam: {
        question_count: total,
        mcq: counts.mcq,
        tf: counts.tf,
        essay: counts.essay,
        difficulty,
        distribution: distribution.trim() || undefined,
        subject: params.get("subject_id") || undefined,
      },
      filters: {
        subject_id: params.get("subject_id") || undefined,
        term: params.get("term") || undefined,
      },
    };
    lastPayloadRef.current = payload;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setBusy(true);
    setAssistantReply("");
    setCitations([]);
    setConfidence(0);
    setLibraryUsed(null);
    const stopProgress = runProgress();

    try {
      const data = await invokeModrekReason(payload, { signal: ac.signal, retries: 1, timeoutMs: 120_000 });
      stopProgress();
      setProgress(100);
      setProgressLabel("اكتمل بنجاح");

      const rawQs: any[] = data.exam?.questions ?? [];
      if (!rawQs.length) throw new Error("لم يتم توليد أي أسئلة، حاول تعديل الطلب أو ارفع مصدرًا أوضح");

      const normalizeOptionValue = (value: unknown) => String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[أإآا]/g, "ا")
        .replace(/[ىي]/g, "ي")
        .replace(/[ة]/g, "ه")
        .replace(/\s+/g, " ");
      const isTruthyAnswer = (value: unknown) => {
        const normalized = normalizeOptionValue(value);
        return value === true || ["true", "صح", "صحيح", "نعم", "yes", "1"].includes(normalized);
      };
      const isFalseyAnswer = (value: unknown) => {
        const normalized = normalizeOptionValue(value);
        return value === false || ["false", "خطا", "خطاء", "غير صحيح", "لا", "no", "0"].includes(normalized);
      };

      const questions: EditorQuestion[] = rawQs.map((q: any, index: number) => {
        const type = normalizeAiQuestionType(q.type);
        const rawOptions: any[] = Array.isArray(q.options) ? q.options : [];
        const fallbackOptions = type === "true_false" && rawOptions.length === 0 ? ["صح", "خطأ"] : rawOptions;
        const correctAnswer = q.correct_answer || q.correctAnswer || q.model_answer || q.modelAnswer || "";
        const correctIndex = typeof q.correctIndex === "number" ? q.correctIndex : typeof q.correct_index === "number" ? q.correct_index : null;
        const trueFalseCorrect = type === "true_false" && isTruthyAnswer(correctAnswer)
          ? "صح"
          : type === "true_false" && isFalseyAnswer(correctAnswer)
            ? "خطأ"
            : null;
        return {
          id: crypto.randomUUID(),
          index: index + 1,
          type,
          text: q.question || q.text || "",
          marks: q.points || q.marks || 1,
          modelAnswer: type === "true_false" && trueFalseCorrect ? trueFalseCorrect : correctAnswer,
          options: fallbackOptions.map((option: any, optionIndex: number) => ({
            id: crypto.randomUUID(),
            text: typeof option === "string" ? option : option.text,
            isCorrect: typeof option === "object"
              ? !!(option.isCorrect ?? option.is_correct ?? (type === "true_false" && trueFalseCorrect && normalizeOptionValue(option.text) === normalizeOptionValue(trueFalseCorrect)))
              : (type === "true_false" && trueFalseCorrect
                ? normalizeOptionValue(option) === normalizeOptionValue(trueFalseCorrect)
                : normalizeOptionValue(correctAnswer) === normalizeOptionValue(option) || correctIndex === optionIndex || (type === "true_false" && !correctAnswer && optionIndex === 0)),
          })),
        };
      });

      setCitations(data.citations || []);
      setConfidence(data.confidence || 0);
      setLibraryUsed(!!data.library_used);
      setAssistantReply(
        data.library_used
          ? `تم توليد ${questions.length} سؤال اعتمادًا على ${data.citations?.length || 0} مصدر من مكتبة Modrek AI.`
          : `تم توليد ${questions.length} سؤال. لم يتم العثور على مصدر كافٍ في المكتبة، فتم الاعتماد على المعرفة العامة مع الالتزام بالمنهج.`
      );

      const exam = await createExam.mutateAsync({
        title: "امتحان مولد بالذكاء الاصطناعي",
        duration_minutes: 90,
        is_ai_generated: true,
        subject_id: params.get("subject_id") || undefined,
        group_id: params.get("group_id") || params.get("groupId") || undefined,
        sub_subject_id: params.get("sub_subject_id") || params.get("subSubjectId") || undefined,
        term: params.get("term") || undefined,
        target_education_type: params.get("target_education_type") || null,
        target_section: params.get("target_section") || null,
      });
      await replaceQuestions.mutateAsync({ examId: exam.id, questions });
      toast.success("تم إنشاء الأسئلة بنجاح");
      navigate(`/teacher/exams/${exam.id}/review${creationQuery ? `?${creationQuery}` : ""}`);
    } catch (error: any) {
      stopProgress();
      if (isAbort(error)) {
        setAssistantReply("تم إلغاء العملية.");
        toast("تم إلغاء التوليد");
      } else {
        setAssistantReply(error?.message || "تعذر توليد الامتحان، حاول مرة أخرى.");
        toast.error(error?.message || "تعذر توليد الامتحان");
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
      setTimeout(() => { setProgress(0); setProgressLabel(""); }, 800);
    }
  };

  const cancel = () => abortRef.current?.abort();

  const conf = confidenceLabel(confidence);
  const toneClass = conf.tone === "high"
    ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30"
    : conf.tone === "mid"
      ? "bg-amber-500/10 text-amber-700 ring-amber-500/30"
      : "bg-rose-500/10 text-rose-700 ring-rose-500/30";

  return (
    <div className="min-h-screen bg-[#fbfaff]">
      <div className="sticky top-0 z-20 border-b border-violet/20 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 md:px-4 md:py-3">
          <Button variant="outline" size="sm" onClick={() => navigate(createHomePath)} className="h-8 rounded-xl border-violet/20 px-3 text-[11px] text-slate-700 md:h-10 md:text-sm">
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

      {/* Mascot header at TOP — no vertical centering. */}
      <main className="mx-auto max-w-3xl px-3 pt-4 pb-24 md:px-6 md:pt-6">
        <header className="flex items-center gap-3 rounded-[24px] border border-violet/20 bg-gradient-to-l from-white via-violet/5 to-violet/10 p-3 shadow-[0_10px_30px_rgba(109,40,217,0.08)] md:gap-4 md:p-4">
          <img
            src={aiBot}
            alt="المساعد الذكي"
            width={96}
            height={96}
            loading="eager"
            className="h-16 w-16 shrink-0 object-contain md:h-24 md:w-24"
          />
          <div className="flex-1 text-right">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[18px] font-extrabold leading-tight text-slate-950 md:text-2xl">
                المساعد الذكي لإنشاء الامتحانات
              </h1>
              <Badge variant="secondary" className="rounded-full bg-violet/10 text-[10px] font-semibold text-violet ring-1 ring-violet/20 md:text-xs">
                <ShieldCheck className="ml-1 h-3 w-3" /> يعتمد على مكتبة Modrek AI
              </Badge>
            </div>
            <p className="mt-1 text-[12px] leading-6 text-slate-500 md:text-sm md:leading-7">
              اكتب طلبك أو ارفع مصدرًا، وسأبحث داخل المكتبة أولًا ثم أُولّد أسئلة وإجابات نموذجية مع ذكر المصدر ودرجة الثقة.
            </p>
          </div>
        </header>

        {/* Advanced controls */}
        <Card className="mt-3 rounded-[22px] border-violet/20 bg-white p-3 shadow-sm md:mt-4 md:p-4">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="mb-2 flex w-full items-center justify-between text-right text-[13px] font-semibold text-violet md:text-sm"
          >
            <span>{showAdvanced ? "إخفاء الخيارات المتقدمة" : "إظهار الخيارات المتقدمة"}</span>
            <span className="text-slate-400">{showAdvanced ? "▲" : "▼"}</span>
          </button>
          {showAdvanced && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-slate-700">عدد الأسئلة: {total}</label>
                <Slider value={[total]} onValueChange={(v) => setTotal(v[0])} min={5} max={60} step={1} />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-slate-700">مستوى الصعوبة</label>
                <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
                  <SelectTrigger className="h-9 rounded-xl border-violet/20 text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="سهل">سهل</SelectItem>
                    <SelectItem value="متوسط">متوسط</SelectItem>
                    <SelectItem value="صعب">صعب</SelectItem>
                    <SelectItem value="مختلط">مختلط</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-slate-700">اختيار من متعدد: {mcqPct}% ({counts.mcq})</label>
                <Slider value={[mcqPct]} onValueChange={(v) => setMcqPct(v[0])} min={0} max={100} step={5} />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-slate-700">صح/خطأ: {tfPct}% ({counts.tf})</label>
                <Slider value={[tfPct]} onValueChange={(v) => setTfPct(v[0])} min={0} max={100} step={5} />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-slate-700">مقالي: {essayPct}% ({counts.essay})</label>
                <Slider value={[essayPct]} onValueChange={(v) => setEssayPct(v[0])} min={0} max={100} step={5} />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-[12px] font-semibold text-slate-700">توزيع المنهج (اختياري)</label>
                <Textarea
                  value={distribution}
                  onChange={(e) => setDistribution(e.target.value)}
                  rows={2}
                  placeholder="مثال: الوحدة 1 (30%)، الوحدة 2 (40%)، الوحدة 3 (30%)"
                  className="min-h-[42px] resize-none rounded-xl border-violet/20 text-[12px]"
                />
              </div>
              {distribution100 !== 100 && (
                <p className="md:col-span-2 text-[11px] text-amber-600">
                  مجموع النسب الحالي {distribution100}% — سيتم تطبيعه تلقائيًا إلى 100%.
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Assistant reply + progress + citations */}
        {(busy || assistantReply || citations.length > 0) && (
          <Card className="mt-3 rounded-[22px] border-violet/20 bg-white p-3 shadow-sm md:p-4">
            {busy && (
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between text-[12px] font-semibold text-violet">
                  <span>{progressLabel}</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="outline" onClick={cancel} className="h-8 rounded-xl border-rose-300 text-[11px] text-rose-600 hover:bg-rose-50">
                    <StopCircle className="ml-1 h-3.5 w-3.5" /> إلغاء
                  </Button>
                </div>
              </div>
            )}

            {assistantReply && (
              <div className="mb-2 flex items-start gap-2.5 rounded-2xl bg-violet/10 p-3 text-right">
                <img src={aiBot} alt="المساعد" width={40} height={40} className="h-9 w-9 shrink-0 object-contain" />
                <div className="flex-1">
                  <p className="text-[12px] font-semibold leading-6 text-violet md:text-sm md:leading-7">{assistantReply}</p>
                  {libraryUsed !== null && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${toneClass}`}>
                        {conf.label} · {(confidence * 100).toFixed(0)}%
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {libraryUsed ? "المصدر: مكتبة Modrek AI" : "المصدر: خارجي"}
                      </span>
                      {!busy && (
                        <Button size="sm" variant="ghost" onClick={() => generate(true)} className="h-7 rounded-full px-2 text-[10px] text-violet">
                          <RotateCcw className="ml-1 h-3 w-3" /> إعادة المحاولة
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {citations.length > 0 && (
              <div className="rounded-2xl border border-violet/20 bg-violet/5 p-2.5 text-right">
                <p className="mb-1.5 text-[11px] font-bold text-violet">المصادر المستخدمة</p>
                <ul className="space-y-1.5">
                  {citations.slice(0, 6).map((c, i) => (
                    <li key={i} className="rounded-xl bg-white/70 p-2 text-[11px] text-slate-700 ring-1 ring-violet/10">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-semibold text-slate-900">{c.source_title || "مصدر"}</span>
                        {typeof c.confidence === "number" && (
                          <span className="text-[10px] text-slate-500">ثقة {(c.confidence * 100).toFixed(0)}%</span>
                        )}
                      </div>
                      {c.unit_title && <div className="text-[11px] text-slate-500">{c.unit_title}</div>}
                      {c.page_from != null && <div className="text-[10px] text-slate-400">صفحة {c.page_from}{c.page_to && c.page_to !== c.page_from ? `–${c.page_to}` : ""}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}

        {/* Composer */}
        <Card className="mt-3 rounded-[24px] border-violet/20 bg-white p-2.5 text-right shadow-[0_18px_55px_rgba(109,40,217,0.10)] md:mt-4 md:rounded-[30px] md:p-3.5">
          <div className="rounded-[22px] border border-violet/20 bg-gradient-to-b from-white to-violet/10 px-2.5 py-2.5 shadow-inner md:px-3.5 md:py-3.5">
            <input ref={inputFileRef} type="file" accept="image/*,application/pdf,.txt,.docx,.pptx,text/plain" className="hidden" onChange={handleFile} />
            {fileName && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 text-[11px] font-semibold text-violet shadow-sm ring-1 ring-violet/20 md:text-xs">
                <span className="truncate">📎 {fileName}</span>
                <button type="button" onClick={() => { setFileName(""); setFileBase64(""); setFileMimeType(""); }} className="shrink-0 rounded-full p-1 hover:bg-violet/10" aria-label="حذف الملف">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <button type="button" onClick={() => inputFileRef.current?.click()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-violet shadow-sm ring-1 ring-violet/20 transition hover:bg-violet/10 md:h-12 md:w-12" aria-label="رفع ملف">
                <Paperclip className="h-4 w-4 md:h-5 md:w-5" />
              </button>
              <Textarea
                id="exam-ai-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={2}
                placeholder="اكتب طلبك… مثال: استخرج أسئلة الوحدة الثانية بمستوى متوسط"
                className="min-h-[52px] flex-1 resize-none border-0 bg-transparent p-1 text-[13px] leading-6 text-slate-950 shadow-none placeholder:text-slate-400 focus-visible:ring-0 md:min-h-[66px] md:text-base"
              />
              <button
                type="button"
                onClick={() => generate(false)}
                disabled={busy}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet text-primary-foreground shadow-[0_10px_24px_rgba(124,58,237,0.28)] transition hover:opacity-90 disabled:opacity-70 md:h-12 md:w-12"
                aria-label="إرسال"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin md:h-5 md:w-5" /> : <Send className="h-4 w-4 md:h-5 md:w-5" />}
              </button>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
