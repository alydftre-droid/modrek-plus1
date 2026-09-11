import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Bot,
  ChevronLeft,
  CircleCheck,
  CreditCard,
  GraduationCap,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  MetricCard,
  SectionState,
  fmtDateTime,
  fmtMoney,
  fmtNumber,
  useMonitoringRpc,
} from "./shared";

type ReportKey =
  | "ai"
  | "active"
  | "subscriptions"
  | "wallets"
  | "exams"
  | "teachers"
  | "alerts"
  | "payments"
  | "inactive"
  | "health";

interface SmartOverviewProps {
  from: string | null;
  to: string | null;
  refreshKey: number;
  onOpenReport: (report: ReportKey) => void;
}

const ALERT_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  success: "default",
  info: "secondary",
  warning: "outline",
  critical: "destructive",
};

export function SmartOverview({ from, to, refreshKey, onOpenReport }: SmartOverviewProps) {
  const navigate = useNavigate();
  const overview = useMonitoringRpc<any>("admin_monitoring_overview", { _from: from, _to: to }, [refreshKey]);
  const ai = useMonitoringRpc<any>("admin_monitoring_ai_usage", { _search: null, _limit: 5, _offset: 0 }, [refreshKey]);
  const active = useMonitoringRpc<any>("admin_monitoring_active_students", { _from: from, _to: to, _limit: 5 }, [refreshKey]);
  const teachers = useMonitoringRpc<any>("admin_monitoring_teacher_activity", { _from: from, _to: to, _limit: 5 }, [refreshKey]);
  const alerts = useMonitoringRpc<any>("admin_monitoring_alerts_list", { _only_unread: false, _limit: 5, _offset: 0 }, [refreshKey]);
  const subscriptions = useMonitoringRpc<any>("admin_monitoring_subscriptions", { _filter: "all", _search: null, _limit: 5, _offset: 0 }, [refreshKey]);
  const d = overview.data ?? {};

  const activityChart = useMemo(() => [
    { name: "نشاط اليوم", value: Number(d.active_today ?? 0) },
    { name: "نشاط 7 أيام", value: Number(d.active_7d ?? 0) },
    { name: "AI اليوم", value: Number(d.ai_usage_today ?? 0) },
    { name: "امتحانات الفترة", value: Number(d.exams_range ?? 0) },
  ], [d.active_7d, d.active_today, d.ai_usage_today, d.exams_range]);

  const subscriptionChart = useMemo(() => {
    const total = Number(d.total_students ?? 0);
    const subscribed = Math.min(total, Number(d.active_subscriptions ?? 0));
    return [
      { name: "اشتراكات نشطة", value: subscribed, fill: "var(--monitoring-green)" },
      { name: "بدون اشتراك نشط", value: Math.max(0, total - subscribed), fill: "var(--monitoring-soft)" },
    ];
  }, [d.active_subscriptions, d.total_students]);

  const loading = overview.loading || ai.loading || active.loading || teachers.loading || alerts.loading || subscriptions.loading;
  const error = overview.error;
  const alertRows: any[] = alerts.data?.rows ?? [];
  const activeRows: any[] = active.data?.rows ?? [];
  const aiRows: any[] = ai.data?.rows ?? [];
  const teacherRows: any[] = teachers.data?.rows ?? [];
  const subscriptionRows: any[] = subscriptions.data?.rows ?? [];

  return (
    <SectionState loading={loading} error={error} onRetry={overview.reload}>
      <div className="space-y-5">
        <section className="monitoring-status-strip" aria-label="حالة المنصة">
          <div className="monitoring-status-strip__item">
            <CircleCheck className="h-5 w-5 text-emerald-600" />
            <div><strong>النظام يعمل</strong><span>التقارير متصلة ببيانات المنصة</span></div>
          </div>
          <div className="monitoring-status-strip__item">
            <Activity className="h-5 w-5 text-primary" />
            <div><strong>آخر تحديث</strong><span>{fmtDateTime(d.server_now)}</span></div>
          </div>
          <button type="button" className="monitoring-status-strip__item monitoring-status-strip__button" onClick={() => onOpenReport("alerts")}>
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div><strong>{fmtNumber(d.unread_alerts)} تنبيه غير مقروء</strong><span>عرض التنبيهات المهمة</span></div>
          </button>
        </section>

        <section>
          <div className="monitoring-section-heading">
            <div><p className="monitoring-eyebrow">المؤشرات الرئيسية</p><h2>ملخص الأداء</h2></div>
            <p>لقطة تشغيلية مباشرة للفترة المحددة</p>
          </div>
          <div className="monitoring-kpi-grid grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="إجمالي الطلاب" value={fmtNumber(d.total_students)} icon={Users} onClick={() => onOpenReport("active")} />
            <MetricCard label="النشطون اليوم" value={fmtNumber(d.active_today)} icon={Activity} tone="success" onClick={() => onOpenReport("active")} />
            <MetricCard label="اشتراكات نشطة" value={fmtNumber(d.active_subscriptions)} icon={CreditCard} tone="primary" onClick={() => onOpenReport("subscriptions")} />
            <MetricCard label="استخدام AI اليوم" value={fmtNumber(d.ai_usage_today)} icon={Bot} tone="warning" onClick={() => onOpenReport("ai")} />
            <MetricCard label="إجمالي الأرصدة" value={fmtMoney(d.wallet_total)} icon={Wallet} onClick={() => onOpenReport("wallets")} />
            <MetricCard label="امتحانات اليوم" value={fmtNumber(d.exams_today)} icon={Activity} onClick={() => onOpenReport("exams")} />
            <MetricCard label="عدد المعلمين" value={fmtNumber(d.total_teachers)} icon={GraduationCap} onClick={() => onOpenReport("teachers")} />
            <MetricCard label="اشتراكات اليوم" value={fmtNumber(d.new_subscriptions_today)} icon={CreditCard} tone="success" onClick={() => onOpenReport("subscriptions")} />
          </div>
        </section>

        <section className="monitoring-overview-grid">
          <Card className="monitoring-panel monitoring-panel--wide">
            <div className="monitoring-panel__header">
              <div><p className="monitoring-eyebrow">مقارنة تشغيلية</p><h3>حركة المنصة</h3></div>
              <Badge variant="secondary">بيانات فعلية</Badge>
            </div>
            <div className="monitoring-chart" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activityChart} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="var(--monitoring-grid)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "var(--monitoring-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--monitoring-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={34} />
                  <Tooltip cursor={{ fill: "var(--monitoring-hover)" }} contentStyle={{ borderColor: "var(--monitoring-border)", borderRadius: 6, direction: "rtl" }} />
                  <Bar dataKey="value" fill="var(--monitoring-blue)" radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="monitoring-panel">
            <div className="monitoring-panel__header">
              <div><p className="monitoring-eyebrow">الطلاب</p><h3>تغطية الاشتراكات</h3></div>
            </div>
            <div className="monitoring-donut-wrap">
              <div className="monitoring-donut" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={subscriptionChart} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="none">
                      {subscriptionChart.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderColor: "var(--monitoring-border)", borderRadius: 6, direction: "rtl" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="monitoring-legend">
                {subscriptionChart.map((entry) => (
                  <div key={entry.name}><span style={{ backgroundColor: entry.fill }} /><p>{entry.name}<strong>{fmtNumber(entry.value)}</strong></p></div>
                ))}
              </div>
            </div>
          </Card>
        </section>

        <section className="monitoring-overview-grid">
          <Card className="monitoring-panel monitoring-panel--wide">
            <div className="monitoring-panel__header">
              <div><p className="monitoring-eyebrow">آخر الأحداث</p><h3>التنبيهات المهمة</h3></div>
              <Button variant="ghost" size="sm" onClick={() => onOpenReport("alerts")}>عرض الكل <ChevronLeft className="mr-1 h-4 w-4" /></Button>
            </div>
            <div className="monitoring-feed">
              {alertRows.length === 0 ? <p className="monitoring-empty-inline">لا توجد تنبيهات حديثة.</p> : alertRows.map((row) => (
                <div className="monitoring-feed__row" key={row.id}>
                  <span className={`monitoring-feed__marker monitoring-feed__marker--${row.severity ?? "info"}`} />
                  <div className="min-w-0 flex-1"><strong>{row.title}</strong><p>{row.description ?? "تم تسجيل حدث جديد"}</p></div>
                  <div className="shrink-0 text-left"><Badge variant={ALERT_VARIANT[row.severity] ?? "secondary"}>{row.is_read ? "مقروء" : "جديد"}</Badge><time>{fmtDateTime(row.created_at)}</time></div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="monitoring-panel">
            <div className="monitoring-panel__header"><div><p className="monitoring-eyebrow">AI</p><h3>أعلى استخدام</h3></div><Button variant="ghost" size="icon" onClick={() => onOpenReport("ai")} aria-label="عرض تقرير AI"><ChevronLeft className="h-4 w-4" /></Button></div>
            <div className="monitoring-ranking">
              {aiRows.slice(0, 5).map((row, index) => (
                <div key={row.user_id}><span>{index + 1}</span><p>{row.student_name ?? "طالب"}<small>{row.student_code ?? "بدون كود"}</small></p><strong>{fmtNumber(row.d30)}</strong></div>
              ))}
              {aiRows.length === 0 && <p className="monitoring-empty-inline">لا يوجد استخدام مسجل.</p>}
            </div>
          </Card>
        </section>

        <section className="monitoring-three-column">
          <Card className="monitoring-panel">
            <div className="monitoring-panel__header"><div><p className="monitoring-eyebrow">الطلاب الآن</p><h3>الأكثر نشاطًا</h3></div><Button variant="ghost" size="icon" onClick={() => onOpenReport("active")} aria-label="عرض الطلاب النشطين"><ChevronLeft className="h-4 w-4" /></Button></div>
            <div className="monitoring-ranking">
              {activeRows.map((row, index) => <div key={row.id}><span>{index + 1}</span><p>{row.full_name ?? "طالب"}<small>{row.student_code ?? "بدون كود"}</small></p><strong>{fmtNumber(row.score)}</strong></div>)}
            </div>
          </Card>
          <Card className="monitoring-panel">
            <div className="monitoring-panel__header"><div><p className="monitoring-eyebrow">أداء المعلمين</p><h3>النشاط الحالي</h3></div><Button variant="ghost" size="icon" onClick={() => onOpenReport("teachers")} aria-label="عرض نشاط المعلمين"><ChevronLeft className="h-4 w-4" /></Button></div>
            <div className="monitoring-ranking">
              {teacherRows.map((row, index) => <div key={row.teacher_id}><span>{index + 1}</span><p>{row.teacher_name ?? "معلم"}<small>{fmtNumber(row.students_count)} طالب</small></p><strong>{fmtNumber(row.activity_events)}</strong></div>)}
            </div>
          </Card>
          <Card className="monitoring-panel">
            <div className="monitoring-panel__header"><div><p className="monitoring-eyebrow">الاشتراكات</p><h3>أحدث العمليات</h3></div><Button variant="ghost" size="icon" onClick={() => onOpenReport("subscriptions")} aria-label="عرض الاشتراكات"><ChevronLeft className="h-4 w-4" /></Button></div>
            <div className="monitoring-ranking monitoring-ranking--subscriptions">
              {subscriptionRows.map((row) => <div key={row.id}><span className="monitoring-rank-status" /><p>{row.student_name ?? "طالب"}<small>{row.teacher_name ?? row.subject_name ?? "—"}</small></p><strong>{row.amount_paid != null ? fmtMoney(row.amount_paid) : "—"}</strong></div>)}
            </div>
          </Card>
        </section>

        <div className="monitoring-quick-actions">
          <Button variant="outline" onClick={() => navigate("/admin/notifications")}>إنشاء إشعار جديد</Button>
          <Button variant="outline" onClick={() => onOpenReport("payments")}>مراجعة المدفوعات</Button>
          <Button variant="outline" onClick={() => onOpenReport("inactive")}>متابعة الطلاب غير النشطين</Button>
          <Button variant="outline" onClick={() => onOpenReport("health")}>فحص صحة المنصة</Button>
        </div>
      </div>
    </SectionState>
  );
}