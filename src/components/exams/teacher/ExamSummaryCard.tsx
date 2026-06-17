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
    title ? { k: "العنوان", v: title } : null,
    { k: "عدد الأسئلة", v: `${questionsCount} سؤال` },
    { k: "الدرجة الكلية", v: `${totalMarks} درجة` },
    { k: "المدة", v: `${Math.floor(durationMinutes / 60).toString().padStart(2, "0")}:${(durationMinutes % 60).toString().padStart(2, "0")} ساعة` },
    difficulty ? { k: "المستوى", v: difficulty } : null,
    typesSummary ? { k: "نوع الأسئلة", v: typesSummary } : null,
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Clipboard className="w-5 h-5 text-primary" />
        <h3 className="font-bold">ملخص الامتحان</h3>
      </div>
      <div className="space-y-3 text-sm">
        {rows.map((r) => (
          <div key={r.k} className="flex justify-between gap-3">
            <span className="text-muted-foreground">{r.k}</span>
            <span className="font-medium text-end">{r.v}</span>
          </div>
        ))}
      </div>
      {antiCheat && antiCheat.length > 0 && (
        <div className="pt-4 border-t space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h4 className="font-semibold text-sm">مكافحة الغش</h4>
          </div>
          {antiCheat.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={a.ok === false ? "w-1.5 h-1.5 bg-muted rounded-full" : "w-1.5 h-1.5 bg-emerald-500 rounded-full"} />
              <span>{a.label}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
