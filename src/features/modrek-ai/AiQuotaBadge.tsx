import { Sparkles, Gauge } from "lucide-react";
import { formatCairo, type StudentAiQuota } from "@/hooks/useStudentAiQuota";

/** Compact quota indicator for the study + exams assistants only. */
export function AiQuotaBadge({ quota }: { quota: StudentAiQuota | null }) {
  if (!quota || quota.plan === "unknown" || quota.plan === "exempt") return null;

  if (quota.plan === "premium") {
    const until = formatCairo(quota.premiumUntil);
    return (
      <div className="flex flex-col items-start rounded-xl bg-primary/10 border border-primary/25 px-2.5 py-1">
        <span className="text-[11px] font-bold text-primary flex items-center gap-1">
          <Sparkles className="h-3.5 w-3.5" /> AI Premium ✨ استخدام غير محدود
        </span>
        {until && (
          <span className="text-[10px] text-muted-foreground">
            صالح حتى: {until.date} — {until.time}
          </span>
        )}
      </div>
    );
  }

  const reset = formatCairo(quota.resetAt);
  const exhausted = quota.remaining <= 0;
  return (
    <div
      className={`flex flex-col items-start rounded-xl px-2.5 py-1 border ${
        exhausted ? "bg-destructive/10 border-destructive/30" : "bg-muted border-border"
      }`}
    >
      <span className={`text-[11px] font-bold flex items-center gap-1 ${exhausted ? "text-destructive" : "text-foreground"}`}>
        <Gauge className="h-3.5 w-3.5" /> الاستخدام اليومي: {quota.used} / {quota.limit}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {exhausted
          ? reset
            ? `التجديد: ${reset.date} — ${reset.time}`
            : "انتهى الحد اليومي"
          : `متبقي لك اليوم: ${quota.remaining} استخدامات`}
      </span>
    </div>
  );
}
