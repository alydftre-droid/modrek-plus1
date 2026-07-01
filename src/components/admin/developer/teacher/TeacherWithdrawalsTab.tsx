import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { withSupabaseTimeout } from "@/lib/supabaseQueryTimeout";
import { DataTable, DataTableColumn } from "../shared/DataTable";
import { EmptyState } from "../shared/EmptyState";
import { ArrowDownFromLine } from "lucide-react";

interface Row {
  id: string; amount: number; payment_method: string; phone_number: string;
  status: string; admin_message: string | null; created_at: string; processed_at: string | null;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending:    { label: "قيد المراجعة", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  approved:   { label: "قيد التنفيذ",  cls: "bg-blue-100 text-blue-700 border-blue-200" },
  paid:       { label: "تمت",           cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  rejected:   { label: "مرفوضة",        cls: "bg-rose-100 text-rose-700 border-rose-200" },
  cancelled:  { label: "ملغاة",         cls: "bg-slate-100 text-slate-700 border-slate-200" },
};

const FILTER_TABS: { key: string; label: string }[] = [
  { key: "all",       label: "الكل" },
  { key: "pending",   label: "معلقة" },
  { key: "approved",  label: "قيد التنفيذ" },
  { key: "paid",      label: "تمت" },
  { key: "rejected",  label: "مرفوضة" },
];

export function TeacherWithdrawalsTab({ teacherId }: { teacherId: string }) {
  const [status, setStatus] = useState<string>("all");

  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ["dev-teacher-withdrawals", teacherId],
    queryFn: async () => {
      const { data, error } = await withSupabaseTimeout(supabase
        .from("teacher_withdrawal_requests")
        .select("id, amount, payment_method, phone_number, status, admin_message, created_at, processed_at")
        .eq("teacher_id", teacherId)
        .order("created_at", { ascending: false }), "سحوبات المعلم");
      if (error) throw error;
      return (data as unknown as Row[]) || [];
    },
    refetchInterval: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (isError) toast.error("تعذر تحميل السحوبات", { description: (error as Error)?.message });
  }, [isError, error]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data.length };
    data.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [data]);

  const filtered = useMemo(
    () => (status === "all" ? data : data.filter((r) => r.status === status)),
    [data, status],
  );

  const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");
  const dateFmt = (s: string | null) =>
    s ? new Date(s).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : "—";

  const columns: DataTableColumn<Row>[] = [
    { key: "date", header: "تاريخ الطلب", accessor: (r) => dateFmt(r.created_at), sortValue: (r) => r.created_at, exportValue: (r) => dateFmt(r.created_at) },
    { key: "amount", header: "المبلغ", accessor: (r) => <span className="font-bold tabular-nums text-slate-900">{fmt(Number(r.amount))} ج</span>, sortValue: (r) => Number(r.amount), exportValue: (r) => r.amount },
    { key: "method", header: "طريقة السحب", accessor: (r) => r.payment_method, exportValue: (r) => r.payment_method },
    { key: "phone", header: "رقم المحفظة", accessor: (r) => <span className="tabular-nums text-xs">{r.phone_number}</span>, exportValue: (r) => r.phone_number },
    { key: "status", header: "الحالة", accessor: (r) => {
        const s = STATUS[r.status] ?? STATUS.pending;
        return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${s.cls}`}>{s.label}</span>;
      }, exportValue: (r) => STATUS[r.status]?.label ?? r.status },
    { key: "processed", header: "تاريخ المعالجة", accessor: (r) => dateFmt(r.processed_at), exportValue: (r) => dateFmt(r.processed_at) },
    { key: "msg", header: "السبب / ملاحظة", accessor: (r) => <span className="text-xs text-slate-600">{r.admin_message || "—"}</span>, exportValue: (r) => r.admin_message || "" },
  ];

  return (
    <div className="tm-panel">
      <div className="tm-panel-content space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="tm-section-title !mb-0"><ArrowDownFromLine className="h-4 w-4" /> السحوبات</h4>
          <span className="tm-chip tm-chip--mint !min-h-7 !text-xs">{filtered.length.toLocaleString("ar-EG")} طلب</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map((t) => {
            const active = status === t.key;
            const n = counts[t.key] ?? 0;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setStatus(t.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  active
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {t.label}
                <span className={`mr-1 tabular-nums ${active ? "opacity-90" : "text-slate-400"}`}>({n.toLocaleString("ar-EG")})</span>
              </button>
            );
          })}
        </div>

        {!isLoading && data.length === 0 ? (
          <EmptyState icon={ArrowDownFromLine} title="لا توجد طلبات سحب" description="ستظهر هنا كل طلبات السحب التي قدّمها المعلم." />
        ) : (
          <DataTable
            data={filtered}
            columns={columns}
            searchable={(r) => `${r.payment_method} ${r.phone_number} ${r.admin_message ?? ""}`}
            title="طلبات السحب"
            exportName={`teacher-withdrawals-${teacherId.slice(0, 8)}`}
            isLoading={isLoading}
          />
        )}
      </div>
    </div>
  );
}
