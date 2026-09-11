import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Banknote,
  Bell,
  Bot,
  ChevronLeft,
  CircleAlert,
  CreditCard,
  FileSearch,
  GraduationCap,
  HeartPulse,
  Search,
  Settings2,
  SlidersHorizontal,
  Trophy,
  UserRoundCheck,
  UserRoundX,
  Users,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { OverviewTab, PaymentsTab, HealthTab, ErrorsTab } from "./OverviewSections";
import { AiUsageTab, ActiveStudentsTab, TopExamsTab, InactiveStudentsTab, AnomaliesTab } from "./StudentSections";
import { SubscriptionsTab, WalletsTab, TeacherActivityTab, AlertsTab, StudentLookupTab } from "./MoneySections";
import { SectionState, useMonitoringRpc } from "./shared";

export type MonitoringReportKey =
  | "summary" | "ai" | "active" | "exams" | "subscriptions" | "wallets"
  | "alerts" | "payments" | "teachers" | "inactive" | "anomalies"
  | "health" | "errors" | "lookup" | "settings";

interface ReportDefinition {
  key: MonitoringReportKey;
  label: string;
  description: string;
  group: "students" | "learning" | "money" | "operations";
  icon: LucideIcon;
}

const GROUPS = [
  { key: "students", label: "الطلاب والنشاط", icon: Users },
  { key: "learning", label: "التعليم والذكاء الاصطناعي", icon: Bot },
  { key: "money", label: "المال والاشتراكات", icon: Banknote },
  { key: "operations", label: "التشغيل والأمان", icon: Settings2 },
] as const;

const REPORTS: ReportDefinition[] = [
  { key: "summary", label: "الملخص العام", description: "كل مؤشرات المنصة للفترة", group: "students", icon: Activity },
  { key: "active", label: "الطلاب الأكثر نشاطًا", description: "ترتيب النشاط والتفاعل", group: "students", icon: UserRoundCheck },
  { key: "inactive", label: "الطلاب غير النشطين", description: "متابعة الانقطاع والغياب", group: "students", icon: UserRoundX },
  { key: "lookup", label: "البحث الموحّد", description: "ملف الطالب الكامل", group: "students", icon: Search },
  { key: "ai", label: "استخدام AI", description: "الاستخدام والخطط والطلاب", group: "learning", icon: Bot },
  { key: "exams", label: "نتائج الامتحانات", description: "أفضل الطلاب والمحاولات", group: "learning", icon: Trophy },
  { key: "anomalies", label: "الاستخدام غير الطبيعي", description: "رصد الاندفاعات والسلوك الشاذ", group: "learning", icon: AlertTriangle },
  { key: "subscriptions", label: "الاشتراكات", description: "النشطة والجديدة والمنتهية", group: "money", icon: CreditCard },
  { key: "wallets", label: "محافظ الطلاب", description: "الأرصدة وآخر الحركات", group: "money", icon: Wallet },
  { key: "payments", label: "المدفوعات", description: "الإيداعات والعمليات المؤكدة", group: "money", icon: Banknote },
  { key: "teachers", label: "أداء المعلمين", description: "المجموعات والطلاب والنشاط", group: "operations", icon: GraduationCap },
  { key: "alerts", label: "مركز التنبيهات", description: "التنبيهات المباشرة وغير المقروءة", group: "operations", icon: Bell },
  { key: "health", label: "صحة المنصة", description: "حالة الخدمات الأساسية", group: "operations", icon: HeartPulse },
  { key: "errors", label: "أخطاء النظام", description: "الأخطاء المتكررة ومصادرها", group: "operations", icon: CircleAlert },
  { key: "settings", label: "حدود التنبيه", description: "ضبط قواعد اكتشاف الحالات", group: "operations", icon: SlidersHorizontal },
];

