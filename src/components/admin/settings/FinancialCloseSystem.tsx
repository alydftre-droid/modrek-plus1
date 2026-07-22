import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  Loader2, CalendarCheck2, Sparkles, ShieldCheck, AlertTriangle, Wallet,
  Snowflake, TrendingUp, Coins, Landmark, Users, Activity, CheckCircle2,
  ArrowUpRight, History, FileText, ChevronRight, Archive, Crown,
} from "lucide-react";
import { toast } from "sonner";

const fmt = (n: any) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: any) => Number(n || 0).toLocaleString("ar-EG");
const fmtDate = (v: any) =>
  v ? new Date(v).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" }) : "—";

// =============================================================
// SECTION: Close-Month button (lives inside ClosingTab)
// =============================================================
export function FinancialCloseSection({ onDone }: { onDone: () => void }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [closing, setClosing] = useState(false);
  const [lastCloseAt, setLastCloseAt] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("platform_settings" as any)
        .select("value")
        .eq("key", "financial_last_close_at")
        .maybeSingle();
      setLastCloseAt((data as any)?.value || null);
    })();
  }, []);

  const openPreview = async () => {
    setLoading(true);
    setPreviewOpen(true);
    try {
      const { data, error } = await supabase.rpc("admin_financial_close_preview" as any);
      if (error) throw error;
      const r = data as any;
      if (!r?.success) throw new Error(r?.error || "فشل تحميل المعاينة");
      setPreview(r.snapshot);
    } catch (e: any) {
      toast.error(e?.message || "فشل تحميل المعاينة");
      setPreviewOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const executeClose = async () => {
    setClosing(true);
    try {
      const { data, error } = await supabase.rpc("admin_close_financial_month" as any, {
        _notes: notes || null,
      });
      if (error) throw error;
      const r = data as any;
      if (!r?.success) throw new Error(r?.error || "فشل إقفال الشهر");
      toast.success(`تم إقفال الشهر وحفظه (${r.period_label})`);
      setConfirmOpen(false);
      setPreviewOpen(false);
      setNotes("");
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "فشل الإقفال — لم يتم تصفير أي بيانات");
    } finally {
      setClosing(false);
    }
  };

  return (
    <>
      <Card className="border-0 shadow-lg overflow-hidden">
        <div className="p-4 text-white bg-gradient-to-br from-fuchsia-700 via-purple-700 to-indigo-800">
          <div className="flex items-center gap-2 mb-1">
            <CalendarCheck2 className="h-4 w-4" />
            <p className="font-black text-sm">إقفال شهر مالي جديد — Monthly Closing</p>
          </div>
          <p className="text-[11px] opacity-95 leading-relaxed">
            يحفظ نسخة رسمية دائمة (Immutable Snapshot) بكل بيانات لوحة المطور،
            ثم يبدأ فترة مالية جديدة من الصفر. لا يمس أرصدة المعلمين أو نظام
            التجميد/الإفراج.
          </p>
        </div>
        <CardContent className="p-3 bg-fuchsia-50 space-y-2">
          <Button
            onClick={openPreview}
            className="w-full h-11 gap-2 text-white border-0 shadow-md bg-gradient-to-r from-fuchsia-700 to-indigo-700 hover:from-fuchsia-800 hover:to-indigo-800 font-black"
          >
            <Sparkles className="h-4 w-4" /> بدء شهر مالي جديد
          </Button>
          {lastCloseAt && (
            <p className="text-[10px] text-slate-600 text-center">
              آخر إقفال: {fmtDate(lastCloseAt)}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[92vh] p-0 overflow-hidden flex flex-col bg-white text-slate-950">
          <DialogHeader className="p-4 bg-gradient-to-br from-fuchsia-700 via-purple-700 to-indigo-800 text-white">
            <DialogTitle className="flex items-center gap-2 text-white text-base">
              <CalendarCheck2 className="h-4 w-4" /> معاينة إقفال الشهر
            </DialogTitle>
            <DialogDescription className="text-white/90 text-[11px] leading-relaxed">
              راجع بيانات الفترة الحالية قبل التأكيد. عند التأكيد يُحفظ كل شيء
              كسجل رسمي دائم ثم يبدأ شهر مالي جديد.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 p-4">
            {loading || !preview ? (
              <div className="space-y-2">
                {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
            ) : (
              <FinancialSnapshotView snapshot={preview} isPreview />
            )}
          </ScrollArea>

          <div className="p-4 border-t bg-slate-50 space-y-2">
            <Label className="text-[11px] font-black text-slate-900">ملاحظة (اختياري)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: إقفال شهر يوليو"
              className="bg-white border-slate-300 text-slate-950"
            />
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1 h-11 border-slate-300 text-slate-800"
                onClick={() => setPreviewOpen(false)}
              >إلغاء</Button>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={loading || !preview}
                className="flex-1 h-11 gap-2 text-white border-0 shadow-md bg-gradient-to-r from-fuchsia-700 to-indigo-700 hover:from-fuchsia-800 hover:to-indigo-800 font-black"
              >
                <ShieldCheck className="h-4 w-4" /> تأكيد الإقفال
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl" className="bg-white text-slate-950">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-slate-950">
              <AlertTriangle className="h-5 w-5 text-fuchsia-700" /> تأكيد نهائي لإقفال الشهر
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-700 leading-relaxed">
              سيتم حفظ نسخة كاملة ودائمة (Immutable) من صفحة إعدادات السحب
              الحالية، ثم يبدأ شهر مالي جديد ابتداءً من هذه اللحظة.
              <br /><br />
              <strong>لن يتم لمس أرصدة المعلمين، الأرصدة المجمّدة، أو أرشيف
              المعلمين</strong>. لا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-100 text-slate-900 border-slate-300">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeClose}
              disabled={closing}
              className="bg-gradient-to-r from-fuchsia-700 to-indigo-700 hover:from-fuchsia-800 hover:to-indigo-800 text-white"
            >
              {closing ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              نعم، أقفل الشهر
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// =============================================================
// REPLICA VIEWER: renders a closing snapshot as if it were the live page
// =============================================================
export function FinancialCloseReplicaDialog({
  id, open, onOpenChange,
}: { id: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!open || !id) { setData(null); return; }
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("admin_get_financial_close" as any, { _id: id });
        if (error) throw error;
        const r = data as any;
        if (!r?.success) throw new Error(r?.error || "فشل التحميل");
        setData(r);
      } catch (e: any) {
        toast.error(e?.message || "فشل تحميل النسخة");
        onOpenChange(false);
      } finally { setLoading(false); }
    })();
  }, [id, open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[95vh] p-0 overflow-hidden flex flex-col bg-white text-slate-950">
        <DialogHeader className="p-4 bg-gradient-to-br from-slate-950 via-blue-800 to-emerald-600 text-white shrink-0">
          <DialogTitle className="flex items-center gap-2 text-white text-base">
            <Archive className="h-4 w-4" /> نسخة طبق الأصل — سجل مالي رسمي
          </DialogTitle>
          <DialogDescription className="text-white/90 text-[11px] leading-relaxed">
            {data ? (
              <>
                فترة: <strong>{data.period_label}</strong> • أُقفل في {fmtDate(data.created_at)}
              </>
            ) : "…"}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1">
          <div className="p-4">
            {loading || !data ? (
              <div className="space-y-2">
                {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            ) : (
              <FinancialSnapshotView snapshot={data.snapshot} notes={data.notes} />
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================
// Snapshot renderer (used by preview + replica)
// =============================================================
function FinancialSnapshotView({ snapshot, notes, isPreview }: { snapshot: any; notes?: string | null; isPreview?: boolean }) {
  const s = snapshot || {};
  const kpis = useMemo(() => ([
    { label: "متاح للسحب", value: `${fmt(s.total_available)} ج`, icon: Wallet, tint: "from-emerald-500 to-green-500" },
    { label: "مجمّد", value: `${fmt(s.total_frozen)} ج`, icon: Snowflake, tint: "from-cyan-500 to-blue-500" },
    { label: "إيراد الشهر (إجمالي)", value: `${fmt(s.month_gross)} ج`, icon: TrendingUp, tint: "from-violet-500 to-purple-500" },
    { label: "نصيب المعلمين", value: `${fmt(s.month_teacher_net)} ج`, icon: Coins, tint: "from-amber-500 to-orange-500" },
    { label: "عمولة المنصة", value: `${fmt(s.month_platform_cut)} ج`, icon: Landmark, tint: "from-fuchsia-500 to-pink-500" },
    { label: "طلاب دفعوا", value: fmtInt(s.month_paying_students), icon: Users, tint: "from-teal-500 to-emerald-600" },
    { label: "اشتراكات الشهر", value: fmtInt(s.month_subscriptions), icon: Sparkles, tint: "from-blue-500 to-indigo-500" },
    { label: "مجموعات فعّالة", value: fmtInt(s.active_groups), icon: Activity, tint: "from-slate-500 to-gray-600" },
    { label: "طلبات معلقة", value: fmtInt(s.pending_requests), icon: AlertTriangle, tint: "from-orange-500 to-red-500" },
    { label: "مسحوبات مكتملة", value: `${fmt(s.approved_total)} ج`, icon: CheckCircle2, tint: "from-teal-500 to-emerald-600" },
    { label: "متوسط أرباح معلم", value: `${fmt(s.avg_teacher_earnings_month)} ج`, icon: Users, tint: "from-indigo-500 to-blue-600" },
    { label: "إجمالي الأرباح (كل الوقت)", value: `${fmt(s.total_earned_all_time)} ج`, icon: History, tint: "from-slate-500 to-gray-600" },
  ]), [s]);

  return (
    <div className="space-y-4">
      {/* Header hero */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-950 via-blue-800 to-emerald-600 text-white p-4 shadow-lg">
        <div className="flex items-center gap-2 text-[10px] opacity-90 mb-1">
          <Sparkles className="h-3.5 w-3.5" /> مركز التحكم المالي — لقطة
        </div>
        <p className="text-2xl font-black tracking-tight">
          {fmt((s.total_available || 0) + (s.total_frozen || 0))} ج
        </p>
        <p className="text-[11px] mt-1 opacity-90">
          إجمالي أرصدة المعلمين • {fmtInt(s.total_teachers)} معلم
        </p>
        <p className="text-[10px] mt-2 opacity-80">
          الفترة: {fmtDate(s.period_start)} → {fmtDate(s.period_end)}
        </p>
        {isPreview && (
          <div className="mt-3 rounded-lg bg-white/10 p-2 text-[11px] font-semibold flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5" /> هذه معاينة — لم يتم الحفظ بعد
          </div>
        )}
        {notes && (
          <div className="mt-2 rounded-lg bg-white/10 p-2 text-[11px]">📝 {notes}</div>
        )}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {kpis.map((k, i) => (
          <Card key={i} className="border border-slate-200 bg-white shadow-md overflow-hidden">
            <CardContent className="p-3">
              <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${k.tint} text-white flex items-center justify-center mb-2 shadow-sm`}>
                <k.icon className="h-4 w-4" />
              </div>
              <p className="text-[10px] text-slate-600 font-bold leading-tight">{k.label}</p>
              <p className="text-sm font-extrabold mt-0.5 truncate text-slate-950">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Top teacher */}
      {s.top_teacher?.name && (
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-amber-400 via-yellow-500 to-orange-500 p-4 text-white flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Crown className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] opacity-90">صاحب أعلى دخل</p>
              <p className="font-bold truncate">{s.top_teacher.name}</p>
            </div>
            <p className="text-lg font-black shrink-0">{fmt(s.top_teacher.earnings)} ج</p>
          </div>
        </Card>
      )}

      {/* Revenue chart */}
      {Array.isArray(s.revenue_series) && s.revenue_series.length > 0 && (
        <Card className="border border-slate-200 shadow-md bg-white">
          <CardContent className="p-4">
            <p className="font-black text-sm text-slate-950 mb-1">إيرادات آخر 6 أشهر</p>
            <p className="text-[10px] text-slate-600 font-semibold mb-2">إجمالي vs نصيب المعلمين</p>
            <div className="h-48 -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={s.revenue_series || []}>
                  <defs>
                    <linearGradient id="rs1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="rs2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" fontSize={10} stroke="#64748b" />
                  <YAxis fontSize={10} stroke="#64748b" />
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 11 }} />
                  <Area type="monotone" dataKey="gross" stroke="#4f46e5" fill="url(#rs1)" name="إجمالي" />
                  <Area type="monotone" dataKey="teacher_net" stroke="#10b981" fill="url(#rs2)" name="نصيب المعلم" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <BreakdownTable
        title="أرباح المعلمين خلال الفترة"
        icon={Users}
        rows={s.breakdown_teachers || []}
        columns={[
          { key: "name", label: "المعلم" },
          { key: "net_amount", label: "الصافي", money: true },
          { key: "gross_amount", label: "الإجمالي", money: true },
          { key: "platform_cut", label: "العمولة", money: true },
          { key: "subscriptions", label: "اشتراكات" },
          { key: "students", label: "طلاب" },
          { key: "groups", label: "مجموعات" },
        ]}
      />

      <BreakdownTable
        title="أرباح كل صف دراسي"
        icon={Activity}
        rows={s.breakdown_grades || []}
        columns={[
          { key: "stage", label: "المرحلة" },
          { key: "grade", label: "الصف" },
          { key: "net_amount", label: "الصافي", money: true },
          { key: "gross_amount", label: "الإجمالي", money: true },
          { key: "subscriptions", label: "اشتراكات" },
          { key: "students", label: "طلاب" },
          { key: "groups", label: "مجموعات" },
        ]}
      />

      <BreakdownTable
        title="أرباح المواد"
        icon={FileText}
        rows={s.breakdown_subjects || []}
        columns={[
          { key: "subject", label: "المادة" },
          { key: "net_amount", label: "الصافي", money: true },
          { key: "gross_amount", label: "الإجمالي", money: true },
          { key: "subscriptions", label: "اشتراكات" },
          { key: "students", label: "طلاب" },
        ]}
      />

      <BreakdownTable
        title="المجموعات الفعّالة"
        icon={Sparkles}
        rows={s.breakdown_groups || []}
        columns={[
          { key: "group_title", label: "المجموعة" },
          { key: "teacher_name", label: "المعلم" },
          { key: "net_amount", label: "الصافي", money: true },
          { key: "gross_amount", label: "الإجمالي", money: true },
          { key: "subscriptions", label: "اشتراكات" },
          { key: "students", label: "طلاب" },
        ]}
      />

      <BreakdownTable
        title="عمليات السحب خلال الفترة"
        icon={ArrowUpRight}
        rows={s.period_withdrawals || []}
        columns={[
          { key: "teacher_name", label: "المعلم" },
          { key: "amount", label: "المبلغ", money: true },
          { key: "status", label: "الحالة" },
          { key: "created_at", label: "تاريخ الطلب", date: true },
          { key: "processed_at", label: "تاريخ التنفيذ", date: true },
        ]}
      />

      <BreakdownTable
        title="الحركات المالية على المحافظ"
        icon={History}
        rows={(s.period_transactions || []).slice(0, 300)}
        columns={[
          { key: "teacher_name", label: "المعلم" },
          { key: "transaction_type", label: "النوع" },
          { key: "amount", label: "المبلغ", money: true },
          { key: "balance_after", label: "الرصيد بعد", money: true },
          { key: "created_at", label: "التاريخ", date: true },
        ]}
        footNote={(s.period_transactions || []).length > 300 ? `عرض 300 من ${(s.period_transactions).length} حركة` : undefined}
      />
    </div>
  );
}

function BreakdownTable({
  title, icon: Icon, rows, columns, footNote,
}: {
  title: string; icon: any;
  rows: any[];
  columns: { key: string; label: string; money?: boolean; date?: boolean }[];
  footNote?: string;
}) {
  return (
    <Card className="border border-slate-200 shadow-md bg-white overflow-hidden">
      <CardContent className="p-0">
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-700" />
          <p className="font-black text-sm text-slate-950">{title}</p>
          <span className="mr-auto text-[10px] text-slate-600 font-semibold">
            {fmtInt(rows.length)} سجل
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="p-6 text-center text-[11px] text-slate-500">لا توجد بيانات في هذه الفترة</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className="px-2 py-2 text-right font-black whitespace-nowrap">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    {columns.map((c) => (
                      <td key={c.key} className="px-2 py-2 text-slate-800 whitespace-nowrap">
                        {c.money
                          ? `${fmt(r[c.key])} ج`
                          : c.date
                            ? fmtDate(r[c.key])
                            : (r[c.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {footNote && <div className="p-2 text-[10px] text-slate-500 text-center bg-slate-50 border-t">{footNote}</div>}
      </CardContent>
    </Card>
  );
}

// =============================================================
// Archive list item badge helper
// =============================================================
export function ClosingBadge({ isClosing }: { isClosing?: boolean }) {
  if (!isClosing) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-100 text-fuchsia-800 px-2 py-0.5 text-[9px] font-black border border-fuchsia-300">
      <CalendarCheck2 className="h-3 w-3" /> إقفال شهر
    </span>
  );
}

// =============================================================
// Archive card (list entry) — trigger button that opens replica
// =============================================================
export function ClosingArchiveButton({ row, onOpen }: { row: any; onOpen: (id: string) => void }) {
  return (
    <button
      onClick={() => onOpen(row.id)}
      className="w-full text-right border-2 rounded-xl p-3 transition-all bg-white border-fuchsia-200 hover:bg-fuchsia-50 hover:border-fuchsia-500"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-fuchsia-700 to-indigo-700 text-white flex items-center justify-center shadow-sm">
            <Archive className="h-4 w-4" />
          </div>
          <div>
            <p className="font-black text-sm text-slate-950" dir="ltr">{row.period_label}</p>
            <p className="text-[9px] text-slate-600">
              {fmtDate(row.created_at)}
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-fuchsia-700 rotate-180" />
      </div>
      {row.notes && (
        <p className="text-[10px] text-slate-700 bg-slate-50 rounded p-1.5 mb-1.5 truncate">📝 {row.notes}</p>
      )}
      <div className="grid grid-cols-4 gap-1.5 text-[10px]">
        <MiniStat label="متاح" value={`${fmt(row.total_available)} ج`} />
        <MiniStat label="مجمّد" value={`${fmt(row.total_frozen)} ج`} />
        <MiniStat label="إيراد" value={`${fmt(row.month_gross)} ج`} />
        <MiniStat label="اشتراكات" value={fmtInt(row.month_subscriptions)} />
      </div>
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-fuchsia-50 border border-fuchsia-200 p-1.5 text-center">
      <p className="text-[9px] text-fuchsia-800 font-bold truncate">{label}</p>
      <p className="text-[10px] text-slate-950 font-black truncate">{value}</p>
    </div>
  );
}
