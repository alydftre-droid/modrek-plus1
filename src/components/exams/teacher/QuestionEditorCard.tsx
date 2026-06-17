import { Bookmark, Copy, GripVertical, Pencil, Trash2, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type EditorQType = "mcq" | "true_false" | "short_answer" | "essay" | "fill_blank";

export interface EditorQuestion {
  id: string;
  index: number;
  type: EditorQType;
  text: string;
  marks: number;
  modelAnswer?: string;
  options: { id: string; text: string; isCorrect: boolean }[];
}

const TYPE_LABEL: Record<EditorQType, string> = {
  mcq: "اختيار من متعدد",
  true_false: "صح / خطأ",
  short_answer: "إجابة قصيرة",
  essay: "مقالية قصيرة",
  fill_blank: "ملء الفراغ",
};

const TYPE_BADGE: Record<EditorQType, string> = {
  mcq: "bg-violet-100 text-violet-700",
  true_false: "bg-emerald-100 text-emerald-700",
  short_answer: "bg-sky-100 text-sky-700",
  essay: "bg-rose-100 text-rose-700",
  fill_blank: "bg-fuchsia-100 text-fuchsia-700",
};

interface Props {
  question: EditorQuestion;
  total: number;
  onChange: (q: EditorQuestion) => void;
  onDelete: () => void;
  onDuplicate?: () => void;
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export default function QuestionEditorCard({ question, total, onChange, onDelete, onDuplicate }: Props) {
  const set = (patch: Partial<EditorQuestion>) => onChange({ ...question, ...patch });

  const updateOption = (idx: number, patch: Partial<EditorQuestion["options"][0]>) => {
    const next = [...question.options];
    next[idx] = { ...next[idx], ...patch };
    if (patch.isCorrect) {
      next.forEach((o, i) => { if (i !== idx) o.isCorrect = false; });
    }
    set({ options: next });
  };

  const addOption = () => set({ options: [...question.options, { id: crypto.randomUUID(), text: "", isCorrect: false }] });
  const removeOption = (idx: number) => set({ options: question.options.filter((_, i) => i !== idx) });

  const correctOpt = question.options.find((o) => o.isCorrect);
  const correctIndex = question.options.findIndex((o) => o.isCorrect);
  const answerText = question.modelAnswer || correctOpt?.text || "";

  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white p-0 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="flex">
        {/* Side toolbar (left in RTL) */}
        <div className="flex w-12 flex-col items-center gap-1.5 border-l border-slate-100 bg-slate-50/50 py-3">
          <GripVertical className="h-3.5 w-3.5 text-slate-400" />
          <Button variant="ghost" size="sm" className="h-auto flex-col gap-0.5 rounded-lg px-1.5 py-1 text-[10px] text-slate-600 hover:bg-violet-50 hover:text-violet-700">
            <Pencil className="h-3 w-3" /> تعديل
          </Button>
          {onDuplicate && (
            <Button variant="ghost" size="sm" onClick={onDuplicate} className="h-auto flex-col gap-0.5 rounded-lg px-1.5 py-1 text-[10px] text-slate-600 hover:bg-violet-50 hover:text-violet-700">
              <Copy className="h-3 w-3" /> نسخ
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onDelete} className="h-auto flex-col gap-0.5 rounded-lg px-1.5 py-1 text-[10px] text-rose-500 hover:bg-rose-50 hover:text-rose-600">
            <Trash2 className="h-3 w-3" /> حذف
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 p-3 md:p-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <Badge className={cn("rounded-full border-0 px-2.5 py-0.5 text-[10px] font-semibold", TYPE_BADGE[question.type])}>
              {TYPE_LABEL[question.type]}
            </Badge>
            <div className="flex items-center gap-1.5">
              <Bookmark className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs text-slate-500">السؤال {question.index} من {total}</span>
            </div>
          </div>

          {/* Question text */}
          <Textarea
            value={question.text}
            onChange={(e) => set({ text: e.target.value })}
            rows={2}
            placeholder="اكتب نص السؤال..."
            className="min-h-[60px] resize-none rounded-xl border-slate-200 bg-white text-right text-sm font-semibold text-slate-800 shadow-none focus-visible:ring-violet-200"
          />

          {/* Type + Marks – compact, mobile-friendly */}
          <div className="grid grid-cols-2 gap-2">
            <Select value={question.type} onValueChange={(v) => set({ type: v as EditorQType })}>
              <SelectTrigger className="h-9 rounded-xl border-slate-200 bg-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABEL).map(([k, l]) => (
                  <SelectItem key={k} value={k} className="text-xs">{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={1}
              value={question.marks}
              onChange={(e) => set({ marks: Number(e.target.value) || 0 })}
              className="h-9 rounded-xl border-slate-200 text-center text-xs font-semibold"
              placeholder="الدرجة"
            />
          </div>

          {/* Options */}
          {(question.type === "mcq" || question.type === "true_false") && (
            <div className="space-y-1.5">
              {question.options.map((opt, idx) => {
                const letter = LETTERS[idx] || String(idx + 1);
                return (
                  <div
                    key={opt.id}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors",
                      opt.isCorrect
                        ? "border-emerald-400 bg-emerald-50/60"
                        : "border-slate-200 bg-white hover:border-violet-200"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => updateOption(idx, { isCorrect: !opt.isCorrect })}
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                        opt.isCorrect ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-white"
                      )}
                    >
                      {opt.isCorrect && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </button>
                    <Input
                      value={opt.text}
                      onChange={(e) => updateOption(idx, { text: e.target.value })}
                      placeholder={`الخيار ${letter}`}
                      className="h-7 flex-1 border-0 bg-transparent px-0 text-right text-sm shadow-none focus-visible:ring-0"
                    />
                    <span className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                      opt.isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    )}>{letter}</span>
                    {question.type === "mcq" && question.options.length > 2 && (
                      <button type="button" onClick={() => removeOption(idx)} className="text-slate-400 hover:text-rose-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              {question.type === "mcq" && (
                <button type="button" onClick={addOption} className="inline-flex items-center gap-1 px-1 text-xs font-semibold text-violet-600 hover:text-violet-700">
                  <Plus className="h-3.5 w-3.5" /> إضافة خيار
                </button>
              )}
            </div>
          )}

          {/* Correct answer / model answer */}
          {(question.type === "mcq" || question.type === "true_false") && correctOpt && (
            <div className="space-y-1.5 rounded-xl bg-slate-50/70 p-2.5">
              <div className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">
                  {correctIndex + 1}
                </span>
                <span className="text-[11px] font-semibold text-slate-600">الإجابة الصحيحة</span>
              </div>
              <p className="text-xs text-slate-700">{answerText}</p>
              <p className="text-[10px] text-slate-400 text-left">{answerText.length}/500</p>
            </div>
          )}

          {(question.type === "essay" || question.type === "short_answer" || question.type === "fill_blank") && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                <label className="text-[11px] font-semibold text-slate-600">الإجابة النموذجية</label>
              </div>
              <Textarea
                value={question.modelAnswer || ""}
                onChange={(e) => set({ modelAnswer: e.target.value })}
                rows={question.type === "essay" ? 4 : 2}
                placeholder="اكتب الإجابة النموذجية..."
                className="rounded-xl border-slate-200 bg-white text-sm shadow-none focus-visible:ring-violet-200"
              />
              <p className="text-[10px] text-slate-400 text-left">{(question.modelAnswer || "").length}/500</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
