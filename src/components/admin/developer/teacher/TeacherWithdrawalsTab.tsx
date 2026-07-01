import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, DataTableColumn } from "../shared/DataTable";
import { EmptyState } from "../shared/EmptyState";
import { ArrowDownFromLine } from "lucide-react";

interface Row {
  id: string; amount: number; payment_method: string; phone_number: string;
  status: string; admin_message: string | null; created_at: string; processed_at: string | null;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "قيد المراجعة", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  approved: { label: "معتمد", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  paid: { label: "تم الصرف", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  rejected: { label: "مرفوض", cls: "bg-rose-100 text-rose-700 border-rose-200" },
  cancelled: { label: "ملغى", cls: "bg-slate-100 text-slate-700 border-slate-200" },
};

export function TeacherWithdrawalsTab({ teacherId }: { teacherId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["dev-teacher-withdrawals", teacherId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teacher_withdrawal_requests")
        .select("id, amount, payment_method, phone_number, status, admin_message, created_at, processed_at")
        .eq("teacher_id", teacherId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Row[]) || [];
    },
    refetchInterval: 60_000,
  });

  const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");
  const dateFmt = (s: string | null) => s ? new Date(s).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : "—";

  const columns: DataTableColumn<Row>[] = [
    { key: "date", header: "التاريخ", accessor: (r) => dateFmt(r.created_at), sortValue: (r) => r.created_at, exportValue: (r) => dateFmt(r.created_at) },
    { key: "amount", header: "المبلغ", accessor: (r) => <span className="font-bold tabular-nums text-slate-900">{fmt(Number(r.amount))} ج</span>, sortValue: (r) => Number(r.amount), exportValue: (r) => r.amount },
    { key: "method", header: "الوسيلة", accessor: (r) => r.payment_method, exportValue: (r) => r.payment_method },
    { key: "phone", header: "الرقم", accessor: (r) => r.phone_number, exportValue: (r) => r.phone_number },
    { key: "status", header: "الحالة", accessor: (r) => {
      const s = STATUS[r.status] ?? STATUS.pending;
      return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${s.cls}`}>{s.label}</span>;
    }, exportValue: (r) => STATUS[r.status]?.label ?? r.status },
    { key: "processed", header: "معالجة في", accessor: (r) => dateFmt(r.processed_at), exportValue: (r) => dateFmt(r.processed_at) },
    { key: "msg", header: "ملاحظة الإدارة", accessor: (r) => <span className="text-xs text-slate-600">{r.admin_message || "—"}</span>, exportValue: (r) => r.admin_message || "" },
  ];

  if (!isLoading && data.length === 0) {
    return <EmptyState icon={ArrowDownFromLine} title="لا توجد طلبات سحب" description="ستظهر هنا كل طلبات السحب التي قدّمها المعلم." />;
  }

  return (
    <div className="tm-panel">
      <div className="tm-panel-content">
        <h4 className="tm-section-title"><ArrowDownFromLine className="h-4 w-4" /> السحوبات</h4>
        <DataTable
          data={data}
          columns={columns}
          searchable={(r) => `${r.payment_method} ${r.phone_number} ${r.admin_message ?? ""}`}
          title="طلبات السحب"
          exportName={`teacher-withdrawals-${teacherId.slice(0, 8)}`}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
