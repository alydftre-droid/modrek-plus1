import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Bot, Users, Flame } from "lucide-react";
import {
  MetricCard, PAGE_SIZE, Pager, SectionState, fmtDateTime, fmtNumber, shortId, useMonitoringRpc,
} from "./shared";

export function AiUsageTab() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const { data, loading, error, reload } = useMonitoringRpc<any>("admin_monitoring_ai_usage", {
    _search: query || null, _limit: PAGE_SIZE, _offset: page * PAGE_SIZE,
  });
  const s = data?.summary ?? {};
  const rows: any[] = data?.rows ?? [];
  const tokens = s.tokens ?? {};
  const hasTokens = Number(tokens.requests ?? 0) > 0;
  const students30 = Number(s.students_30d ?? 0);
  const avg = students30 > 0 ? Math.round((Number(s.d30 ?? 0) / students30) * 10) / 10 : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MetricCard label="استخدام AI اليوم" value={fmtNumber(s.today)} icon={Bot} />
        <MetricCard label="آخر 7 أيام" value={fmtNumber(s.d7)} />
        <MetricCard label="آخر 30 يومًا" value={fmtNumber(s.d30)} />
        <MetricCard label="طلاب استخدموا AI اليوم" value={fmtNumber(s.students_today)} icon={Users} />
        <MetricCard label="طلاب خلال 30 يومًا" value={fmtNumber(students30)} />
        <MetricCard label="متوسط الاستخدام لكل طالب" value={fmtNumber(avg)} hint="خلال 30 يومًا" />
        <MetricCard label="استخدام الطلاب المشتركين" value={fmtNumber(s.premium_usage_30d)} hint="30 يومًا" />
        <MetricCard label="استخدام الطلاب المجانيين" value={fmtNumber(s.free_usage_30d)} hint="30 يومًا" />
      </div>

      <Card className="p-4">
        <p className="text-sm font-semibold mb-2">💸 تكلفة AI</p>
        {hasTokens ? (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <MetricCard label="عدد الطلبات" value={fmtNumber(tokens.requests)} />
            <MetricCard label="Input Tokens" value={fmtNumber(tokens.input_tokens)} />
            <MetricCard label="Output Tokens" value={fmtNumber(tokens.output_tokens)} />
            <MetricCard label="التكلفة التقديرية" value={`$${Number(tokens.cost_usd ?? 0).toFixed(2)}`} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground leading-relaxed">
            النظام الحالي يسجّل عدد الاستخدامات فقط، ولا يسجّل Tokens أو تكلفة فعلية، لذلك لا تُعرض أي تكلفة
            حتى لا تكون أرقامًا غير حقيقية. تم تجهيز بنية تسجيل الطلبات (النموذج، Tokens، التكلفة) لتبدأ
            بالعمل بمجرد تفعيل تسجيل بيانات الاستخدام من مزوّد الذكاء الاصطناعي.
          </p>
        )}
      </Card>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setPage(0); setQuery(search); } }}
            placeholder="بحث بالاسم أو الكود أو الـID"
            className="pr-9"
          />
        </div>
        <Button onClick={() => { setPage(0); setQuery(search); }}>بحث</Button>
      </div>

      <SectionState loading={loading} error={error} empty={rows.length === 0} onRetry={reload}>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-3">الطالب</th>
                <th className="p-3">ID</th>
                <th className="p-3">اليومي</th>
                <th className="p-3">7 أيام</th>
                <th className="p-3">30 يومًا</th>
                <th className="p-3">الخطة</th>
                <th className="p-3">آخر استخدام</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} className="border-t border-border">
                  <td className="p-3">{r.student_name ?? "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{r.student_code ?? shortId(r.user_id)}</td>
                  <td className="p-3 tabular-nums">{fmtNumber(r.today)}</td>
                  <td className="p-3 tabular-nums">{fmtNumber(r.d7)}</td>
                  <td className="p-3 tabular-nums font-semibold">{fmtNumber(r.d30)}</td>
                  <td className="p-3">
                    <Badge variant={r.plan === "premium" ? "default" : "secondary"}>
                      {r.plan === "premium" ? "مشترك" : "مجاني"}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs whitespace-nowrap">{fmtDateTime(r.last_used)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3">
            <Pager page={page} pageSize={PAGE_SIZE} total={Number(data?.total ?? 0)} onPage={setPage} />
          </div>
        </Card>
      </SectionState>
    </div>
  );
}

