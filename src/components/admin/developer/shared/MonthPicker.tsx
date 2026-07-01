import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  value: string; // YYYY-MM
  onChange: (v: string) => void;
  minMonth?: string;
}
const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
function shift(v: string, delta: number) {
  const [y, m] = v.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function label(v: string) {
  const [y, m] = v.split("-").map(Number);
  return `${AR_MONTHS[m - 1]} ${y}`;
}
export function MonthPicker({ value, onChange, minMonth }: Props) {
  const current = new Date();
  const currentKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
  const isCurrent = value >= currentKey;
  return (
    <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(shift(value, -1))} disabled={minMonth ? shift(value, -1) < minMonth : false}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      <div className="px-3 min-w-[140px] text-center text-sm font-semibold text-slate-800 inline-flex items-center justify-center gap-2">
        <Calendar className="h-3.5 w-3.5 text-emerald-600" /> {label(value)}
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(shift(value, 1))} disabled={isCurrent}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
    </div>
  );
}