function ThresholdSettings() {
  const { data, loading, error, reload } = useMonitoringRpc<Record<string, number>>("admin_monitoring_thresholds", {});
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, number> | null>(null);
  const values = draft ?? data ?? {};

  const fields = [
    ["ai_multiplier", "مضاعف متوسط استخدام AI"],
    ["ai_min_requests", "الحد الأدنى لطلبات AI"],
    ["burst_requests", "طلبات الاندفاع"],
    ["burst_minutes", "نافذة الاندفاع بالدقائق"],
    ["exam_attempts_per_hour", "محاولات الامتحان في الساعة"],
  ] as const;

  const save = async () => {
    setSaving(true);
    const { error: saveError } = await supabase.rpc("admin_monitoring_set_thresholds" as never, { _thresholds: values } as never);
    setSaving(false);
    if (saveError) toast.error("تعذر حفظ حدود التنبيه");
    else { toast.success("تم حفظ حدود التنبيه"); setDraft(null); void reload(); }
  };

  return (
    <SectionState loading={loading} error={error} onRetry={reload}>
      <Card className="monitoring-settings-panel">
        <div className="monitoring-panel__header"><div><p className="monitoring-eyebrow">إعدادات التشغيل</p><h3>حدود اكتشاف الاستخدام غير الطبيعي</h3></div></div>
        <p className="monitoring-settings-note">تغيّر هذه القيم التنبيهات فقط، ولا تحظر الطلاب أو تغيّر حدود استخدامهم.</p>
        <div className="monitoring-settings-grid">
          {fields.map(([key, label]) => (
            <label key={key}><span>{label}</span><Input type="number" min={1} value={values[key] ?? 0} onChange={(event) => setDraft({ ...values, [key]: Math.max(1, Number(event.target.value) || 1) })} /></label>
          ))}
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ الإعدادات"}</Button>
      </Card>
    </SectionState>
  );
}

interface MonitoringReportsHubProps {
  from: string | null;
  to: string | null;
  refreshKey: number;
  initialReport?: MonitoringReportKey;
  lookupQuery?: string;
  onReportChange?: (report: MonitoringReportKey) => void;
  onAlertsChanged: () => void;
}

export function MonitoringReportsHub({ from, to, refreshKey, initialReport = "summary", lookupQuery = "", onReportChange, onAlertsChanged }: MonitoringReportsHubProps) {
  const [report, setReport] = useState<MonitoringReportKey>(initialReport);
  const [filter, setFilter] = useState("");
  const selected = REPORTS.find((item) => item.key === report) ?? REPORTS[0];
  const visibleGroups = useMemo(() => GROUPS.map((group) => ({
    ...group,
    reports: REPORTS.filter((item) => item.group === group.key && `${item.label} ${item.description}`.includes(filter.trim())),
  })).filter((group) => group.reports.length > 0), [filter]);

  const open = (key: MonitoringReportKey) => { setReport(key); onReportChange?.(key); };

  return (
    <div className="monitoring-reports-layout">
      <aside className="monitoring-report-directory" aria-label="دليل التقارير">
        <div className="monitoring-report-directory__title"><FileSearch className="h-5 w-5" /><div><strong>دليل التقارير</strong><span>{REPORTS.length} تقريرًا تشغيليًا</span></div></div>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="ابحث عن تقرير" className="pr-9" />
        </div>
        <div className="monitoring-report-groups">
          {visibleGroups.map((group) => (
            <section key={group.key}>
              <h3><group.icon className="h-4 w-4" />{group.label}</h3>
              {group.reports.map((item) => (
                <button key={item.key} type="button" data-active={report === item.key} onClick={() => open(item.key)}>
                  <item.icon className="h-4 w-4" /><span><strong>{item.label}</strong><small>{item.description}</small></span><ChevronLeft className="mr-auto h-4 w-4" />
                </button>
              ))}
            </section>
          ))}
        </div>
      </aside>

      <section className="monitoring-report-content" key={`${report}-${refreshKey}`}>
        <header className="monitoring-report-content__header"><div><p className="monitoring-eyebrow">المؤشرات والتقارير</p><h2>{selected.label}</h2><p>{selected.description}</p></div><Badge variant="outline">محدّث مباشر</Badge></header>
        <div className="monitoring-report-body">
          {report === "summary" && <OverviewTab from={from} to={to} />}
          {report === "ai" && <AiUsageTab />}
          {report === "active" && <ActiveStudentsTab from={from} to={to} />}
          {report === "exams" && <TopExamsTab from={from} to={to} />}
          {report === "subscriptions" && <SubscriptionsTab />}
          {report === "wallets" && <WalletsTab />}
          {report === "alerts" && <AlertsTab refreshKey={refreshKey} onChanged={onAlertsChanged} />}
          {report === "payments" && <PaymentsTab from={from} to={to} />}
          {report === "teachers" && <TeacherActivityTab from={from} to={to} />}
          {report === "inactive" && <InactiveStudentsTab />}
          {report === "anomalies" && <AnomaliesTab />}
          {report === "health" && <HealthTab />}
          {report === "errors" && <ErrorsTab />}
          {report === "lookup" && <StudentLookupTab initialQuery={lookupQuery} />}
          {report === "settings" && <ThresholdSettings />}
        </div>
      </section>
    </div>
  );
}