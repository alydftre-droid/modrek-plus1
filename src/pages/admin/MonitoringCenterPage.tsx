import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity, AlertTriangle, ArrowLeft, Banknote, Bell, Bot, CircleAlert,
  CreditCard, FileSearch, GraduationCap, HeartPulse, RefreshCw, Search,
  Trophy, UserRoundCheck, UserRoundX, Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "@/styles/monitoring-center.css";
import {
  PeriodPicker, PeriodValue, resolvePeriod,
} from "@/components/admin/monitoring/shared";
import {
  OverviewTab, PaymentsTab, HealthTab, ErrorsTab,
} from "@/components/admin/monitoring/OverviewSections";
import {
  AiUsageTab, ActiveStudentsTab, TopExamsTab, InactiveStudentsTab, AnomaliesTab,
} from "@/components/admin/monitoring/StudentSections";
import {
  SubscriptionsTab, WalletsTab, TeacherActivityTab, AlertsTab, StudentLookupTab,
} from "@/components/admin/monitoring/MoneySections";

type TabKey =
  | "overview" | "ai" | "active" | "exams" | "subscriptions" | "wallets"
  | "alerts" | "payments" | "teachers" | "inactive" | "anomalies"
  | "health" | "errors" | "lookup";

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "نظرة عامة", icon: Activity },
  { key: "ai", label: "المساعد الذكي", icon: Bot },
  { key: "active", label: "الأكثر نشاطًا", icon: UserRoundCheck },
  { key: "exams", label: "أفضل الامتحانات", icon: Trophy },
  { key: "subscriptions", label: "الاشتراكات", icon: CreditCard },
  { key: "wallets", label: "أرصدة الطلاب", icon: Wallet },
  { key: "alerts", label: "التنبيهات", icon: Bell },
  { key: "payments", label: "المدفوعات", icon: Banknote },
  { key: "teachers", label: "نشاط المعلمين", icon: GraduationCap },
  { key: "inactive", label: "غير النشطين", icon: UserRoundX },
  { key: "anomalies", label: "استخدام غير طبيعي", icon: AlertTriangle },
  { key: "health", label: "صحة المنصة", icon: HeartPulse },
  { key: "errors", label: "أخطاء النظام", icon: CircleAlert },
  { key: "lookup", label: "بحث موحّد", icon: Search },
];

