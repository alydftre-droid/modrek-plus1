import { Bookmark, CheckCircle2, ListOrdered, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
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
  essay: "مقالية قصيرة",
  fill_blank: "ملء الفراغ",
  section: "قسم رئيسي",
};

interface Props {
  question: EditorQuestion;
  total: number;
  showAnswers?: boolean;
  onChange: (q: EditorQuestion) => void;
  onDelete: () => void;
  onDuplicate?: () => void;
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export default function QuestionEditorCard({ question, total, showAnswers = true, onChange, onDelete, onDuplicate }: Props) {
  void onDelete;
  void onDuplicate;
  const set = (patch: Partial<EditorQuestion>) => onChange({ ...question, ...patch });

  const updateOption = (idx: number, patch: Partial<EditorQuestion["options"][0]>) => {
    const next = [...question.options];
    next[idx] = { ...next[idx], ...patch };
    if (patch.isCorrect) {
      next.forEach((o, i) => { if (i !== idx) o.isCorrect = false; });
    }
    set({ options: next });
  };

  const correctOpt = question.options.find((o) => o.isCorrect);
  const correctIndex = question.options.findIndex((o) => o.isCorrect);
  const answerText = question.modelAnswer || correctOpt?.text || "";

  return (
    <Card className="question-review-card">
      <div className="question-review-shell">
        <div className="question-review-body">
          <div className="question-review-head">
            <span className={cn("question-type-chip", question.type)}>{TYPE_LABEL[question.type]}</span>
            <div className="question-count-box">
              <span>السؤال {question.index} من {total}</span>
              <span className="question-bookmark"><Bookmark className="h-4 w-4" /></span>
            </div>
          </div>

          <div className="question-marks-row">
            <label>درجة السؤال</label>
            <div className="question-marks-input-wrap">
              <Star className="h-4 w-4" />
              <Input
                type="number"
                min={1}
                max={100}
                value={question.marks}
                onChange={(e) => set({ marks: Math.max(1, Number(e.target.value) || 1) })}
                className="question-marks-input"
              />
            </div>
          </div>

          <Textarea
            value={question.text}
            onChange={(e) => set({ text: e.target.value })}
            rows={2}
            placeholder="اكتب نص السؤال..."
            className="question-textarea"
          />

          {(question.type === "mcq" || question.type === "true_false") && (
            <div className="question-options-list">
              {question.options.map((opt, idx) => {
                const letter = LETTERS[idx] || String(idx + 1);
                return (
                  <div
                    key={opt.id}
                    className={cn(
                      "question-option-row",
                      opt.isCorrect && "correct"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => updateOption(idx, { isCorrect: !opt.isCorrect })}
                      className={cn("question-radio", opt.isCorrect && "checked")}
                    >
                      {opt.isCorrect && <span />}
                    </button>
                    <Input
                      value={opt.text}
                      onChange={(e) => updateOption(idx, { text: e.target.value })}
                      placeholder={`الخيار ${letter}`}
                      className="question-option-input"
                    />
                    <span className={cn("question-letter", opt.isCorrect && "correct")}>{letter}</span>
                  </div>
                );
              })}
            </div>
          )}

          {showAnswers && (question.type === "mcq" || question.type === "true_false") && correctOpt && (
            <div className="question-answer-box">
              <div className="question-answer-label">
                <span>الإجابة الصحيحة</span>
                <b>{LETTERS[correctIndex] || correctIndex + 1}</b>
              </div>
              <p>{answerText}</p>
              <small>{answerText.length}/500</small>
            </div>
          )}

          {showAnswers && (question.type === "essay" || question.type === "short_answer" || question.type === "fill_blank") && (
            <div className="question-answer-box">
              <div className="question-answer-label essay"><CheckCircle2 className="h-3.5 w-3.5" /><span>الإجابة النموذجية</span></div>
              <Textarea
                value={question.modelAnswer || ""}
                onChange={(e) => set({ modelAnswer: e.target.value })}
                rows={question.type === "essay" ? 4 : 2}
                placeholder="اكتب الإجابة النموذجية..."
                className="question-answer-textarea"
              />
              <small>{(question.modelAnswer || "").length}/500</small>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
