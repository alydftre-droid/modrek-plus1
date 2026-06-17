import { Clipboard, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Props {
  title?: string;
  questionsCount: number;
  totalMarks: number;
  durationMinutes: number;
  difficulty?: string;
  typesSummary?: string;
  antiCheat?: { label: string; ok?: boolean }[];
}

export default function ExamSummaryCard({
  title,
  questionsCount,
  totalMarks,
  durationMinutes,
  difficulty,
  typesSummary,
  antiCheat,
}: Props) {
  const rows = [
    title ? { k: "عنوان الامتحان", v: title } : null,
    { k: "عدد الأسئلة", v: `${questionsCount} سؤال` },
    { k: "إجمالي الدرجات", v: `${totalMarks} درجة` },
    { k: "المدة الكلية", v: `${Math.floor(durationMinutes / 60).toString().padStart(2, "0")}:${(durationMinutes % 60).toString().padStart(2, "0")} ساعة` },
    difficulty ? { k: "المستوى", v: difficulty } : null,
    typesSummary ? { k: "نوع الأسئلة", v: typesSummary } : null,
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <Card className="space-y-4 rounded-[22px] border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2">
        <Clipboard className="h-5 w-5 text-violet-600" />
        <h3 className="text-lg font-bold text-slate-900">ملخص الامتحان</h3>
      </div>

      <div className="space-y-3 text-sm">
        {rows.map((row) => (
          <div key={row.k} className="flex items-start justify-between gap-3">
            <span className="text-slate-500">{row.k}</span>
            <span className="text-right font-semibold text-slate-900">{row.v}</span>
          </div>
        ))}
      </div>

      {antiCheat && antiCheat.length > 0 && (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-violet-600" />
            <h4 className="font-semibold text-slate-900">مكافحة الغش</h4>
          </div>
          {antiCheat.map((item, index) => (
            <div key={index} className="flex items-center gap-2 text-xs text-slate-600">
              <span className={`h-1.5 w-1.5 rounded-full ${item.ok === false ? "bg-slate-300" : "bg-violet-500"}`} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
