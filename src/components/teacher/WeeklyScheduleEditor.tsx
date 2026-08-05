import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Clock, Plus, Trash2 } from "lucide-react";
import {
  WEEK_DAYS,
  WeeklyScheduleSlot,
  formatArabicTime,
  joinTime,
  splitTime,
} from "@/lib/weeklySchedule";

const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MAX_SLOTS = 7;

const DEFAULT_SLOT: WeeklyScheduleSlot = { day: "Saturday", time: "19:00" };

interface Props {
  value: WeeklyScheduleSlot[];
  onChange: (slots: WeeklyScheduleSlot[]) => void;
}

const WeeklyScheduleEditor = ({ value, onChange }: Props) => {
  const setCount = (count: number) => {
    const next = [...value];
    if (count > next.length) {
      while (next.length < count) {
        const dayIndex = next.length % WEEK_DAYS.length;
        next.push({ day: WEEK_DAYS[dayIndex].key, time: DEFAULT_SLOT.time });
      }
    } else {
      next.length = count;
    }
    onChange(next);
  };

  const updateSlot = (index: number, patch: Partial<WeeklyScheduleSlot>) => {
    onChange(value.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  };

  const removeSlot = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="rounded-xl border border-border bg-accent/30 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          📅 جدول نزول الحصص الأسبوعي
        </h4>
        <span className="text-[11px] text-muted-foreground">اختياري</span>
      </div>

      <div>
        <Label className="text-xs">عدد الحصص في الأسبوع</Label>
        <Select value={String(value.length)} onValueChange={(v) => setCount(Number(v))}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="اختر عدد الحصص" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">بدون مواعيد</SelectItem>
            {Array.from({ length: MAX_SLOTS }, (_, i) => i + 1).map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n === 1 ? "حصة واحدة" : n === 2 ? "حصتان" : `${n} حصص`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.map((slot, index) => {
        const { hour12, minute, period } = splitTime(slot.time);
        return (
          <div key={index} className="rounded-lg border border-border bg-background p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-primary">الحصة {index + 1}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatArabicTime(slot.time)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => removeSlot(index)}
                  aria-label="حذف الموعد"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px]">اليوم</Label>
                <Select value={slot.day} onValueChange={(day) => updateSlot(index, { day })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEK_DAYS.map((d) => (
                      <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">الفترة</Label>
                <Select
                  value={period}
                  onValueChange={(p) => updateSlot(index, { time: joinTime(hour12, minute, p as "am" | "pm") })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="am">صباحاً</SelectItem>
                    <SelectItem value="pm">مساءً</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">الساعة</Label>
                <Select
                  value={String(hour12)}
                  onValueChange={(h) => updateSlot(index, { time: joinTime(Number(h), minute, period) })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HOURS.map((h) => (
                      <SelectItem key={h} value={String(h)}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">الدقيقة</Label>
                <Select
                  value={minute}
                  onValueChange={(m) => updateSlot(index, { time: joinTime(hour12, m, period) })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MINUTES.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );
      })}

      {value.length < MAX_SLOTS && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-1"
          onClick={() => onChange([...value, { ...DEFAULT_SLOT, day: WEEK_DAYS[value.length % WEEK_DAYS.length].key }])}
        >
          <Plus className="h-4 w-4" />
          إضافة موعد
        </Button>
      )}
    </div>
  );
};

export default WeeklyScheduleEditor;
