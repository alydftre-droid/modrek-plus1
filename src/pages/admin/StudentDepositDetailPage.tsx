import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft, Copy, Download, ExternalLink, FileSpreadsheet, History, Image as ImageIcon,
  Loader2, Printer, RefreshCw, ShieldCheck, User, Wallet, ZoomIn, ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { usePrivateFileUrl } from "@/hooks/usePrivateFileUrl";
import { exportXlsx } from "@/components/admin/notifications/exports";
import {
  depositTypeLabel, fmtDate, fmtDateTime, fmtMoney, fmtTime, operationNumber,
  paymentMethodLabel, shortId, statusMeta,
} from "@/components/admin/student-wallet/depositMeta";

interface Detail {
  request: any;
  student: any;
  processed_by_name: string | null;
  wallet_balance: number | null;
  adjustment: any;
  student_deposits: any[];
  audit_logs: any[];
}

const copy = async (value?: string | null, label = "تم النسخ") => {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast.success(label);
  } catch {
    toast.error("تعذر النسخ");
  }
};

const Row = ({ label, value, mono, copyValue }: { label: string; value: any; mono?: boolean; copyValue?: string | null }) => (
  <div className="flex items-start justify-between gap-3 border-b border-border/60 py-2 last:border-0">
    <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
    <span className={`flex items-center gap-1.5 text-right text-xs font-medium text-foreground ${mono ? "font-mono" : ""}`}>
      {value ?? "—"}
      {copyValue && (
        <button type="button" onClick={() => copy(copyValue)} className="text-muted-foreground hover:text-primary">
          <Copy className="h-3 w-3" />
        </button>
      )}
    </span>
  </div>
);

const Section = ({ title, icon: Icon, children, action }: any) => (
  <section className="rounded-2xl border border-border bg-card p-4">
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h2>
      {action}
    </div>
    {children}
  </section>
);

const AUDIT_ACTION_LABELS: Record<string, string> = {
  deposit_request_created: "إنشاء الطلب",
  deposit_approved: "الموافقة على الطلب",
  deposit_rejected: "رفض الطلب",
  student_wallet_credit: "إضافة رصيد للطالب",
  admin_manual_wallet_action: "إجراء يدوي على المحفظة",
};

