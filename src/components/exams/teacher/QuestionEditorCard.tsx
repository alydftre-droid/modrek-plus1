import { Copy, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
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
  essay: "مقال (إجابة مطولة)",
  fill_blank: "ملء الفراغ",
};

const TYPE_COLOR: Record<EditorQType, string> = {
  mcq: "bg-violet-100 text-violet-700",
  true_false: "bg-emerald-100 text-emerald-700",
  short_answer: "bg-sky-100 text-sky-700",
  essay: "bg-amber-100 text-amber-700",
  fill_blank: "bg-pink-100 text-pink-700",
};

interface Props {
  question: EditorQuestion;
  total: number;
  onChange: (q: EditorQuestion) => void;
  onDelete: () => void;
  onDuplicate?: () => void;
}

export default function QuestionEditorCard({ question, total, onChange, onDelete, onDuplicate }: Props) {
  const set = (patch: Partial<EditorQuestion>) => onChange({ ...question, ...patch });

  const updateOption = (idx: number, patch: Partial<EditorQuestion["options"][0]>) => {
    const next = [...question.options];
    next[idx] = { ...next[idx], ...patch };

    if (patch.isCorrect) {
      next.forEach((option, optionIndex) => {
        if (optionIndex !== idx) option.isCorrect = false;
      });
    }

    set({ options: next });
  };

  const addOption = () => set({ options: [...question.options, { id: crypto.randomUUID(), text: "", isCorrect: false }] });
  const removeOption = (idx: number) => set({ options: question.options.filter((_, optionIndex) => optionIndex !== idx) });

  return (
    <Card className="rounded-[24px] border-slate-200 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.04)] md:p-5">
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-2 pt-2">
          <button type="button" className="text-slate-400">
            <GripVertical className="h-4 w-4" />
          </button>
          <Button variant="ghost" size="icon" onClick={onDelete} className="h-8 w-8 rounded-xl text-rose-500 hover:bg-rose-50 hover:text-rose-600">
            <Trash2 className="h-4 w-4" />
          </Button>
          {onDuplicate && (
            <Button variant="ghost" size="icon" onClick={onDuplicate} className="h-8 w-8 rounded-xl text-slate-500 hover:bg-slate-100">
              <Copy className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-slate-500 hover:bg-slate-100">
            <Pencil className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-slate-900">السؤال {question.index}</h3>
              <span className="text-sm text-slate-400">من {total}</span>
            </div>
            <Badge className={cn("rounded-full border-0 px-3 py-1 text-xs font-semibold", TYPE_COLOR[question.type])}>{TYPE_LABEL[question.type]}</Badge>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-600">نص السؤال</label>
            <Textarea
              value={question.text}
              onChange={(e) => set({ text: e.target.value })}
              rows={3}
              placeholder="اكتب نص السؤال..."
              className="min-h-[96px] rounded-2xl border-slate-200 bg-white text-right shadow-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 md:w-[360px]">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-600">النوع</label>
              <Select value={question.type} onValueChange={(value) => set({ type: value as EditorQType })}>
                <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABEL).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-600">الدرجة</label>
              <Input
                type="number"
                min={1}
                value={question.marks}
                onChange={(e) => set({ marks: Number(e.target.value) || 0 })}
                className="h-12 rounded-2xl border-slate-200 text-center text-lg font-semibold"
              />
            </div>
          </div>

          {(question.type === "mcq" || question.type === "true_false") && (
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-600">الخيارات</label>
              {question.options.map((option, index) => (
                <div key={option.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-3">
                  {question.type === "mcq" && question.options.length > 2 && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-slate-500 hover:bg-slate-100" onClick={() => removeOption(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}

                  <Input
                    value={option.text}
                    onChange={(e) => updateOption(index, { text: e.target.value })}
                    placeholder={`الخيار ${index + 1}`}
                    className="h-11 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                  />

                  <span className="text-lg font-semibold text-slate-500">({String.fromCharCode(0x0623 + index)})</span>

                  <button
                    type="button"
                    onClick={() => updateOption(index, { isCorrect: !option.isCorrect })}
                    className={cn(
                      "h-6 w-6 rounded-full border-2 transition-colors",
                      option.isCorrect ? "border-violet-500 bg-violet-500" : "border-slate-300 bg-white"
                    )}
                  />
                </div>
              ))}

              {question.type === "mcq" && (
                <button type="button" onClick={addOption} className="inline-flex items-center gap-2 text-sm font-semibold text-violet-600">
                  <Plus className="h-4 w-4" /> إضافة خيار
                </button>
              )}
            </div>
          )}

          {(question.type === "essay" || question.type === "short_answer" || question.type === "fill_blank") && (
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-600">الإجابة النموذجية</label>
              <Textarea
                value={question.modelAnswer || ""}
                onChange={(e) => set({ modelAnswer: e.target.value })}
                rows={question.type === "essay" ? 5 : 3}
                placeholder="اكتب الإجابة النموذجية..."
                className="rounded-2xl border-slate-200 bg-white"
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
