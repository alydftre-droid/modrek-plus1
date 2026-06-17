import { useState } from "react";
import { GripVertical, Trash2, Copy, Pencil, Plus, Check } from "lucide-react";
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
  mcq: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  true_false: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  short_answer: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  essay: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  fill_blank: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
};

interface Props {
  question: EditorQuestion;
  total: number;
  onChange: (q: EditorQuestion) => void;
  onDelete: () => void;
  onDuplicate?: () => void;
}

export default function QuestionEditorCard({ question, total, onChange, onDelete, onDuplicate }: Props) {
  const [editing, setEditing] = useState(true);
  const q = question;
  const set = (patch: Partial<EditorQuestion>) => onChange({ ...q, ...patch });

  const updateOption = (idx: number, patch: Partial<EditorQuestion["options"][0]>) => {
    const opts = [...q.options];
    opts[idx] = { ...opts[idx], ...patch };
    if (patch.isCorrect && q.type !== "true_false") {
      opts.forEach((o, i) => { if (i !== idx) o.isCorrect = false; });
    }
    set({ options: opts });
  };

  const addOption = () =>
    set({ options: [...q.options, { id: crypto.randomUUID(), text: "", isCorrect: false }] });

  const removeOption = (idx: number) =>
    set({ options: q.options.filter((_, i) => i !== idx) });

  return (
    <Card className="p-4 md:p-5 space-y-4 group">
      <div className="flex items-start gap-3">
        <button className="cursor-grab text-muted-foreground mt-1.5" type="button">
          <GripVertical className="w-4 h-4" />
        </button>

        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-muted-foreground">السؤال {q.index}</span>
              <Badge className={cn("font-medium border-0", TYPE_COLOR[q.type])}>{TYPE_LABEL[q.type]}</Badge>
              <span className="text-xs text-muted-foreground">من {total}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setEditing((v) => !v)} className="h-8 w-8">
                <Pencil className="w-4 h-4" />
              </Button>
              {onDuplicate && (
                <Button variant="ghost" size="icon" onClick={onDuplicate} className="h-8 w-8">
                  <Copy className="w-4 h-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={onDelete} className="h-8 w-8 text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-[1fr_auto] gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">نص السؤال</label>
              <Textarea
                value={q.text}
                onChange={(e) => set({ text: e.target.value })}
                rows={2}
                placeholder="اكتب نص السؤال..."
                className="resize-none"
              />
            </div>
            <div className="flex gap-2 items-end">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الدرجة</label>
                <Input
                  type="number"
                  value={q.marks}
                  onChange={(e) => set({ marks: Number(e.target.value) || 0 })}
                  className="w-20"
                  min={1}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">النوع</label>
                <Select value={q.type} onValueChange={(v) => set({ type: v as EditorQType })}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {(q.type === "mcq" || q.type === "true_false") && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{q.type === "true_false" ? "حدد الإجابة الصحيحة" : "الخيارات"}</label>
              {q.options.map((o, i) => (
                <div
                  key={o.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
                    o.isCorrect && "border-violet-500 bg-violet-50/50 dark:bg-violet-500/10",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => updateOption(i, { isCorrect: !o.isCorrect })}
                    className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                      o.isCorrect ? "border-violet-500 bg-violet-500 text-white" : "border-muted-foreground/40",
                    )}
                  >
                    {o.isCorrect && <Check className="w-3 h-3" />}
                  </button>
                  <span className="text-sm font-bold text-muted-foreground w-6">{String.fromCharCode(0x0623 + i)})</span>
                  <Input
                    value={o.text}
                    onChange={(e) => updateOption(i, { text: e.target.value })}
                    className="flex-1 border-0 focus-visible:ring-0 px-1 bg-transparent"
                    placeholder={`الخيار ${i + 1}`}
                  />
                  {q.type === "mcq" && q.options.length > 2 && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeOption(i)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              {q.type === "mcq" && (
                <Button variant="ghost" size="sm" onClick={addOption} className="gap-1 text-primary">
                  <Plus className="w-4 h-4" /> إضافة خيار
                </Button>
              )}
            </div>
          )}

          {(q.type === "essay" || q.type === "short_answer" || q.type === "fill_blank") && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                {q.type === "essay" ? "الإجابة النموذجية / نقاط التقييم" : "الإجابة النموذجية"}
              </label>
              <Textarea
                value={q.modelAnswer || ""}
                onChange={(e) => set({ modelAnswer: e.target.value })}
                rows={q.type === "essay" ? 4 : 2}
                placeholder="اكتب الإجابة النموذجية..."
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
