import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withSupabaseTimeout } from "@/lib/supabaseQueryTimeout";
import { StatCard } from "../shared/StatCard";
import { EmptyState } from "../shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthPicker } from "../shared/MonthPicker";
import { DataTable, DataTableColumn } from "../shared/DataTable";
import { Wallet, DollarSign, Lock, TrendingUp, Receipt, RefreshCw } from "lucide-react";
import TeacherCommissionCard from "@/components/admin/TeacherCommissionCard";
import { TeacherManualBalanceSection } from "./TeacherManualBalanceSection";

interface WalletData {
  period: string;
  wallet: { balance: number; total_earned: number; frozen_balance: number; current_period: string };
  period_earned: number;
  earnings_count: number;
  transactions: Array<{ id: string; amount: number; transaction_type: string; description: string | null; balance_after: number | null; created_at: string }>;
  withdrawals: any[];
  archive: any;
}

const TX_LABELS: Record<string, string> = {
  earning: "إيراد",
  withdrawal: "سحب",
  deposit: "إيداع",
  admin_credit: "إضافة إدارية",
  admin_debit: "خصم إداري",
  frozen_release: "إفراج مجمّد",
};

export function TeacherWalletTab({ teacherId }: { teacherId: string }) {
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dev-teacher-wallet-monthly", teacherId, period],
    queryFn: async () => {
      const { data, error } = await withSupabaseTimeout(supabase.rpc("get_developer_teacher_wallet_monthly", { _teacher_id: teacherId, _period: period }), "محفظة المعلم") ;
      if (error) throw error;
      return data as unknown as WalletData;
    },
    refetchInterval: 60_000,
    retry: false,
  });

  if (isError) {
    return (
      <div className="tm-panel">
        <div className="tm-panel-content text-center space-y-3">
          <h3 className="tm-section-title justify-center">تعذر تحميل المحفظة</h3>
          <button type="button" onClick={() => refetch()} className="tm-submit-btn px-6 inline-flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4" /> إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return <div className="tm-stats-grid">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-44 rounded-[18px] bg-white" />)}</div>;
  }

  const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");
  const dateFmt = (s: string) => new Date(s).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });

  const columns: DataTableColumn<WalletData["transactions"][number]>[] = [
    { key: "date", header: "التاريخ", accessor: (r) => dateFmt(r.created_at), sortValue: (r) => r.created_at, exportValue: (r) => dateFmt(r.created_at) },
    { key: "type", header: "النوع", accessor: (r) => TX_LABELS[r.transaction_type] || r.transaction_type, exportValue: (r) => TX_LABELS[r.transaction_type] || r.transaction_type },
    { key: "desc", header: "الوصف", accessor: (r) => r.description || "—", exportValue: (r) => r.description || "" },
    { key: "amount", header: "المبلغ", accessor: (r) => <span className={`font-bold tabular-nums ${Number(r.amount) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{Number(r.amount) >= 0 ? "+" : ""}{fmt(Number(r.amount))} ج</span>, sortValue: (r) => Number(r.amount), exportValue: (r) => r.amount },
    { key: "after", header: "الرصيد بعد", accessor: (r) => r.balance_after != null ? `${fmt(Number(r.balance_after))} ج` : "—", exportValue: (r) => r.balance_after ?? "" },
  ];

  return (
    <div className="space-y-4">
      <div className="tm-panel">
        <div className="tm-panel-content flex items-center justify-between flex-wrap gap-2">
        <p className="tm-section-title !mb-0 text-base">تفاصيل المحفظة عن شهر:</p>
        <MonthPicker value={period} onChange={setPeriod} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="الرصيد الحالي" value={`${fmt(data.wallet.balance)} ج`} icon={Wallet} accent="emerald" />
        <StatCard label="إجمالي الأرباح" value={`${fmt(data.wallet.total_earned)} ج`} icon={DollarSign} accent="amber" />
        <StatCard label="مجمّد" value={`${fmt(data.wallet.frozen_balance)} ج`} icon={Lock} accent="slate" />
        <StatCard label={`أرباح ${period}`} value={`${fmt(data.period_earned)} ج`} icon={TrendingUp} accent="violet" hint={`${data.earnings_count} عملية`} />
      </div>

      {data.archive && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm">
          <div className="flex items-center gap-2 font-bold text-emerald-900">
            <Receipt className="h-4 w-4" /> أرشيف الشهر
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
            <div><span className="text-slate-500">إجمالي:</span> <span className="font-bold">{fmt(Number(data.archive.total_earned))} ج</span></div>
            <div><span className="text-slate-500">مشتركون:</span> <span className="font-bold">{fmt(data.archive.total_subscribers)}</span></div>
            <div><span className="text-slate-500">مجموعات:</span> <span className="font-bold">{fmt(data.archive.total_groups)}</span></div>
            <div><span className="text-slate-500">عمولة:</span> <span className="font-bold">{data.archive.commission_rate}%</span></div>
          </div>
        </div>
      )}

      {data.transactions.length === 0 ? (
        <EmptyState icon={Wallet} title="لا توجد معاملات في هذا الشهر" />
      ) : (
        <div className="tm-panel">
          <div className="tm-panel-content">
            <DataTable
              data={data.transactions}
              columns={columns}
              searchable={(r) => `${r.description ?? ""} ${r.transaction_type}`}
              title="سجل معاملات المحفظة"
              exportName={`wallet-${period}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
