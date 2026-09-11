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
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value.key} onValueChange={(k) => onChange({ ...value, key: k as PeriodKey })}>
        <SelectTrigger className="w-[160px] h-9">
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
            className="h-9 w-[150px]"
            value={value.from ?? ""}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
          />
          <Input
            type="date"
            className="h-9 w-[150px]"
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
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{value}</p>
          {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
        </div>
        {Icon && (
          <div className="shrink-0 h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Icon className="h-5 w-5" />
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
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> جاري التحميل...
      </div>
    );
  }
  if (error) {
    return (
      <Card className="p-6 text-center space-y-3">
        <AlertTriangle className="h-6 w-6 text-destructive mx-auto" />
        <p className="text-sm text-muted-foreground">{error}</p>
        {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>إعادة المحاولة</Button>}
      </Card>
    );
  }
  if (empty) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">لا توجد بيانات لهذه الفترة</Card>;
  }
  return <>{children}</>;
}

export function Pager({
  page, pageSize, total, onPage,
}: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-2 pt-3">
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
