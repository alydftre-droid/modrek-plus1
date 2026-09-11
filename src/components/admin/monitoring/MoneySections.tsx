import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Wallet, BellRing, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  MetricCard, PAGE_SIZE, Pager, SectionState, fmtDateTime, fmtMoney, fmtNumber, shortId, useMonitoringRpc,
} from "./shared";

const SUB_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "active", label: "نشط" },
  { key: "new", label: "جديد" },
  { key: "expiring", label: "ينتهي قريبًا" },
  { key: "expired", label: "منتهي" },
  { key: "cancelled", label: "ملغي" },
];

const STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "نشط", variant: "default" },
  new: { label: "جديد", variant: "default" },
  expiring: { label: "ينتهي قريبًا", variant: "outline" },
  expired: { label: "منتهي", variant: "secondary" },
  cancelled: { label: "ملغي", variant: "destructive" },
};

export function SubscriptionsTab() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const { data, loading, error, reload } = useMonitoringRpc<any>("admin_monitoring_subscriptions", {
    _filter: filter, _search: query || null, _limit: PAGE_SIZE, _offset: page * PAGE_SIZE,
  });
  const rows: any[] = data?.rows ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {SUB_FILTERS.map((f) => (
          <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"}
            onClick={() => { setFilter(f.key); setPage(0); }}>
            {f.label}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pr-9" value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setPage(0); setQuery(search); } }}
            placeholder="بحث بالاسم أو الكود أو الـID"
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
                <th className="p-3">المعلم</th>
                <th className="p-3">المادة</th>
                <th className="p-3">المجموعة</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">البداية</th>
                <th className="p-3">الانتهاء</th>
                <th className="p-3">القيمة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = STATUS_META[r.status] ?? STATUS_META.active;
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-3">{r.student_name ?? "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{r.student_code ?? shortId(r.student_id)}</td>
                    <td className="p-3">{r.teacher_name ?? "—"}</td>
                    <td className="p-3">{r.subject_name ?? "—"}</td>
                    <td className="p-3">{r.group_title ?? "—"}</td>
                    <td className="p-3"><Badge variant={meta.variant}>{meta.label}</Badge></td>
                    <td className="p-3 text-xs whitespace-nowrap">{fmtDateTime(r.start_date)}</td>
                    <td className="p-3 text-xs whitespace-nowrap">{r.end_date ? fmtDateTime(r.end_date) : "—"}</td>
                    <td className="p-3 whitespace-nowrap">{r.amount_paid != null ? fmtMoney(r.amount_paid) : "—"}</td>
                  </tr>
                );
              })}
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