export default function StudentDepositDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [zoom, setZoom] = useState(1);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("admin_get_student_deposit", { _id: id });
      if (error) throw error;
      setDetail(data as Detail);
    } catch (e) {
      console.error(e);
      toast.error("تعذر تحميل تفاصيل العملية");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`admin-deposit-${id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "deposit_requests", filter: `id=eq.${id}` },
        () => fetchDetail())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchDetail]);

  const req = detail?.request;
  const student = detail?.student;
  const receiptUrl = usePrivateFileUrl("payment-receipts", req?.receipt_url);
  const meta = statusMeta(req?.status ?? "");

  // Ledger من سجل الإيداعات المعتمدة للطالب (بيانات حقيقية)
  const ledger = useMemo(() => {
    const list = (detail?.student_deposits ?? [])
      .filter((d) => ["approved", "processed"].includes(d.status))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let running = 0;
    let before: number | null = null;
    for (const d of list) {
      if (d.id === req?.id) { before = running; }
      running += Number(d.amount || 0);
    }
    return {
      before,
      added: Number(req?.amount ?? 0),
      after: before === null ? null : before + Number(req?.amount ?? 0),
      totalApproved: running,
    };
  }, [detail, req]);

  const activity = useMemo(() => {
    if (!req) return [];
    const items: { label: string; at: string; by?: string | null }[] = [
      { label: "إنشاء طلب الإيداع", at: req.created_at, by: student?.full_name },
    ];
    if (req.receipt_url) items.push({ label: "رفع صورة إثبات الدفع", at: req.created_at, by: student?.full_name });
    if (req.processed_at) {
      items.push({
        label: req.status === "rejected" ? "رفض الطلب" : "الموافقة على الطلب وإضافة الرصيد",
        at: req.processed_at,
        by: detail?.processed_by_name,
      });
    }
    if (req.admin_message) items.push({ label: "إضافة ملاحظات الإدارة", at: req.updated_at, by: detail?.processed_by_name });
    if (req.updated_at && req.updated_at !== req.created_at) {
      items.push({ label: "آخر تعديل على الطلب", at: req.updated_at, by: detail?.processed_by_name });
    }
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [req, student, detail]);

  const doExcel = () => {
    if (!req) return;
    exportXlsx(`deposit-${operationNumber(req.id)}`, [{
      "رقم العملية": operationNumber(req.id),
      "معرف العملية": req.id,
      "الطالب": student?.full_name ?? "—",
      "ID الطالب": student?.student_code ?? shortId(student?.id),
      "البريد": student?.email ?? "—",
      "الهاتف": student?.phone ?? req.phone_number ?? "—",
      "الصف": student?.grade ?? "—",
      "المبلغ": Number(req.amount),
      "الرسوم": 0,
      "الصافي": Number(req.amount),
      "العملة": "EGP",
      "وسيلة الدفع": paymentMethodLabel(req.payment_method),
      "نوع الإيداع": depositTypeLabel(req.deposit_type),
      "الحالة": meta.label,
      "تاريخ الطلب": fmtDateTime(req.created_at),
      "تاريخ المراجعة": fmtDateTime(req.processed_at),
      "المشرف": detail?.processed_by_name ?? "—",
      "سبب الرفض": req.rejection_reason ?? "—",
      "ملاحظات الإدارة": req.admin_message ?? "—",
    }], "تفاصيل العملية");
    toast.success("تم تصدير الملف");
  };

  if (loading) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!req) {
    return (
      <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <p className="text-sm text-muted-foreground">لم يتم العثور على العملية</p>
        <Button onClick={() => navigate("/admin/student-wallets")}>رجوع</Button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background pb-20 print:bg-white">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/student-wallets")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold text-foreground">تفاصيل عملية الإيداع</h1>
            <button onClick={() => copy(operationNumber(req.id), "تم نسخ رقم العملية")}
              className="font-mono text-[11px] text-primary">
              {operationNumber(req.id)}
            </button>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${meta.className}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}
          </span>
          <Button variant="outline" size="icon" onClick={fetchDetail}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={doExcel} className="gap-1.5">
            <FileSpreadsheet className="h-4 w-4" /> تصدير Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
            <Printer className="h-4 w-4" /> طباعة / PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => copy(req.id, "تم نسخ معرف العملية")} className="gap-1.5">
            <Copy className="h-4 w-4" /> نسخ Transaction ID
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5"
            onClick={() => copy(
              `${student?.full_name ?? ""} | ${student?.student_code ?? student?.id} | ${student?.email ?? ""} | ${student?.phone ?? ""}`,
              "تم نسخ بيانات الطالب")}>
            <Copy className="h-4 w-4" /> نسخ بيانات الطالب
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Student */}
          <Section title="بيانات الطالب" icon={User}>
            <div className="mb-3 flex items-center gap-3">
              <Avatar className="h-14 w-14">
                <AvatarImage src={student?.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 font-bold text-primary">
                  {(student?.full_name || "؟").slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{student?.full_name ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground">{student?.email ?? "—"}</p>
                <div className="mt-1 flex gap-1">
                  {student?.is_banned && <Badge variant="destructive" className="text-[9px]">محظور</Badge>}
                  {student?.is_test_account && <Badge variant="outline" className="text-[9px]">حساب تجريبي</Badge>}
                </div>
              </div>
            </div>
            <Row label="ID الطالب" value={student?.student_code ?? shortId(student?.id)} mono copyValue={student?.student_code ?? student?.id} />
            <Row label="معرف الحساب" value={student?.id} mono copyValue={student?.id} />
            <Row label="رقم الهاتف" value={student?.phone ?? req.phone_number} mono copyValue={student?.phone ?? req.phone_number} />
            <Row label="المرحلة" value={student?.stage} />
            <Row label="الصف الدراسي" value={student?.grade} />
            <Row label="الشعبة" value={student?.section} />
            <Row label="نوع التعليم" value={student?.education_type} />
            <Row label="تاريخ إنشاء الحساب" value={fmtDateTime(student?.created_at)} />
            <Row label="رصيد المحفظة الحالي" value={fmtMoney(detail?.wallet_balance)} />
          </Section>

          {/* Deposit */}
          <Section title="بيانات عملية الإيداع" icon={Wallet}>
            <Row label="رقم العملية" value={operationNumber(req.id)} mono copyValue={operationNumber(req.id)} />
            <Row label="Transaction ID" value={req.id} mono copyValue={req.id} />
            <Row label="Reference Number"
              value={req.recharge_code ?? req.wallet_adjustment_id ?? "—"} mono
              copyValue={req.recharge_code ?? req.wallet_adjustment_id} />
            <Row label="المبلغ" value={fmtMoney(req.amount)} />
            <Row label="الرسوم" value={fmtMoney(0)} />
            <Row label="صافي الرصيد المضاف" value={fmtMoney(req.amount)} />
            <Row label="العملة" value="جنيه مصري (EGP)" />
            <Row label="وسيلة الدفع" value={paymentMethodLabel(req.payment_method)} />
            <Row label="نوع الإيداع" value={depositTypeLabel(req.deposit_type)} />
            <Row label="تاريخ الطلب" value={fmtDate(req.created_at)} />
            <Row label="وقت الطلب" value={fmtTime(req.created_at)} />
            <Row label="تاريخ الموافقة / المراجعة"
              value={req.status === "rejected" ? "—" : fmtDate(req.processed_at)} />
            <Row label="وقت الموافقة / المراجعة"
              value={req.status === "rejected" ? "—" : fmtTime(req.processed_at)} />
            <Row label="تاريخ الرفض" value={req.status === "rejected" ? fmtDateTime(req.processed_at) : "—"} />
            <Row label="سبب الرفض" value={req.rejection_reason ?? "—"} />
            <Row label="ملاحظات الإدارة" value={req.admin_message ?? req.notes ?? "—"} />
            <Row label="المشرف المراجع" value={detail?.processed_by_name ?? "—"} />
          </Section>
        </div>

        {/* Receipt */}
        <Section title="إثبات الدفع" icon={ImageIcon}
          action={receiptUrl && (
            <div className="flex gap-1 print:hidden">
              <Button variant="ghost" size="icon" onClick={() => window.open(receiptUrl, "_blank")}>
                <ExternalLink className="h-4 w-4" />
              </Button>
              <a href={receiptUrl} download target="_blank" rel="noreferrer"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent">
                <Download className="h-4 w-4" />
              </a>
              <Button variant="ghost" size="icon" onClick={() => copy(receiptUrl, "تم نسخ رابط الإثبات")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}>
          {receiptUrl ? (
            <button type="button" onClick={() => { setZoom(1); setViewerOpen(true); }}
              className="block w-full overflow-hidden rounded-xl border border-border bg-muted/30">
              <img src={receiptUrl} alt="إثبات الدفع"
                className="mx-auto max-h-[420px] w-auto object-contain" loading="lazy" />
            </button>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">لا يوجد إثبات دفع مرفوع لهذه العملية</p>
          )}
        </Section>

        {/* Wallet ledger */}
        <Section title="سجل الرصيد" icon={Wallet}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-[10px] text-muted-foreground">الرصيد قبل العملية</p>
              <p className="mt-1 text-sm font-bold">{ledger.before === null ? "—" : fmtMoney(ledger.before)}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-[10px] text-emerald-700">المبلغ المضاف</p>
              <p className="mt-1 text-sm font-bold text-emerald-700">+ {fmtMoney(ledger.added)}</p>
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-[10px] text-muted-foreground">الرصيد بعد العملية</p>
              <p className="mt-1 text-sm font-bold">{ledger.after === null ? "—" : fmtMoney(ledger.after)}</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            محسوب من سجل الإيداعات المعتمدة للطالب (إجمالي {fmtMoney(ledger.totalApproved)}). الرصيد الحالي للمحفظة:{" "}
            {fmtMoney(detail?.wallet_balance)} — يتأثر أيضًا بعمليات الشراء والاشتراكات.
          </p>
          {detail?.adjustment && (
            <div className="mt-3 rounded-xl border border-border p-3">
              <p className="mb-1 text-[11px] font-bold text-foreground">تسوية المحفظة المرتبطة</p>
              <Row label="نوع التسوية" value={detail.adjustment.type} />
              <Row label="المبلغ" value={fmtMoney(detail.adjustment.amount)} />
              <Row label="السبب" value={detail.adjustment.reason} />
              <Row label="التاريخ" value={fmtDateTime(detail.adjustment.created_at)} />
            </div>
          )}
        </Section>

        {/* Audit log */}
        <Section title="سجل الأحداث (Audit Log)" icon={ShieldCheck}>
          {(detail?.audit_logs ?? []).length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">لا توجد سجلات تدقيق مالية مرتبطة بهذه العملية</p>
          ) : (
            <ul className="space-y-2">
              {detail!.audit_logs.map((l) => (
                <li key={l.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-foreground">
                      {AUDIT_ACTION_LABELS[l.action] ?? l.action}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{fmtDateTime(l.created_at)}</span>
                  </div>
                  <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                    <p>المنفذ: {l.actor_name ?? "النظام"}</p>
                    {l.amount != null && <p>المبلغ: {fmtMoney(l.amount)}</p>}
                    {l.reason && <p>السبب: {l.reason}</p>}
                    {l.metadata?.ip && <p>عنوان IP: {l.metadata.ip}</p>}
                    {l.metadata?.user_agent && <p className="break-all">الجهاز/المتصفح: {l.metadata.user_agent}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">
            السجل للقراءة فقط ولا يمكن تعديله من الواجهة.
          </p>
        </Section>

        {/* Activity */}
        <Section title="سجل النشاط" icon={History}>
          <ol className="space-y-2">
            {activity.map((a, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl border border-border p-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-foreground">{a.label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {fmtDateTime(a.at)}{a.by ? ` — ${a.by}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      </main>

      {/* Receipt viewer */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-4xl p-2" dir="rtl">
          <div className="flex items-center justify-between gap-2 px-2 pt-1">
            <span className="text-xs font-bold">إثبات الدفع — {operationNumber(req.id)}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-[11px]">{Math.round(zoom * 100)}%</span>
              <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.min(5, z + 0.25))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="max-h-[75vh] overflow-auto rounded-lg bg-muted/30">
            {receiptUrl && (
              <img src={receiptUrl} alt="إثبات الدفع"
                style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
                className="mx-auto transition-transform" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
