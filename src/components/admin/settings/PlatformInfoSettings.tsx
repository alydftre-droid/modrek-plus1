import { useState } from "react";
import { ChevronLeft, Info, Wrench, Phone, ShieldCheck } from "lucide-react";
import PlatformGeneralSettings from "./PlatformGeneralSettings";
import MaintenanceSettings from "./MaintenanceSettings";
import PlatformSupportSettings from "./PlatformSupportSettings";
import AdminSecuritySettings from "./AdminSecuritySettings";

type Sub = "menu" | "general" | "maintenance" | "support" | "security";

const items = [
  { id: "general" as const, label: "معلومات عامة", desc: "اسم المنصة، شريط الحركة، فيديو الإيداع", icon: Info, color: "text-blue-600 bg-blue-100" },
  { id: "maintenance" as const, label: "وضع الصيانة", desc: "إيقاف المنصة مؤقتاً وتحديد أوقات التشغيل", icon: Wrench, color: "text-orange-600 bg-orange-100" },
  { id: "support" as const, label: "معلومات التواصل والدعم", desc: "إيميل، واتساب، تيليجرام", icon: Phone, color: "text-green-600 bg-green-100" },
  { id: "security" as const, label: "أمان حساب المطور", desc: "تغيير البريد وكلمة المرور بحماية قوية", icon: ShieldCheck, color: "text-rose-600 bg-rose-100" },
];

const PlatformInfoSettings = () => {
  const [sub, setSub] = useState<Sub>("menu");

  if (sub !== "menu") {
    const current = items.find(i => i.id === sub);
    return (
      <div className="space-y-4">
        <button onClick={() => setSub("menu")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> رجوع لمعلومات المنصة
        </button>
        <h3 className="text-base font-bold flex items-center gap-2">
          {current && <current.icon className="h-5 w-5" />} {current?.label}
        </h3>
        {sub === "general" && <PlatformGeneralSettings />}
        {sub === "maintenance" && <MaintenanceSettings />}
        {sub === "support" && <PlatformSupportSettings />}
        {sub === "security" && <AdminSecuritySettings />}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => setSub(item.id)}
          className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-accent/50 transition-colors text-right w-full"
        >
          <div className={`p-3 rounded-xl ${item.color}`}>
            <item.icon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">{item.label}</p>
            <p className="text-xs text-muted-foreground">{item.desc}</p>
          </div>
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
};

export default PlatformInfoSettings;