export function WalletsTab() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("balance_desc");
  const [page, setPage] = useState(0);
  const { data, loading, error, reload } = useMonitoringRpc<any>("admin_monitoring_wallets", {
    _search: query || null, _sort: sort, _limit: PAGE_SIZE, _offset: page * PAGE_SIZE,
  });
  const rows: any[] = data?.rows ?? [];
  return (
    <div className="space-y-3">
      <MetricCard label="إجمالي أرصدة جميع الطلاب" value={fmtMoney(data?.total_balance)} icon={Wallet}
        hint="محسوب مباشرة من محافظ الطلاب" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={sort === "balance_desc" ? "default" : "outline"} onClick={() => { setSort("balance_desc"); setPage(0); }}>أعلى الأرصدة</Button>
        <Button size="sm" variant={sort === "balance_asc" ? "default" : "outline"} onClick={() => { setSort("balance_asc"); setPage(0); }}>أقل الأرصدة</Button>
        <Button size="sm" variant={sort === "updated_desc" ? "default" : "outline"} onClick={() => { setSort("updated_desc"); setPage(0); }}>آخر تحديث</Button>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setPage(0); setQuery(search); } }}
            placeholder="بحث بالاسم أو الكود أو الـID" />
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
                <th className="p-3">الرصيد الحالي</th>
                <th className="p-3">آخر حركة</th>
                <th className="p-3">آخر تحديث</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} className="border-t border-border">
                  <td className="p-3">{r.student_name ?? "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{r.student_code ?? shortId(r.user_id)}</td>
                  <td className="p-3 font-semibold tabular-nums">{fmtMoney(r.balance)}</td>
                  <td className="p-3 text-xs">
                    {r.last_movement
                      ? `${fmtMoney(r.last_movement.amount)} — ${fmtDateTime(r.last_movement.at)}`
                      : "—"}
                  </td>
                  <td className="p-3 text-xs whitespace-nowrap">{fmtDateTime(r.updated_at)}</td>
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

export function TeacherActivityTab({ from, to }: { from: string | null; to: string | null }) {
  const { data, loading, error, reload } = useMonitoringRpc<any>("admin_monitoring_teacher_activity", {
    _from: from, _to: to, _limit: 30,
  });
  const rows: any[] = data?.rows ?? [];
  return (
    <SectionState loading={loading} error={error} empty={rows.length === 0} onRetry={reload}>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="p-3">المعلم</th>
              <th className="p-3">المجموعات</th>
              <th className="p-3">الطلاب</th>
              <th className="p-3">الدروس</th>
              <th className="p-3">الامتحانات</th>
              <th className="p-3">الحصص المباشرة</th>
              <th className="p-3">أحداث النشاط</th>
              <th className="p-3">آخر نشاط</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.teacher_id} className="border-t border-border">
                <td className="p-3">{r.teacher_name ?? "—"}</td>
                <td className="p-3 tabular-nums">{fmtNumber(r.groups_count)}</td>
                <td className="p-3 tabular-nums">{fmtNumber(r.students_count)}</td>
                <td className="p-3 tabular-nums">{fmtNumber(r.lessons_count)}</td>
                <td className="p-3 tabular-nums">{fmtNumber(r.exams_count)}</td>
                <td className="p-3 tabular-nums">{fmtNumber(r.live_count)}</td>
                <td className="p-3 tabular-nums font-semibold">{fmtNumber(r.activity_events)}</td>
                <td className="p-3 text-xs whitespace-nowrap">{fmtDateTime(r.last_activity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </SectionState>
  );
}

const ALERT_STYLE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline" }> = {
  success: { variant: "default" },
  info: { variant: "secondary" },
  warning: { variant: "outline" },
  critical: { variant: "destructive" },
};

export function AlertsTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [page, setPage] = useState(0);
  const { data, loading, error, reload } = useMonitoringRpc<any>(
    "admin_monitoring_alerts_list",
    { _only_unread: onlyUnread, _limit: PAGE_SIZE, _offset: page * PAGE_SIZE },
    [refreshKey],
  );
  const rows: any[] = data?.rows ?? [];

  const markAll = async () => {
    const { error: err } = await supabase.rpc("admin_monitoring_mark_alerts_read" as never, { _ids: null } as never);
    if (err) toast.error("تعذر تحديث التنبيهات");
    else { toast.success("تم تعليم كل التنبيهات كمقروءة"); reload(); onChanged(); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={onlyUnread ? "default" : "outline"} onClick={() => { setOnlyUnread(!onlyUnread); setPage(0); }}>
          <BellRing className="h-4 w-4 ml-1" /> غير المقروءة فقط
        </Button>
        <Button size="sm" variant="outline" onClick={markAll}>
          <CheckCheck className="h-4 w-4 ml-1" /> تعليم الكل كمقروء
        </Button>
        <Badge variant="secondary">غير مقروء: {fmtNumber(data?.unread)}</Badge>
      </div>
      <SectionState loading={loading} error={error} empty={rows.length === 0} onRetry={reload}>
        <div className="space-y-2">
          {rows.map((a) => (
            <Card key={a.id} className={`p-4 ${a.is_read ? "" : "border-primary/40 bg-primary/5"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={(ALERT_STYLE[a.severity] ?? ALERT_STYLE.info).variant}>{a.title}</Badge>
                    {!a.is_read && <span className="text-[10px] text-primary font-semibold">غير مقروء</span>}
                  </div>
                  <p className="text-sm text-foreground">{a.description ?? "—"}</p>
                  {a.details && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {[
                        a.details.student_name && `الطالب: ${a.details.student_name}`,
                        a.details.student_code && `ID: ${a.details.student_code}`,
                        a.details.teacher_name && `المعلم: ${a.details.teacher_name}`,
                        a.details.group_title && `المجموعة: ${a.details.group_title}`,
                        a.details.subject_name && `المادة: ${a.details.subject_name}`,
                        a.details.amount != null && `القيمة: ${fmtMoney(a.details.amount)}`,
                      ].filter(Boolean).join(" • ")}
                    </p>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">{fmtDateTime(a.created_at)}</span>
              </div>
            </Card>
          ))}
        </div>
        <div className="pt-2">
          <Pager page={page} pageSize={PAGE_SIZE} total={Number(data?.total ?? 0)} onPage={setPage} />
        </div>
      </SectionState>
    </div>
  );
}

export function StudentLookupTab() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { data: list } = useMonitoringRpc<any>("admin_monitoring_student_search", { _search: query || null, _limit: 10 });
  const { data: summary, loading, error, reload } = useMonitoringRpc<any>(
    "admin_monitoring_student_summary",
    { _student_id: selected },
  );
  const rows: any[] = list?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setQuery(search); }}
            placeholder="ابحث عن طالب بالاسم أو الكود أو الـID" />
        </div>
        <Button onClick={() => setQuery(search)}>بحث</Button>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rows.map((r) => (
            <Button key={r.student_id} size="sm" variant={selected === r.student_id ? "default" : "outline"}
              onClick={() => setSelected(r.student_id)}>
              {r.student_name} {r.student_code ? `(${r.student_code})` : ""}
            </Button>
          ))}
        </div>
      )}

      {selected && (
        <SectionState loading={loading} error={error} onRetry={reload}>
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="p-4 space-y-1 text-sm">
              <p className="font-semibold mb-2">البيانات الأساسية</p>
              <p>الاسم: {summary?.profile?.student_name ?? "—"}</p>
              <p>ID: {summary?.profile?.student_code ?? shortId(summary?.profile?.student_id)}</p>
              <p>المرحلة/الصف: {[summary?.profile?.stage, summary?.profile?.grade].filter(Boolean).join(" — ") || "—"}</p>
              <p>نوع التعليم: {summary?.profile?.education_type ?? "—"}</p>
              <p>تاريخ التسجيل: {fmtDateTime(summary?.profile?.created_at)}</p>
            </Card>
            <Card className="p-4 space-y-1 text-sm">
              <p className="font-semibold mb-2">الرصيد والنشاط</p>
              <p>الرصيد: {fmtMoney(summary?.wallet_balance)}</p>
              <p>أحداث آخر 30 يومًا: {fmtNumber(summary?.activity?.events_30d)}</p>
              <p>آخر نشاط: {fmtDateTime(summary?.activity?.last_activity)}</p>
              <p>حصص مباشرة حضرها: {fmtNumber(summary?.live_sessions)}</p>
            </Card>
            <Card className="p-4 space-y-1 text-sm">
              <p className="font-semibold mb-2">استخدام المساعد الذكي</p>
              <p>اليوم: {fmtNumber(summary?.ai?.today)}</p>
              <p>آخر 30 يومًا: {fmtNumber(summary?.ai?.d30)}</p>
              <p>آخر استخدام: {fmtDateTime(summary?.ai?.last_used)}</p>
              <p>اشتراك AI حتى: {summary?.ai?.premium_until ? fmtDateTime(summary.ai.premium_until) : "لا يوجد (مجاني)"}</p>
            </Card>
            <Card className="p-4 space-y-1 text-sm">
              <p className="font-semibold mb-2">الامتحانات</p>
              <p>عدد المحاولات: {fmtNumber(summary?.exams?.attempts)}</p>
              <p>متوسط النسبة: {Number(summary?.exams?.avg_percentage ?? 0).toFixed(1)}%</p>
              <p>أعلى نسبة: {Number(summary?.exams?.best ?? 0).toFixed(1)}%</p>
              <p>آخر امتحان: {fmtDateTime(summary?.exams?.last_attempt_at)}</p>
            </Card>
            <Card className="p-4 md:col-span-2 text-sm">
              <p className="font-semibold mb-2">الاشتراكات</p>
              {(summary?.subscriptions ?? []).length === 0 ? (
                <p className="text-muted-foreground">لا توجد اشتراكات</p>
              ) : (
                <ul className="space-y-1">
                  {(summary?.subscriptions ?? []).map((s: any, i: number) => (
                    <li key={i} className="flex flex-wrap gap-2 items-center">
                      <Badge variant={s.is_active ? "default" : "secondary"}>{s.is_active ? "نشط" : "غير نشط"}</Badge>
                      <span>{s.subject ?? "—"}</span>
                      <span className="text-muted-foreground text-xs">
                        {s.teacher ? `— ${s.teacher}` : ""} {s.end_date ? `— حتى ${fmtDateTime(s.end_date)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </SectionState>
      )}
    </div>
  );
}
