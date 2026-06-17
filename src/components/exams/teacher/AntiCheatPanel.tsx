import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

const ROW = "flex items-center justify-between gap-3 py-1";

export default function AntiCheatPanel({ value, onChange }: Props) {
  const set = <K extends keyof AntiCheatState>(k: K, v: AntiCheatState[K]) => onChange({ ...value, [k]: v });

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h3 className="font-bold">إعدادات مكافحة الغش</h3>
      </div>

      <div className="space-y-1">
        <Label className="text-sm">الحد الأقصى للخروج من الامتحان</Label>
        <Select value={String(value.maxExits)} onValueChange={(v) => set("maxExits", Number(v))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">عدم السماح إطلاقاً</SelectItem>
            <SelectItem value="1">مرة واحدة</SelectItem>
            <SelectItem value="2">مرتان</SelectItem>
            <SelectItem value="3">3 مرات</SelectItem>
            <SelectItem value="5">5 مرات</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">عند تجاوز الحد سيتم تسليم الامتحان تلقائياً</p>
      </div>

      <div className="space-y-3">
        {[
          { k: "preventCopy", label: "منع نسخ المحتوى", desc: "منع نسخ النص من الأسئلة" },
          { k: "preventTabSwitch", label: "منع فتح تطبيقات أخرى", desc: "منع فتح تطبيقات أو نوافذ أخرى أثناء الامتحان" },
          { k: "preventReload", label: "منع تحميل الصفحة", desc: "سيتم تسليم الامتحان عند محاولة تحميل الصفحة" },
          { k: "requireFullscreen", label: "إجبار وضع ملء الشاشة", desc: "تفعيل وضع ملء الشاشة أثناء الامتحان" },
          { k: "randomSnapshots", label: "التقاط صورة عشوائية للطالب", desc: "يتم التقاط صور للطالب بشكل عشوائي أثناء الامتحان" },
        ].map((it) => (
          <div key={it.k} className={ROW}>
            <div className="flex-1">
              <p className="font-medium text-sm">{it.label}</p>
              <p className="text-xs text-muted-foreground">{it.desc}</p>
            </div>
            <Switch
              checked={(value as any)[it.k]}
              onCheckedChange={(c) => set(it.k as keyof AntiCheatState, c as any)}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
