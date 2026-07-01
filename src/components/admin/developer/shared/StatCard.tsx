import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  accent?: "blue" | "green" | "purple" | "amber" | "red" | "slate";
  hint?: string;
  onClick?: () => void;
}

const ACCENTS: Record<NonNullable<StatCardProps["accent"]>, { bg: string; fg: string; ring: string }> = {
  blue:   { bg: "bg-blue-50",    fg: "text-blue-600",    ring: "ring-blue-100" },
  green:  { bg: "bg-emerald-50", fg: "text-emerald-600", ring: "ring-emerald-100" },
  purple: { bg: "bg-violet-50",  fg: "text-violet-600",  ring: "ring-violet-100" },
  amber:  { bg: "bg-amber-50",   fg: "text-amber-600",   ring: "ring-amber-100" },
  red:    { bg: "bg-rose-50",    fg: "text-rose-600",    ring: "ring-rose-100" },
  slate:  { bg: "bg-slate-50",   fg: "text-slate-600",   ring: "ring-slate-100" },
};

export function StatCard({ label, value, icon: Icon, accent = "blue", hint, onClick }: StatCardProps) {
  const a = ACCENTS[accent];
  const Wrapper: any = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`text-right w-full bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
          {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
        </div>
        {Icon && (
          <div className={`shrink-0 h-10 w-10 rounded-xl ${a.bg} ${a.fg} ring-1 ${a.ring} flex items-center justify-center`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </Wrapper>
  );
}
