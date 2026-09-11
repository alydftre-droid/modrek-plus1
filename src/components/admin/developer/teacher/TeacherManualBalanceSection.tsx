import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Minus, Gift, Loader2, Wallet } from "lucide-react";

type OpType = "admin_credit" | "admin_debit" | "admin_bonus";

const OPS: { key: OpType; label: string; icon: any; classes: string; sign: 1 | -1 }[] = [
  { key: "admin_credit", label: "إضافة رصيد", icon: Plus, classes: "bg-emerald-600 hover:bg-emerald-700", sign: 1 },
  { key: "admin_debit", label: "خصم رصيد", icon: Minus, classes: "bg-rose-600 hover:bg-rose-700", sign: -1 },
  { key: "admin_bonus", label: "مكافأة", icon: Gift, classes: "bg-amber-500 hover:bg-amber-600", sign: 1 },
];

export function TeacherManualBalanceSection({ teacherId }: { teacherId: string }) {
  const qc = useQueryClient();
  const [op, setOp] = useState<OpType>("admin_credit");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: balance } = useQuery({
    queryKey: ["teacher-wallet-balance", teacherId],
    queryFn: async () => {
      const { data } = await supabase.from("teacher_wallets").select("balance").eq("teacher_id", teacherId).maybeSingle();
      return Number((data as any)?.balance ?? 0);
    },
    refetchInterval: 60_000,
  });

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("أدخل مبلغاً صحيحاً أكبر من صفر"); return; }
    const meta = OPS.find((o) => o.key === op)!;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("admin_adjust_teacher_wallet" as any, {
        _teacher_id: teacherId,
        _amount: amt * meta.sign,
        _transaction_type: op,
        _description: description || null,
        _admin_message: message || null,
      });
      if (error) throw error;
      const r = data as any;
      if (!r?.success) throw new Error(r?.error || "فشل التعديل");
      toast.success("تم تعديل الرصيد بنجاح");
      setAmount(""); setDescription(""); setMessage("");
      qc.invalidateQueries({ queryKey: ["teacher-wallet-balance", teacherId] });
      qc.invalidateQueries({ queryKey: ["dev-teacher-wallet-monthly", teacherId] });
      qc.invalidateQueries({ queryKey: ["dev-teacher-overview-v3", teacherId] });
    } catch (e: any) {
      toast.error(e?.message || "خطأ في تعديل الرصيد");
    } finally {
      setBusy(false);
    }
  };

  const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");

  return (
    <div className="tm-panel">
      <div className="tm-panel-content space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h4 className="tm-section-title !mb-0">
            <Wallet className="h-4 w-4" /> إدارة الرصيد يدوياً
          </h4>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-sm">
            <span className="text-slate-600">الرصيد الحالي:</span>{" "}
            <span className="font-black text-emerald-700 text-base tabular-nums">{fmt(balance ?? 0)} ج</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {OPS.map((o) => {
            const Icon = o.icon;
            const active = op === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => setOp(o.key)}
                className={`rounded-xl py-3 px-2 font-black text-sm inline-flex items-center justify-center gap-1.5 transition ${
                  active ? `${o.classes} text-white shadow-md` : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Icon className="h-4 w-4" /> {o.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-bold text-slate-700">المبلغ (جنيه)</Label>
            <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="مثلاً: 250" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-bold text-slate-700">سبب العملية</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="سبب داخلي (يظهر في السجل)" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-bold text-slate-700">رسالة للمعلم (اختياري)</Label>
            <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="ملاحظة تصل للمعلم مع الإشعار" />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className="tm-submit-btn w-full inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          تنفيذ العملية
        </button>
      </div>
    </div>
  );
}
