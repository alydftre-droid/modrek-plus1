import { CalendarDays } from "lucide-react";
import { WeeklyScheduleSlot, formatArabicTime, dayLabel, sortWeeklySchedule } from "@/lib/weeklySchedule";
import { cn } from "@/lib/utils";

interface Props {
  slots: WeeklyScheduleSlot[];
  variant?: "card" | "banner";
  className?: string;
}

const WeeklyScheduleDisplay = ({ slots, variant = "card", className }: Props) => {
  const sorted = sortWeeklySchedule(slots);
  if (sorted.length === 0) return null;

  if (variant === "banner") {
    return (
      <div className={cn("flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2", className)}>
        <span className="flex items-center gap-1.5 text-xs font-bold text-primary">
          <CalendarDays className="h-3.5 w-3.5" />
          مواعيد نزول الحصص
        </span>
        {sorted.map((slot, i) => (
          <span key={i} className="rounded-full bg-background px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm">
            {dayLabel(slot.day)} — {formatArabicTime(slot.time)}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border bg-accent/30 p-4", className)}>
      <h3 className="mb-1 flex items-center gap-2 text-sm font-bold">
        <CalendarDays className="h-4 w-4 text-primary" />
        📅 مواعيد نزول الحصص
      </h3>
      <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        تنزل الحصص أسبوعياً
      </p>
      <ul className="space-y-1.5">
        {sorted.map((slot, i) => (
          <li key={i} className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm">
            <span className="font-semibold">{dayLabel(slot.day)}</span>
            <span className="font-medium text-muted-foreground">{formatArabicTime(slot.time)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default WeeklyScheduleDisplay;
