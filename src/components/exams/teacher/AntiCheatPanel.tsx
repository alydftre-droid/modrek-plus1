import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface AntiCheatState {
  maxExits: number;
  preventCopy: boolean;
  preventTabSwitch: boolean;
  requireFullscreen: boolean;
  preventReload: boolean;
  randomSnapshots: boolean;
}

interface Props {
  value: AntiCheatState;
  onChange: (v: AntiCheatState) => void;
}

function ToggleRow({
  label,
  desc,
  checked,
  onClick,
  danger = false,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="space-y-1">
        <p className={cn("text-sm font-semibold text-slate-800", danger && "text-rose-600")}>{label}</p>
        <p className="text-xs leading-5 text-slate-500">{desc}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border transition-colors",
          checked ? (danger ? "border-rose-500 bg-rose-500" : "border-violet-500 bg-violet-500") : "border-slate-200 bg-slate-100"
        )}
      >
        <span
          className={cn(
            "absolute top-1 h-5 w-5 rounded-full bg-white transition-all",
            checked ? "right-6" : "right-1"
          )}
        />
      </button>
    </div>
  );
}

export default function AntiCheatPanel({ value, onChange }: Props) {
  const set = <K extends keyof AntiCheatState>(key: K, next: AntiCheatState[K]) => onChange({ ...value, [key]: next });

  return (
    <Card className="space-y-5 rounded-[22px] border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-violet-600" />
        <h3 className="text-lg font-bold text-slate-900">إعدادات مكافحة الغش</h3>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-800">الحد الأقصى للخروج من الامتحان</label>
        <Select value={String(value.maxExits)} onValueChange={(v) => set("maxExits", Number(v))}>
          <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white text-right">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">عدم السماح إطلاقاً</SelectItem>
            <SelectItem value="1">مرة واحدة</SelectItem>
            <SelectItem value="2">مرتان</SelectItem>
            <SelectItem value="3">3 مرات</SelectItem>
            <SelectItem value="5">5 مرات</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500">عند تجاوز الحد سيتم تسليم الامتحان تلقائياً</p>
      </div>

      <div className="space-y-1 divide-y divide-slate-100">
        <ToggleRow label="منع نسخ المحتوى" desc="منع نسخ النص من الأسئلة" checked={value.preventCopy} onClick={() => set("preventCopy", !value.preventCopy)} />
        <ToggleRow label="منع فتح تطبيقات أخرى" desc="منع فتح تطبيقات أو نوافذ أخرى أثناء الامتحان" checked={value.preventTabSwitch} onClick={() => set("preventTabSwitch", !value.preventTabSwitch)} />
        <ToggleRow label="منع تحميل الصفحة" desc="سيتم تسليم الامتحان عند محاولة تحميل الصفحة" checked={value.preventReload} onClick={() => set("preventReload", !value.preventReload)} />
        <ToggleRow label="التقاط صورة عشوائية للطالب" desc="يتم التقاط صورة للطالب بشكل عشوائي أثناء الامتحان" checked={value.randomSnapshots} onClick={() => set("randomSnapshots", !value.randomSnapshots)} />
        <ToggleRow label="تفعيل وضع ملء الشاشة أثناء الامتحان" desc="إجبار الطالب على البقاء في وضع ملء الشاشة" checked={value.requireFullscreen} onClick={() => set("requireFullscreen", !value.requireFullscreen)} />
        <ToggleRow label="حظر الطالب عند الغش" desc="يتم حظر الطالب من أداء أي امتحان آخر" checked={false} onClick={() => undefined} danger />
      </div>
    </Card>
  );
}
