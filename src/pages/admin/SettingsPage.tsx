import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, Globe, CalendarRange, ChevronLeft, Library, Wallet, Sparkles, MessageCircle, ClipboardList, ShieldAlert, FlaskConical, Building2 } from "lucide-react";
import PlatformInfoSettings from "@/components/admin/settings/PlatformInfoSettings";
import TermManagement from "@/components/admin/settings/TermManagement";
import WithdrawalSettings from "@/components/admin/settings/WithdrawalSettings";
import AiSettingsPage from "@/pages/admin/AiSettingsPage";
import SupportChannelsSettings from "@/components/admin/settings/SupportChannelsSettings";
import SupportLogsPage from "@/pages/admin/SupportLogsPage";
import DeletionAuditPage from "@/pages/admin/DeletionAuditPage";
import DemoAccountsPage from "@/pages/admin/DemoAccountsPage";
import { useIsDemoAccount } from "@/hooks/useIsDemoAccount";

type SettingsSection = "menu" | "info" | "terms" | "withdrawal" | "ai" | "support" | "support-logs" | "audit" | "demo";

const sections = [
  { id: "info" as const, label: "معلومات المنصة", icon: Globe, desc: "البيانات العامة، الصيانة، التواصل، الأمان", color: "text-blue-600 bg-blue-100" },
  { id: "support" as const, label: "الدعم الفني", icon: MessageCircle, desc: "إدارة واتساب وMessenger والمساعد الذكي وقالب الرسالة", color: "text-emerald-600 bg-emerald-100" },
  { id: "support-logs" as const, label: "سجل التواصل مع الدعم", icon: ClipboardList, desc: "أكثر وسائل التواصل استخداماً من المستخدمين", color: "text-amber-600 bg-amber-100" },
  { id: "withdrawal" as const, label: "إعدادات السحب", icon: Wallet, desc: "موعد فتح السحب وإيقافه المؤقت", color: "text-emerald-600 bg-emerald-100" },
  { id: "terms" as const, label: "تبديل الترم", icon: CalendarRange, desc: "إدارة الترم الدراسي لكل مرحلة وصف", color: "text-purple-600 bg-purple-100" },
  { id: "ai" as const, label: "إعدادات الذكاء الاصطناعي", icon: Sparkles, desc: "تحكم في الموديلات وحدود المحاولات والـ Streaming", color: "text-pink-600 bg-pink-100" },
  { id: "demo" as const, label: "حسابات الديمو", icon: FlaskConical, desc: "إنشاء وإدارة حسابات ديمو (مطور/معلم/طالب) معزولة عن الإنتاج", color: "text-cyan-600 bg-cyan-100" },
  { id: "audit" as const, label: "سجل عمليات الحذف", icon: ShieldAlert, desc: "كل عمليات حذف المحتوى والمعلمين مع حالة Bunny", color: "text-rose-600 bg-rose-100" },
];



const SettingsPage = () => {
  const [activeSection, setActiveSection] = useState<SettingsSection>("menu");
  const navigate = useNavigate();
  const { isDemo } = useIsDemoAccount();

  // Preview accounts never reach the platform information screen (it exposes
  // administrator contact details and service keys) — neither through the menu
  // nor by opening it directly.
  const visibleSections = sections.filter((section) => !(isDemo && section.id === "info"));
  const blockedForDemo = isDemo && activeSection === "info";

  if (blockedForDemo) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setActiveSection("menu")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          رجوع للإعدادات
        </button>
        <div className="rounded-xl border bg-card p-6 text-center space-y-2">
          <ShieldAlert className="h-8 w-8 mx-auto text-rose-500" />
          <p className="font-semibold">هذه الصفحة غير متاحة لحسابات المعاينة</p>
        </div>
      </div>
    );
  }

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
        {activeSection === "support" && <SupportChannelsSettings />}
        {activeSection === "support-logs" && <SupportLogsPage />}
        {activeSection === "withdrawal" && <WithdrawalSettings />}
        {activeSection === "terms" && <TermManagement />}
        {activeSection === "ai" && <AiSettingsPage />}
        {activeSection === "audit" && <DeletionAuditPage />}
        {activeSection === "demo" && <DemoAccountsPage />}

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

        <button
          onClick={() => navigate("/admin/platforms")}
          className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-accent/50 transition-colors text-right w-full"
        >
          <div className="p-3 rounded-xl text-indigo-600 bg-indigo-100">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">منصات المعلمين</p>
            <p className="text-xs text-muted-foreground">إنشاء منصة خاصة لمعلم واحد، تعديل الهوية، تفعيل/تعطيل الرابط</p>
          </div>
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>

        <button
          onClick={() => navigate("/admin/modrek-library")}
          className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-accent/50 transition-colors text-right w-full"
        >
          <div className="p-3 rounded-xl text-teal-600 bg-teal-100">
            <Library className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">مكتبة Modrek AI</p>
            <p className="text-xs text-muted-foreground">قاعدة المعرفة الموحّدة (كتب، ملازم، امتحانات، صور، مستندات) للمساعد الذكي</p>
          </div>
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
