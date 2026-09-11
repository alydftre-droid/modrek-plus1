import { ReactNode, useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, AlertTriangle, LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export type PeriodKey = "today" | "7d" | "30d" | "month" | "custom";

export interface PeriodValue {
  key: PeriodKey;
  from: string | null;
  to: string | null;
}

export function resolvePeriod(p: PeriodValue): { from: string | null; to: string | null } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  switch (p.key) {
    case "today":
      return { from: startOfDay(now).toISOString(), to: now.toISOString() };
    case "7d":
      return { from: new Date(now.getTime() - 7 * 86400000).toISOString(), to: now.toISOString() };
    case "30d":
      return { from: new Date(now.getTime() - 30 * 86400000).toISOString(), to: now.toISOString() };
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: now.toISOString() };
    case "custom":
      return {
        from: p.from ? new Date(p.from).toISOString() : null,
        to: p.to ? new Date(p.to).toISOString() : null,
      };
  }
}

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "اليوم",
  "7d": "آخر 7 أيام",
  "30d": "آخر 30 يومًا",
  month: "هذا الشهر",
  custom: "فترة مخصصة",
};

export function PeriodPicker({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <Select value={value.key} onValueChange={(k) => onChange({ ...value, key: k as PeriodKey })}>
        <SelectTrigger className="h-10 min-w-0 flex-1 sm:w-[180px] sm:flex-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((k) => (
            <SelectItem key={k} value={k}>{PERIOD_LABELS[k]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.key === "custom" && (
        <>
          <Input
            type="date"
            className="h-10 min-w-[140px] flex-1 sm:w-[150px]"
            value={value.from ?? ""}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
          />
          <Input
            type="date"
            className="h-10 min-w-[140px] flex-1 sm:w-[150px]"
            value={value.to ?? ""}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
          />
        </>
      )}
    </div>
  );
}

/** Calls an admin-only monitoring RPC. Authorization is enforced server-side. */
export function useMonitoringRpc<T = any>(
  fn: string,
  args: Record<string, unknown>,
  deps: unknown[] = [],
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.rpc(fn as never, args as never);
    if (err) {
      setError(err.message || "تعذر تحميل البيانات");
      setData(null);
    } else {
      setData(res as T);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, JSON.stringify(args)]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, ...deps]);

  return { data, loading, error, reload: load };
}

export function fmtNumber(n: number | null | undefined) {
  return new Intl.NumberFormat("ar-EG").format(Number(n ?? 0));
}

export function fmtMoney(n: number | null | undefined) {
  return `${new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(Number(n ?? 0))} ج.م`;
}

export function fmtDateTime(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-EG", {
    timeZone: "Africa/Cairo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export function shortId(id: string | null | undefined) {
  if (!id) return "—";
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export function MetricCard({
  label, value, hint, icon: Icon,
}: { label: string; value: ReactNode; hint?: string; icon?: LucideIcon }) {
  return (
    <Card className="monitoring-metric relative p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-5 text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-extrabold leading-none text-foreground tabular-nums sm:text-[28px]">{value}</p>
          {hint && <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <div className="monitoring-metric__icon flex h-10 w-10 shrink-0 items-center justify-center text-primary">
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </div>
        )}
      </div>
    </Card>
  );
}

export function SectionState({
  loading, error, empty, onRetry, children,
}: {
  loading: boolean; error: string | null; empty?: boolean; onRetry?: () => void; children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
        <span className="text-sm font-medium">جاري تحميل البيانات...</span>
      </div>
    );
  }
  if (error) {
    return (
      <Card className="mx-auto max-w-xl border-destructive/20 p-8 text-center shadow-none space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </div>
        <div><p className="font-bold text-foreground">تعذر عرض البيانات</p><p className="mt-1 text-sm text-muted-foreground">{error}</p></div>
        {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>إعادة المحاولة</Button>}
      </Card>
    );
  }
  if (empty) {
    return <Card className="border-dashed p-12 text-center text-sm text-muted-foreground shadow-none">لا توجد بيانات لهذه الفترة</Card>;
  }
  return <>{children}</>;
}

export function Pager({
  page, pageSize, total, onPage,
}: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <p className="text-xs text-muted-foreground">
        صفحة {fmtNumber(page + 1)} من {fmtNumber(pages)} — إجمالي {fmtNumber(total)}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 0} onClick={() => onPage(page - 1)}>السابق</Button>
        <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>التالي</Button>
      </div>
    </div>
  );
}

export const PAGE_SIZE = 25;