export function ActiveStudentsTab({ from, to }: { from: string | null; to: string | null }) {
  const { data, loading, error, reload } = useMonitoringRpc<any>("admin_monitoring_active_students", {
    _from: from, _to: to, _limit: 30,
  });
  const rows: any[] = data?.rows ?? [];
  return (
    <SectionState loading={loading} error={error} empty={rows.length === 0} onRetry={reload}>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="p-3">#</th>
              <th className="p-3">الطالب</th>
              <th className="p-3">ID</th>
              <th className="p-3">درجة النشاط</th>
              <th className="p-3">دخول</th>
              <th className="p-3">دروس</th>
              <th className="p-3">امتحانات</th>
              <th className="p-3">AI</th>
              <th className="p-3">حصص مباشرة</th>
              <th className="p-3">آخر نشاط</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3">{i + 1}</td>
                <td className="p-3">{r.full_name ?? "—"}</td>
                <td className="p-3 text-xs text-muted-foreground">{r.student_code ?? shortId(r.id)}</td>
                <td className="p-3 font-bold tabular-nums flex items-center gap-1">
                  <Flame className="h-3.5 w-3.5 text-orange-500" />{fmtNumber(r.score)}
                </td>
                <td className="p-3 tabular-nums">{fmtNumber(r.logins)}</td>
                <td className="p-3 tabular-nums">{fmtNumber(r.lessons)}</td>
                <td className="p-3 tabular-nums">{fmtNumber(r.exam_attempts)}</td>
                <td className="p-3 tabular-nums">{fmtNumber(r.ai_uses)}</td>
                <td className="p-3 tabular-nums">{fmtNumber(r.live_sessions)}</td>
                <td className="p-3 text-xs whitespace-nowrap">{fmtDateTime(r.last_activity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-[11px] text-muted-foreground mt-3">
        درجة النشاط = (دخول ×1) + (دروس ×2) + (امتحانات ×5) + (استخدام AI ×3) + (حصص مباشرة ×4) + (بقية الأحداث ×1).
      </p>
    </SectionState>
  );
}

export function TopExamsTab({ from, to }: { from: string | null; to: string | null }) {
  const [minAttempts, setMinAttempts] = useState(1);
  const { data, loading, error, reload } = useMonitoringRpc<any>("admin_monitoring_top_exam_students", {
    _from: from, _to: to, _limit: 10, _min_attempts: minAttempts,
  });
  const rows: any[] = data?.rows ?? [];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">الحد الأدنى لعدد الامتحانات:</span>
        <Input
          type="number" min={1} className="h-9 w-20"
          value={minAttempts}
          onChange={(e) => setMinAttempts(Math.max(1, Number(e.target.value) || 1))}
        />
      </div>
      <SectionState loading={loading} error={error} empty={rows.length === 0} onRetry={reload}>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">الطالب</th>
                <th className="p-3">ID</th>
                <th className="p-3">متوسط الدرجات</th>
                <th className="p-3">عدد الامتحانات</th>
                <th className="p-3">أعلى درجة</th>
                <th className="p-3">الصف</th>
                <th className="p-3">آخر امتحان</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.student_id} className="border-t border-border">
                  <td className="p-3">{i + 1}</td>
                  <td className="p-3">{r.student_name ?? "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{r.student_code ?? shortId(r.student_id)}</td>
                  <td className="p-3 font-bold tabular-nums">{Number(r.avg_percentage ?? 0).toFixed(1)}%</td>
                  <td className="p-3 tabular-nums">{fmtNumber(r.attempts)}</td>
                  <td className="p-3 tabular-nums">{Number(r.best_percentage ?? 0).toFixed(1)}%</td>
                  <td className="p-3 text-xs">{[r.stage, r.grade].filter(Boolean).join(" — ") || "—"}</td>
                  <td className="p-3 text-xs whitespace-nowrap">{fmtDateTime(r.last_attempt_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="text-[11px] text-muted-foreground mt-3">
          الترتيب بمتوسط النسبة المئوية وليس بمجموع الدرجات، حتى لا يتقدّم الطالب بعدد الامتحانات فقط.
        </p>
      </SectionState>
    </div>
  );
}

export function InactiveStudentsTab() {
  const [days, setDays] = useState(7);
  const [page, setPage] = useState(0);
  const { data, loading, error, reload } = useMonitoringRpc<any>("admin_monitoring_inactive_students", {
    _days: days, _limit: PAGE_SIZE, _offset: page * PAGE_SIZE,
  });
  const rows: any[] = data?.rows ?? [];
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {[7, 14, 30].map((d) => (
          <Button key={d} size="sm" variant={days === d ? "default" : "outline"}
            onClick={() => { setDays(d); setPage(0); }}>
            لم يدخل منذ {d} يومًا
          </Button>
        ))}
      </div>
      <SectionState loading={loading} error={error} empty={rows.length === 0} onRetry={reload}>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-3">الطالب</th>
                <th className="p-3">ID</th>
                <th className="p-3">الصف</th>
                <th className="p-3">آخر نشاط</th>
                <th className="p-3">اشتراكات نشطة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.student_id} className="border-t border-border">
                  <td className="p-3">{r.student_name ?? "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{r.student_code ?? shortId(r.student_id)}</td>
                  <td className="p-3 text-xs">{[r.stage, r.grade].filter(Boolean).join(" — ") || "—"}</td>
                  <td className="p-3 text-xs whitespace-nowrap">{r.last_activity ? fmtDateTime(r.last_activity) : "لا يوجد نشاط"}</td>
                  <td className="p-3 tabular-nums">{fmtNumber(r.active_subscriptions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3">
            <Pager page={page} pageSize={PAGE_SIZE} total={Number(data?.total ?? 0)} onPage={setPage} />
          </div>
        </Card>
      </SectionState>
    </div>
  );
}

const SEVERITY: Record<string, { label: string; variant: "destructive" | "default" | "secondary" }> = {
  high: { label: "خطورة عالية", variant: "destructive" },
  medium: { label: "متوسطة", variant: "default" },
  low: { label: "منخفضة", variant: "secondary" },
};

export function AnomaliesTab() {
  const { data, loading, error, reload } = useMonitoringRpc<any>("admin_monitoring_anomalies", {});
  const rows: any[] = data?.rows ?? [];
  const th = data?.thresholds ?? {};
  return (
    <div className="space-y-3">
      <Card className="p-4 text-xs text-muted-foreground leading-relaxed">
        الحدود المستخدمة حاليًا: استخدام AI يتجاوز {th.ai_multiplier ?? 3}× متوسط المنصة
        (متوسط الاستخدام اليومي حاليًا {fmtNumber(data?.platform_avg_ai_daily)}) وبحد أدنى {th.ai_min_requests ?? 15} طلبًا،
        أو {th.burst_requests ?? 30} طلبًا خلال {th.burst_minutes ?? 10} دقيقة،
        أو {th.exam_attempts_per_hour ?? 6} محاولات امتحان في الساعة. التنبيه فقط — لا يتم حظر أي طالب تلقائيًا.
      </Card>
      <SectionState loading={loading} error={error} empty={rows.length === 0} onRetry={reload}>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-3">الطالب</th>
                <th className="p-3">ID</th>
                <th className="p-3">سبب التنبيه</th>
                <th className="p-3">الخطورة</th>
                <th className="p-3">عدد الطلبات</th>
                <th className="p-3">التفاصيل</th>
                <th className="p-3">وقت الحدوث</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const sev = SEVERITY[r.severity] ?? SEVERITY.low;
                return (
                  <tr key={i} className="border-t border-border">
                    <td className="p-3">{r.student_name ?? "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{r.student_code ?? shortId(r.student_id)}</td>
                    <td className="p-3">{r.reason}</td>
                    <td className="p-3"><Badge variant={sev.variant}>{sev.label}</Badge></td>
                    <td className="p-3 tabular-nums">{fmtNumber(r.requests)}</td>
                    <td className="p-3 text-xs text-muted-foreground">{r.detail}</td>
                    <td className="p-3 text-xs whitespace-nowrap">{fmtDateTime(r.occurred_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </SectionState>
    </div>
  );
}
