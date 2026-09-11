import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users, UserCheck, CreditCard, Bot, Wallet, FileText, Bell, GraduationCap,
  CalendarPlus, Activity, Banknote,
} from "lucide-react";
import {
  MetricCard, SectionState, fmtMoney, fmtNumber, fmtDateTime, useMonitoringRpc,
} from "./shared";

export function OverviewTab({ from, to }: { from: string | null; to: string | null }) {
  const { data, loading, error, reload } = useMonitoringRpc<any>("admin_monitoring_overview", {
    _from: from, _to: to,
  });
  const d = data ?? {};
  return (
    <SectionState loading={loading} error={error} onRetry={reload}>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MetricCard label="إجمالي الطلاب" value={fmtNumber(d.total_students)} icon={Users} />
        <MetricCard label="طلاب نشطون اليوم" value={fmtNumber(d.active_today)} icon={UserCheck} />
        <MetricCard label="نشطون خلال 7 أيام" value={fmtNumber(d.active_7d)} icon={Activity} />
        <MetricCard label="اشتراكات نشطة" value={fmtNumber(d.active_subscriptions)} icon={CreditCard} />
        <MetricCard label="اشتراكات جديدة اليوم" value={fmtNumber(d.new_subscriptions_today)} icon={CalendarPlus} />
        <MetricCard label="استخدام AI اليوم" value={fmtNumber(d.ai_usage_today)} icon={Bot} />
        <MetricCard label="طلاب استخدموا AI اليوم" value={fmtNumber(d.ai_students_today)} icon={Bot} />
        <MetricCard label="إجمالي أرصدة الطلاب" value={fmtMoney(d.wallet_total)} icon={Wallet} />
        <MetricCard label="امتحانات اليوم" value={fmtNumber(d.exams_today)} icon={FileText} />
        <MetricCard label="امتحانات في الفترة" value={fmtNumber(d.exams_range)} icon={FileText} />
        <MetricCard label="تنبيهات غير مقروءة" value={fmtNumber(d.unread_alerts)} icon={Bell} />
        <MetricCard label="عدد المعلمين" value={fmtNumber(d.total_teachers)} icon={GraduationCap} />
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        وقت الخادم: {fmtDateTime(d.server_now)} — الفترة: {fmtDateTime(d.range_from)} إلى {fmtDateTime(d.range_to)}
      </p>
    </SectionState>
  );
}

export function PaymentsTab({ from, to }: { from: string | null; to: string | null }) {
  const { data, loading, error, reload } = useMonitoringRpc<any>("admin_monitoring_payments", {
    _from: from, _to: to,
  });
  const d = data ?? {};
  return (
    <SectionState loading={loading} error={error} onRetry={reload}>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MetricCard label="إيداعات معتمدة اليوم" value={fmtMoney(d.deposits_today)} icon={Banknote} />
        <MetricCard label="إيداعات 7 أيام" value={fmtMoney(d.deposits_7d)} />
        <MetricCard label="إيداعات 30 يومًا" value={fmtMoney(d.deposits_30d)} />
        <MetricCard label="إيداعات الفترة المختارة" value={fmtMoney(d.deposits_range)} />
        <MetricCard label="عمليات معتمدة" value={fmtNumber(d.approved_count)} hint="داخل الفترة" />
        <MetricCard label="عمليات مرفوضة" value={fmtNumber(d.rejected_count)} hint="داخل الفترة" />
        <MetricCard label="طلبات معلّقة" value={fmtNumber(d.pending_count)} hint={fmtMoney(d.pending_amount)} />
        <MetricCard label="اشتراكات مدفوعة في الفترة" value={fmtNumber(d.purchases_range_count)} hint={fmtMoney(d.purchases_range_amount)} />
        <MetricCard label="قيمة اشتراكات اليوم" value={fmtMoney(d.purchases_today_amount)} />
        <MetricCard label="قيمة اشتراكات 7 أيام" value={fmtMoney(d.purchases_7d_amount)} />
        <MetricCard label="قيمة اشتراكات 30 يومًا" value={fmtMoney(d.purchases_30d_amount)} />
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        المصدر: طلبات الإيداع المعتمدة + اشتراكات المجموعات المدفوعة فعليًا في النظام الحالي.
      </p>
    </SectionState>
  );
}

const HEALTH_STYLE: Record<string, { dot: string; label: string }> = {
  ok: { dot: "bg-emerald-500", label: "يعمل" },
  warn: { dot: "bg-amber-500", label: "تحذير" },
  error: { dot: "bg-destructive", label: "مشكلة" },
};

export function HealthTab() {
  const { data, loading, error, reload } = useMonitoringRpc<any>("admin_monitoring_health", {});
  const services: any[] = data?.services ?? [];
  return (
    <SectionState loading={loading} error={error} onRetry={reload}>
      <div className="grid gap-3 md:grid-cols-2">
        {services.map((s) => {
          const st = HEALTH_STYLE[s.status] ?? HEALTH_STYLE.warn;
          return (
            <Card key={s.key} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{s.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.detail}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`h-2.5 w-2.5 rounded-full ${st.dot}`} />
                <span className="text-xs font-medium">{st.label}</span>
              </div>
            </Card>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">آخر فحص: {fmtDateTime(data?.checked_at)}</p>
    </SectionState>
  );
}

export function ErrorsTab() {
  const { data, loading, error, reload } = useMonitoringRpc<any>("admin_monitoring_errors", { _limit: 40 });
  const rows: any[] = data?.rows ?? [];
  return (
    <SectionState loading={loading} error={error} empty={rows.length === 0} onRetry={reload}>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="p-3">المصدر</th>
              <th className="p-3">الخطأ</th>
              <th className="p-3">التكرار</th>
              <th className="p-3">آخر حدوث</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="p-3 whitespace-nowrap">{r.source}</td>
                <td className="p-3 text-muted-foreground">{r.message}</td>
                <td className="p-3">
                  <Badge variant={Number(r.occurrences) > 10 ? "destructive" : "secondary"}>
                    {fmtNumber(r.occurrences)}
                  </Badge>
                </td>
                <td className="p-3 whitespace-nowrap text-xs">{fmtDateTime(r.last_seen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-[11px] text-muted-foreground mt-3">
        الأكثر تكرارًا في الأعلى. لا تُسجَّل أي بيانات حساسة داخل هذه السجلات.
      </p>
    </SectionState>
  );
}
