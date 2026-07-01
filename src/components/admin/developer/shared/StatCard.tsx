import { ReactNode } from "react";
import { LucideIcon, TrendingDown, TrendingUp } from "lucide-react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  accent?: "emerald" | "blue" | "violet" | "amber" | "rose" | "slate" | "green" | "purple" | "red";
  hint?: string;
  trend?: { value: number; label?: string };
  onClick?: () => void;
}

const ACCENTS: Record<NonNullable<StatCardProps["accent"]>, { bg: string; fg: string }> = {
  emerald: { bg: "bg-emerald-50", fg: "text-emerald-600" },
  blue:    { bg: "bg-blue-50",    fg: "text-blue-600"    },
  violet:  { bg: "bg-violet-50",  fg: "text-violet-600"  },
  amber:   { bg: "bg-amber-50",   fg: "text-amber-600"   },
  rose:    { bg: "bg-rose-50",    fg: "text-rose-600"    },
  slate:   { bg: "bg-slate-50",   fg: "text-slate-600"   },
};

export function StatCard({ label, value, icon: Icon, accent = "emerald", hint, trend, onClick }: StatCardProps) {
  const a = ACCENTS[accent];
  const Wrapper: any = onClick ? "button" : "div";
  const trendUp = (trend?.value ?? 0) >= 0;
  return (
    <Wrapper
      onClick={onClick}
      className={`text-right w-full bg-white rounded-2xl border border-slate-200 p-4 transition ${
        onClick ? "cursor-pointer hover:shadow-md hover:border-emerald-200" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500 truncate">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums leading-tight">{value}</p>
          {trend && (
            <div className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold ${trendUp ? "text-emerald-600" : "text-rose-600"}`}>
              {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              <span>{Math.abs(trend.value)}%</span>
              {trend.label && <span className="text-slate-400 font-normal">{trend.label}</span>}
            </div>
          )}
          {hint && !trend && <p className="text-[10px] text-slate-400 mt-1.5">{hint}</p>}
        </div>
        {Icon && (
          <div className={`shrink-0 h-10 w-10 rounded-xl ${a.bg} ${a.fg} flex items-center justify-center`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </Wrapper>
  );
}
