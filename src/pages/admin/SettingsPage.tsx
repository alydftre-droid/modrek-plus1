import { useState } from "react";
import { Settings, Globe, CalendarRange, ChevronLeft, BookOpen, Wallet, Sparkles } from "lucide-react";
import PlatformInfoSettings from "@/components/admin/settings/PlatformInfoSettings";
import TermManagement from "@/components/admin/settings/TermManagement";
import CurriculumBooksSettings from "@/components/admin/settings/CurriculumBooksSettings";
import WithdrawalSettings from "@/components/admin/settings/WithdrawalSettings";
import AiSettingsPage from "@/pages/admin/AiSettingsPage";

type SettingsSection = "menu" | "info" | "terms" | "curriculum" | "withdrawal" | "ai";

const sections = [
  { id: "info" as const, label: "معلومات المنصة", icon: Globe, desc: "البيانات العامة، الصيانة، التواصل، الأمان", color: "text-blue-600 bg-blue-100" },
  { id: "withdrawal" as const, label: "إعدادات السحب", icon: Wallet, desc: "موعد فتح السحب وإيقافه المؤقت", color: "text-emerald-600 bg-emerald-100" },
  { id: "terms" as const, label: "تبديل الترم", icon: CalendarRange, desc: "إدارة الترم الدراسي لكل مرحلة وصف", color: "text-purple-600 bg-purple-100" },
  { id: "curriculum" as const, label: "كتب المنهج الأزهري", icon: BookOpen, desc: "رفع كتب المنهج ليقرأها المساعد الذكي", color: "text-teal-600 bg-teal-100" },
  { id: "ai" as const, label: "إعدادات الذكاء الاصطناعي", icon: Sparkles, desc: "تحكم في الموديلات وحدود المحاولات والـ Streaming", color: "text-pink-600 bg-pink-100" },
];

const SettingsPage = () => {
  const [activeSection, setActiveSection] = useState<SettingsSection>("menu");

  if (activeSection !== "menu") {
    const current = sections.find(s => s.id === activeSection);
    return (
      <div className="space-y-4">
        <button
          onClick={() => setActiveSection("menu")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          رجوع للإعدادات
        </button>
        <h2 className="text-xl font-bold flex items-center gap-2">
          {current && <current.icon className="h-5 w-5" />}
          {current?.label}
        </h2>
        {activeSection === "info" && <PlatformInfoSettings />}
        {activeSection === "support" && <PlatformSupportSettings />}
        {activeSection === "withdrawal" && <WithdrawalSettings />}
        {activeSection === "maintenance" && <MaintenanceSettings />}
        {activeSection === "terms" && <TermManagement />}
        {activeSection === "curriculum" && <CurriculumBooksSettings />}
        {activeSection === "ai" && <AiSettingsPage />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <Settings className="h-6 w-6" />
        الإعدادات
      </h2>
      <div className="grid gap-3">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-accent/50 transition-colors text-right w-full"
          >
            <div className={`p-3 rounded-xl ${section.color}`}>
              <section.icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">{section.label}</p>
              <p className="text-xs text-muted-foreground">{section.desc}</p>
            </div>
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default SettingsPage;
