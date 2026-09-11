import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ArrowLeft, RefreshCw, Bell } from "lucide-react";
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

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "📊 نظرة عامة" },
  { key: "ai", label: "🤖 المساعد الذكي" },
  { key: "active", label: "🔥 الأكثر نشاطًا" },
  { key: "exams", label: "🏆 أفضل 10 في الامتحانات" },
  { key: "subscriptions", label: "💳 الاشتراكات" },
  { key: "wallets", label: "💰 أرصدة الطلاب" },
  { key: "alerts", label: "🚨 التنبيهات" },
  { key: "payments", label: "💵 المدفوعات" },
  { key: "teachers", label: "👨‍🏫 نشاط المعلمين" },
  { key: "inactive", label: "💤 غير النشطين" },
  { key: "anomalies", label: "🚨 استخدام غير طبيعي" },
  { key: "health", label: "🟢 صحة المنصة" },
  { key: "errors", label: "🐛 أخطاء النظام" },
  { key: "lookup", label: "🔎 بحث موحّد" },
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
          toast.success(`🔔 ${row?.title ?? "تنبيه جديد"}`, {
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
    <div dir="rtl" className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-20 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} aria-label="رجوع">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">📊 مركز المتابعة</h1>
            <p className="text-xs text-muted-foreground">مراقبة شاملة للطلاب والاشتراكات والذكاء الاصطناعي — للمدير فقط</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTab("alerts")} className="relative">
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <Badge className="absolute -top-2 -left-2 h-5 min-w-5 justify-center px-1 text-[10px]">
                  {unread}
                </Badge>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
              <RefreshCw className="h-4 w-4 ml-1" /> تحديث
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        <Card className="p-3 flex flex-wrap items-center justify-between gap-3">
          <PeriodPicker value={period} onChange={setPeriod} />
          <p className="text-[11px] text-muted-foreground">التوقيت المعتمد: توقيت مصر (من الخادم)</p>
        </Card>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={tab === t.key ? "default" : "outline"}
              className="whitespace-nowrap shrink-0"
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.key === "alerts" && unread > 0 && (
                <span className="mr-1 text-[10px] font-bold">({unread})</span>
              )}
            </Button>
          ))}
        </div>

        <div key={`${tab}-${refreshKey}`}>
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
        </div>
      </div>
    </div>
  );
};

export default MonitoringCenterPage;
