import { Copy, Trash2, CheckCircle2, ListOrdered, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type EditorQType = "mcq" | "true_false" | "short_answer" | "essay" | "fill_blank" | "section";

export interface EditorQuestion {
  id: string;
  index: number;
  type: EditorQType;
  text: string;
  marks: number;
  modelAnswer?: string;
  options: { id: string; text: string; isCorrect: boolean }[];
  sectionTitle?: string;
  sectionTotal?: number;
  sectionAllocated?: number;
}

const TYPE_LABEL: Record<EditorQType, string> = {
  mcq: "اختيار من متعدد",
  true_false: "صح / خطأ",
  short_answer: "إجابة قصيرة",
  essay: "مقالي",
  fill_blank: "ملء فراغ",
  section: "قسم رئيسي",
};

const TYPE_PILL: Record<EditorQType, string> = {
  mcq: "bg-[hsl(var(--mudrik-green))]/10 text-[hsl(var(--mudrik-green))]",
  true_false: "bg-[hsl(var(--mudrik-green))]/10 text-[hsl(var(--mudrik-green))]",
  short_answer: "bg-sky-50 text-sky-600",
  essay: "bg-rose-50 text-rose-500",
  fill_blank: "bg-orange-50 text-orange-500",
  section: "bg-[hsl(var(--mudrik-green))]/10 text-[hsl(var(--mudrik-green))]",
};

interface Props {
  question: EditorQuestion;
  total: number;
  showAnswers?: boolean;
  onChange: (q: EditorQuestion) => void;
  onDelete: () => void;
  onDuplicate?: () => void;
}

export default function QuestionEditorCard({ question, onChange, onDelete, onDuplicate }: Props) {
  const set = (patch: Partial<EditorQuestion>) => onChange({ ...question, ...patch });

  // ===== Section header (CONTAINER — not a question) =====
  if (question.type === "section") {
    const allocated = Number(question.sectionAllocated || 0);
    const totalMarks = Number(question.sectionTotal || 0);
    const remaining = totalMarks - allocated;
    const overflow = allocated > totalMarks;
    const filled = allocated === totalMarks && totalMarks > 0;
    return (
      <div className="rounded-[20px] border-2 border-[hsl(var(--mudrik-green))]/30 bg-gradient-to-l from-[hsl(var(--mudrik-green))]/5 to-white p-4 shadow-[0_8px_24px_hsl(var(--mudrik-green)/0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onDuplicate} className="grid h-9 w-9 place-items-center rounded-xl border border-[hsl(var(--mudrik-green))]/30 bg-white text-[hsl(var(--mudrik-green))]">
              <Copy className="h-4 w-4" />
            </button>
            <button type="button" onClick={onDelete} className="grid h-9 w-9 place-items-center rounded-xl border border-rose-200 bg-rose-50 text-rose-500">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--mudrik-green))]/10 px-3 py-1.5 text-xs font-bold text-[hsl(var(--mudrik-green))]">
              <Star className="h-3 w-3" />
              <Input
                type="number"
                min={0}
                value={question.sectionTotal ?? 0}
                onChange={(e) => set({ sectionTotal: Math.max(0, Number(e.target.value) || 0) })}
                className="h-5 w-12 border-0 bg-transparent p-0 text-center text-xs font-bold focus-visible:ring-0"
              />
              <span>درجة</span>
            </div>
            <div className="rounded-full bg-[hsl(var(--mudrik-green))]/15 px-3 py-1.5 text-xs font-bold text-[hsl(var(--mudrik-green))]">
              <ListOrdered className="inline h-3 w-3 ml-1" />
              {question.sectionTitle || "قسم"}
            </div>
          </div>
        </div>
        <Textarea
          value={question.text}
          onChange={(e) => set({ text: e.target.value })}
          rows={2}
          placeholder="تعليمات القسم: مثال — أجب عن الأسئلة التالية."
          className="mt-3 rounded-xl border-[hsl(var(--mudrik-green))]/30 bg-white text-right text-base"
        />
        <div
          className={cn(
            "mt-3 flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold",
            overflow ? "bg-rose-50 text-rose-600" : filled ? "bg-[hsl(var(--mudrik-green))]/10 text-[hsl(var(--mudrik-green))]" : "bg-slate-50 text-slate-500"
          )}
        >
          <span>موزّع: {allocated} / {totalMarks}</span>
          <span>
            {overflow ? `تجاوز ${allocated - totalMarks}` : filled ? "مكتمل ✓" : `المتبقي ${remaining}`}
          </span>
        </div>
      </div>
    );
  }

  // ===== Regular sub-question =====
  const updateOption = (idx: number, patch: Partial<EditorQuestion["options"][0]>) => {
    const next = [...question.options];
    next[idx] = { ...next[idx], ...patch };
    if (patch.isCorrect) {
      next.forEach((o, i) => { if (i !== idx) o.isCorrect = false; });
    }
    const selectedCorrect = next.find((option) => option.isCorrect);
    set({ options: next, modelAnswer: selectedCorrect?.text || question.modelAnswer || "" });
  };

  const correctOpt = question.options.find((o) => o.isCorrect);
  const isMCQ = question.type === "mcq" || question.type === "true_false";

  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_6px_20px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onDuplicate} className="grid h-9 w-9 place-items-center rounded-xl border border-[hsl(var(--mudrik-green))]/30 bg-[hsl(var(--mudrik-green))]/5 text-[hsl(var(--mudrik-green))]">
            <Copy className="h-4 w-4" />
          </button>
          <button type="button" onClick={onDelete} className="grid h-9 w-9 place-items-center rounded-xl border border-rose-200 bg-rose-50 text-rose-500">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[hsl(var(--mudrik-green))]/10 px-3 py-1 text-xs font-bold text-[hsl(var(--mudrik-green))]">
            {question.marks} درجات
          </span>
          <span className={cn("rounded-full px-3 py-1 text-xs font-bold", TYPE_PILL[question.type])}>
            {TYPE_LABEL[question.type]}
          </span>
          <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
            {question.index}
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2 text-xs text-slate-500">
        <span>درجة السؤال:</span>
        <Input
          type="number"
          min={1}
          max={100}
          value={question.marks}
          onChange={(e) => set({ marks: Math.max(1, Number(e.target.value) || 1) })}
          className="h-8 w-16 rounded-lg border-slate-200 text-center text-sm font-bold"
        />
      </div>

      <Textarea
        value={question.text}
        onChange={(e) => set({ text: e.target.value })}
        rows={2}
        placeholder="اكتب نص السؤال..."
        className="mt-3 min-h-[56px] resize-none rounded-xl border-slate-200 bg-white text-right text-base font-bold text-slate-900"
      />

      {isMCQ && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {question.options.map((opt, idx) => (
            <div
              key={opt.id}
              className={cn(
                "flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5 transition",
                opt.isCorrect ? "border-[hsl(var(--mudrik-green))] bg-[hsl(var(--mudrik-green))]/5 shadow-[0_0_0_2px_hsl(var(--mudrik-green)/0.1)]" : "border-slate-200"
              )}
            >
              <button
                type="button"
                onClick={() => updateOption(idx, { isCorrect: !opt.isCorrect })}
                className={cn(
                  "grid h-5 w-5 flex-none place-items-center rounded-full border-2",
                  opt.isCorrect ? "border-[hsl(var(--mudrik-green))] bg-[hsl(var(--mudrik-green))]" : "border-slate-300 bg-white"
                )}
              >
                {opt.isCorrect && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </button>
              <Input
                value={opt.text}
                onChange={(e) => updateOption(idx, { text: e.target.value })}
                placeholder={`الخيار ${idx + 1}`}
                className="h-8 flex-1 border-0 bg-transparent p-0 text-right text-sm font-bold text-slate-800 focus-visible:ring-0"
              />
            </div>
          ))}
        </div>
      )}

      {question.type === "fill_blank" && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <span className="text-xs font-bold text-slate-500">الإجابة الصحيحة</span>
          <Input
            value={question.modelAnswer || ""}
            onChange={(e) => set({ modelAnswer: e.target.value })}
            placeholder="اكتب الإجابة"
            className="h-9 max-w-[60%] rounded-lg border-slate-200 text-right text-sm font-bold"
          />
        </div>
      )}

      {(question.type === "essay" || question.type === "short_answer") && (
        <Textarea
          value={question.modelAnswer || ""}
          onChange={(e) => set({ modelAnswer: e.target.value })}
          rows={question.type === "essay" ? 3 : 2}
          placeholder="الإجابة النموذجية (اختياري)"
          className="mt-3 resize-none rounded-xl border-slate-200 bg-white text-right text-sm"
        />
      )}

      {isMCQ && correctOpt && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs font-bold text-[hsl(var(--mudrik-green))]">
          <span>الإجابة الصحيحة: {correctOpt.text}</span>
          <CheckCircle2 className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