const MonitoringCenterPage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("overview");
  const [period, setPeriod] = useState<PeriodValue>({ key: "7d", from: null, to: null });
  const [refreshKey, setRefreshKey] = useState(0);
  const [unread, setUnread] = useState(0);

  const range = useMemo(() => resolvePeriod(period), [period]);

  const loadUnread = useCallback(async () => {
    const { data, error } = await supabase.rpc(
      "admin_monitoring_alerts_list" as never,
      { _only_unread: true, _limit: 1, _offset: 0 } as never,
    );
    if (!error && data) setUnread(Number((data as any).unread ?? 0));
  }, []);

  useEffect(() => { void loadUnread(); }, [loadUnread, refreshKey]);

  // Realtime: a new admin alert (e.g. a confirmed new subscription) shows instantly.
  useEffect(() => {
    const channel = supabase
      .channel("admin-monitoring-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_monitoring_alerts" },
        (payload) => {
          const row: any = payload.new;
          setUnread((u) => u + 1);
          setRefreshKey((k) => k + 1);
          const d = row?.details ?? {};
          toast.success(row?.title ?? "تنبيه جديد", {
            description: [
              d.student_name && `الطالب: ${d.student_name}`,
              d.student_code && `ID: ${d.student_code}`,
              d.teacher_name && `المعلم: ${d.teacher_name}`,
              d.group_title && `المجموعة: ${d.group_title}`,
              d.amount != null && `القيمة: ${d.amount}`,
            ].filter(Boolean).join(" • "),
          });
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  return (
    <div dir="rtl" className="monitoring-center">
      <header className="monitoring-center__header relative overflow-hidden">
        <div className="relative mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-5 sm:px-6 sm:py-7">
          <Button className="monitoring-header-action absolute right-4 top-5 sm:static" variant="outline" size="icon" onClick={() => navigate("/admin")} aria-label="رجوع">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="w-full min-w-0 pr-14 sm:w-auto sm:flex-1 sm:pr-0">
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-primary-foreground/65">
              <span className="monitoring-center__status-dot h-2 w-2 rounded-full bg-emerald-500" />
              متابعة مباشرة للنظام
            </div>
            <h1 className="text-2xl font-extrabold tracking-normal sm:text-[30px]">مركز المتابعة</h1>
            <p className="mt-1 text-xs leading-5 text-primary-foreground/65 sm:text-sm">صورة تنفيذية موحّدة لأداء المنصة والطلاب والعمليات</p>
          </div>
          <div className="mr-auto flex items-center gap-2 sm:mr-0">
            <Button variant="outline" size="icon" onClick={() => setTab("alerts")} className="monitoring-header-action relative" aria-label="التنبيهات">
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <Badge className="absolute -left-2 -top-2 h-5 min-w-5 justify-center border-2 border-foreground px-1 text-[10px]">
                  {unread}
                </Badge>
              )}
            </Button>
            <Button className="monitoring-header-action" variant="outline" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
              <RefreshCw className="ml-1.5 h-4 w-4" /> تحديث
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-0 py-4 sm:px-6 sm:py-6">
        <section className="monitoring-center__toolbar mx-4 flex flex-wrap items-center justify-between gap-3 rounded-md p-3 sm:mx-0 sm:p-4" aria-label="تصفية التقرير">
          <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto">
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:flex">
              <FileSearch className="h-[18px] w-[18px]" />
            </div>
            <PeriodPicker value={period} onChange={setPeriod} />
          </div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            توقيت مصر، محسوب من الخادم
          </div>
        </section>

        <nav className="monitoring-center__nav flex gap-1 overflow-x-auto border-y border-border bg-card px-4 py-2 sm:rounded-md sm:border sm:px-2" aria-label="أقسام مركز المتابعة">
          {TABS.map((t) => (
            <Button
              key={t.key}
              size="sm" variant="ghost"
              data-active={tab === t.key}
              className="monitoring-center__nav-button shrink-0 whitespace-nowrap px-3"
              onClick={() => setTab(t.key)}
            >
              <t.icon className="ml-2 h-4 w-4" strokeWidth={1.8} />
              <span>{t.label}</span>
              {t.key === "alerts" && unread > 0 && (
                <Badge variant="destructive" className="mr-1 h-5 min-w-5 px-1.5 text-[10px]">{unread}</Badge>
              )}
            </Button>
          ))}
        </nav>

        <section key={`${tab}-${refreshKey}`} className="monitoring-center__section monitoring-section-enter min-h-[420px] p-4 sm:rounded-md sm:p-6">
          {tab === "overview" && <OverviewTab from={range.from} to={range.to} />}
          {tab === "ai" && <AiUsageTab />}
          {tab === "active" && <ActiveStudentsTab from={range.from} to={range.to} />}
          {tab === "exams" && <TopExamsTab from={range.from} to={range.to} />}
          {tab === "subscriptions" && <SubscriptionsTab />}
          {tab === "wallets" && <WalletsTab />}
          {tab === "alerts" && <AlertsTab refreshKey={refreshKey} onChanged={loadUnread} />}
          {tab === "payments" && <PaymentsTab from={range.from} to={range.to} />}
          {tab === "teachers" && <TeacherActivityTab from={range.from} to={range.to} />}
          {tab === "inactive" && <InactiveStudentsTab />}
          {tab === "anomalies" && <AnomaliesTab />}
          {tab === "health" && <HealthTab />}
          {tab === "errors" && <ErrorsTab />}
          {tab === "lookup" && <StudentLookupTab />}
        </section>
      </main>
    </div>
  );
};

export default MonitoringCenterPage;
