import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Bell, LayoutDashboard, Plus, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import "@/styles/monitoring-center.css";
import { PeriodPicker, type PeriodValue, resolvePeriod } from "@/components/admin/monitoring/shared";
import { SmartOverview } from "@/components/admin/monitoring/SmartOverviewSections";
import { MonitoringReportsHub, type MonitoringReportKey } from "@/components/admin/monitoring/MonitoringReportsHub";

type MainTab = "overview" | "reports";

const MonitoringCenterPage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<MainTab>("overview");
  const [report, setReport] = useState<MonitoringReportKey>("summary");
  const [period, setPeriod] = useState<PeriodValue>({ key: "7d", from: null, to: null });
  const [refreshKey, setRefreshKey] = useState(0);
  const [unread, setUnread] = useState(0);
  const [search, setSearch] = useState("");
  const [lookupQuery, setLookupQuery] = useState("");
  const range = useMemo(() => resolvePeriod(period), [period]);

  const openReport = useCallback((nextReport: MonitoringReportKey) => {
    setReport(nextReport);
    setTab("reports");
  }, []);

  const loadUnread = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_monitoring_alerts_list" as never, { _only_unread: true, _limit: 1, _offset: 0 } as never);
    if (!error && data) setUnread(Number((data as any).unread ?? 0));
  }, []);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = search.trim();
    if (!value) return;
    setLookupQuery(value);
    openReport("lookup");
  };

  useEffect(() => { void loadUnread(); }, [loadUnread, refreshKey]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-monitoring-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_monitoring_alerts" }, (payload) => {
        const row: any = payload.new;
        setUnread((current) => current + 1);
        setRefreshKey((current) => current + 1);
        const details = row?.details ?? {};
        toast.success(row?.title ?? "تنبيه جديد", {
          description: [
            details.student_name && `الطالب: ${details.student_name}`,
            details.teacher_name && `المعلم: ${details.teacher_name}`,
            details.group_title && `المجموعة: ${details.group_title}`,
            details.amount != null && `القيمة: ${details.amount}`,
          ].filter(Boolean).join(" • "),
        });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  return (
    <div dir="rtl" className="monitoring-center">
      <header className="monitoring-center__header">
        <div className="monitoring-center__header-inner">
          <Button className="monitoring-header-action" variant="outline" size="icon" onClick={() => navigate("/admin")} aria-label="رجوع">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="monitoring-center__title">
            <p className="monitoring-eyebrow">لوحة الإدارة</p>
            <h1>مركز المتابعة الذكي</h1>
            <p>لوحة قيادة موحدة لمراقبة الأداء والنشاط والعمليات</p>
          </div>
          <form className="monitoring-global-search" onSubmit={submitSearch}>
            <Search className="h-4 w-4" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو الكود أو المعرّف" aria-label="بحث موحد" />
          </form>
          <div className="monitoring-header-actions">
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/notifications")} className="monitoring-header-action monitoring-create-action">
              <Plus className="ml-1.5 h-4 w-4" /> إنشاء إشعار
            </Button>
            <Button variant="outline" size="icon" onClick={() => openReport("alerts")} className="monitoring-header-action relative" aria-label="التنبيهات">
              <Bell className="h-4 w-4" />
              {unread > 0 && <Badge className="absolute -left-2 -top-2 h-5 min-w-5 justify-center px-1 text-[10px]">{unread}</Badge>}
            </Button>
            <Button className="monitoring-header-action" variant="outline" size="icon" onClick={() => setRefreshKey((current) => current + 1)} aria-label="تحديث البيانات">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="monitoring-main-tabs" role="tablist" aria-label="أقسام مركز المتابعة">
          <button type="button" role="tab" aria-selected={tab === "overview"} data-active={tab === "overview"} onClick={() => setTab("overview")}><LayoutDashboard className="h-4 w-4" />نظرة عامة</button>
          <button type="button" role="tab" aria-selected={tab === "reports"} data-active={tab === "reports"} onClick={() => setTab("reports")}><SlidersHorizontal className="h-4 w-4" />المؤشرات والتقارير</button>
        </div>
      </header>

      <main className="monitoring-center__main">
        <section className="monitoring-center__toolbar" aria-label="تصفية التقرير">
          <div className="monitoring-center__period"><span>الفترة الزمنية</span><PeriodPicker value={period} onChange={setPeriod} /></div>
          <div className="monitoring-live-label"><span className="monitoring-center__status-dot" />تحديث مباشر · توقيت القاهرة</div>
        </section>
        <section key={tab} className="monitoring-center__workspace monitoring-section-enter">
          {tab === "overview" ? (
            <SmartOverview from={range.from} to={range.to} refreshKey={refreshKey} onOpenReport={openReport} />
          ) : (
            <MonitoringReportsHub from={range.from} to={range.to} refreshKey={refreshKey} initialReport={report} lookupQuery={lookupQuery} onReportChange={setReport} onAlertsChanged={loadUnread} />
          )}
        </section>
      </main>
    </div>
  );
};

export default MonitoringCenterPage;
