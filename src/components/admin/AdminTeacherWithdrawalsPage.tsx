import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, ArrowDownCircle, CheckCircle, XCircle, Clock, Copy, Search,
  User, Calendar, Wallet, CreditCard, ImageIcon, Filter, TrendingUp, Settings
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import WithdrawalSettings from "@/components/admin/settings/WithdrawalSettings";
import { openUrlWithinAppContainer } from "@/lib/nativeNavigation";

interface WithdrawalRequest {
  id: string;
  teacher_id: string;
  amount: number;
  payment_method: string;
  phone_number: string;
  status: string;
  admin_message: string | null;
  transfer_receipt_url: string | null;
  created_at: string;
  processed_at: string | null;
  teacher_name?: string;
  teacher_email?: string;
  teacher_code?: string | null;
  teacher_category?: string;
}

const methodLabels: Record<string, string> = {
  vodafone_cash: "فودافون كاش",
  orange_cash: "أورانج كاش",
  etisalat_cash: "اتصالات كاش",
  instapay: "InstaPay",
};

export default function AdminTeacherWithdrawalsPage() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [selectedReq, setSelectedReq] = useState<WithdrawalRequest | null>(null);
  const [showAction, setShowAction] = useState<"approve" | "reject" | null>(null);
  const [adminMessage, setAdminMessage] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState("all");
  const [groupByMonth, setGroupByMonth] = useState(false);
  const [withdrawalsStopped, setWithdrawalsStopped] = useState(false);

  useEffect(() => { fetchRequests(); fetchSettings(); }, []);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "withdrawal_manual_state")
      .maybeSingle();
    setWithdrawalsStopped((data as any)?.value === "closed");
  };

  const fetchRequests = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("teacher_withdrawal_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (data && data.length > 0) {
      const teacherIds = [...new Set(data.map(r => r.teacher_id))];
      const [{ data: profiles }, { data: assignments }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, teacher_code").in("id", teacherIds),
        supabase.from("teacher_assignments").select("teacher_id, category").in("teacher_id", teacherIds),
      ]);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const categoryMap = new Map(assignments?.map(a => [a.teacher_id, a.category]) || []);

      const enriched = data.map(r => {
        const p = profileMap.get(r.teacher_id);
        return {
          ...r,
          teacher_name: p?.full_name || "معلم",
          teacher_email: p?.email || "",
          teacher_code: p?.teacher_code || null,
          teacher_category: categoryMap.get(r.teacher_id) || "",
        };
      });
      setRequests(enriched as WithdrawalRequest[]);
    } else {
      setRequests([]);
    }
    setLoading(false);
  };

  const handleApprove = async () => {
    if (!selectedReq) return;
    if (withdrawalsStopped) {
      toast.error("السحب موقوف حالياً — لا يمكن تنفيذ أي تحويلات. أعد تفعيل السحب أولاً من الإعدادات.");
      return;
    }
    setSubmitting(true);
    try {
      let receiptUrl: string | null = null;
      if (receiptFile) {
        try {
          const { uploadFile } = await import("@/lib/storage");
          const stored = await uploadFile({
            scope: { kind: "main" },
            category: `withdrawal-receipts/${selectedReq.id}`,
            file: receiptFile,
          });
          receiptUrl = stored.url;
        } catch (uploadErr) {
          console.error("withdrawal receipt upload failed", uploadErr);
        }
      }

      await supabase.from("teacher_withdrawal_requests").update({
        status: "approved",
        admin_message: adminMessage || "تمت الموافقة على طلب السحب",
        transfer_receipt_url: receiptUrl,
        processed_at: new Date().toISOString(),
      }).eq("id", selectedReq.id);

      await supabase.from("notifications").insert({
        user_id: selectedReq.teacher_id,
        title: "تمت الموافقة على طلب السحب",
        message: `تم تحويل مبلغ ${selectedReq.amount} جنيه بنجاح. ${adminMessage || ""}`,
        notification_type: "withdrawal_approved",
      });

      toast.success("تمت الموافقة على طلب السحب");
      resetDialogs();
      fetchRequests();
    } catch {
      toast.error("خطأ في معالجة الطلب");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedReq) return;
    setSubmitting(true);
    try {
      await supabase.from("teacher_withdrawal_requests").update({
        status: "rejected",
        admin_message: adminMessage || "تم رفض طلب السحب",
        processed_at: new Date().toISOString(),
      }).eq("id", selectedReq.id);

      const { data: wallet } = await supabase
        .from("teacher_wallets")
        .select("balance")
        .eq("teacher_id", selectedReq.teacher_id)
        .maybeSingle();

      if (wallet) {
        await supabase.from("teacher_wallets").update({
          balance: (wallet.balance || 0) + selectedReq.amount,
          updated_at: new Date().toISOString(),
        }).eq("teacher_id", selectedReq.teacher_id);
      }

      await supabase.from("notifications").insert({
        user_id: selectedReq.teacher_id,
        title: "تم رفض طلب السحب",
        message: `تم رفض طلب سحب ${selectedReq.amount} جنيه وتم إرجاع المبلغ. ${adminMessage || ""}`,
        notification_type: "withdrawal_rejected",
      });

      toast.success("تم رفض الطلب وإرجاع المبلغ للمعلم");
      resetDialogs();
      fetchRequests();
    } catch {
      toast.error("خطأ في معالجة الطلب");
    } finally {
      setSubmitting(false);
    }
  };

  const resetDialogs = () => {
    setShowAction(null);
    setSelectedReq(null);
    setAdminMessage("");
    setReceiptFile(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("تم نسخ الرقم");
  };

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge className="bg-amber-100 text-amber-700 border-0"><Clock className="h-3 w-3 ml-1" />معلق</Badge>;
    if (status === "approved") return <Badge className="bg-emerald-100 text-emerald-700 border-0"><CheckCircle className="h-3 w-3 ml-1" />مكتمل</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-700 border-0"><XCircle className="h-3 w-3 ml-1" />مرفوض</Badge>;
    return <Badge>{status}</Badge>;
  };

  const filteredRequests = useMemo(() => {
    let filtered = requests;
    if (statusFilter !== "all") filtered = filtered.filter(r => r.status === statusFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.teacher_name?.toLowerCase().includes(q) ||
        r.teacher_email?.toLowerCase().includes(q) ||
        r.teacher_code?.toLowerCase().includes(q) ||
        r.phone_number.includes(q)
      );
    }
    if (dateFilter === "today") {
      const today = new Date().toISOString().split("T")[0];
      filtered = filtered.filter(r => r.created_at.startsWith(today));
    } else if (dateFilter === "week") {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      filtered = filtered.filter(r => r.created_at >= weekAgo);
    } else if (dateFilter === "month") {
      const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      filtered = filtered.filter(r => r.created_at >= monthAgo);
    }
    return filtered;
  }, [requests, statusFilter, searchQuery, dateFilter]);

  const stats = useMemo(() => {
    const pending = requests.filter(r => r.status === "pending");
    const approved = requests.filter(r => r.status === "approved");
    return {
      pendingCount: pending.length,
      pendingAmount: pending.reduce((s, r) => s + r.amount, 0),
      approvedCount: approved.length,
      approvedAmount: approved.reduce((s, r) => s + r.amount, 0),
      totalAmount: requests.reduce((s, r) => s + r.amount, 0),
    };
  }, [requests]);

  const monthlyGroups = useMemo(() => {
    const map = new Map<string, { label: string; items: WithdrawalRequest[]; total: number; approved: number }>();
    filteredRequests.forEach(r => {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("ar-EG", { year: "numeric", month: "long" });
      const g = map.get(key) || { label, items: [], total: 0, approved: 0 };
      g.items.push(r);
      g.total += Number(r.amount);
      if (r.status === "approved") g.approved += Number(r.amount);
      map.set(key, g);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredRequests]);

  const renderRequestCard = (req: WithdrawalRequest, i: number) => (
    <motion.div key={req.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
      <Card className={`border-0 shadow-sm ${req.status === "pending" ? "ring-1 ring-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10" : ""}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="teacher-stat-icon teacher-stat-icon--blue h-10 w-10 rounded-xl">
                <User className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-sm">{req.teacher_name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {req.teacher_code && <span className="font-mono bg-accent/50 px-1.5 py-0.5 rounded">#{req.teacher_code}</span>}
                  {req.teacher_category && <span>{req.teacher_category}</span>}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(req.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
            <div className="text-left">
              <p className="font-bold text-lg">{req.amount.toLocaleString()} جنيه</p>
              {statusBadge(req.status)}
            </div>
          </div>
          <div className="flex items-center gap-2 mb-3 p-2.5 rounded-xl bg-accent/50 text-sm">
            <CreditCard className="h-4 w-4 text-primary shrink-0" />
            <span className="text-muted-foreground">{methodLabels[req.payment_method] || req.payment_method}:</span>
            <span className="font-mono font-bold">{req.phone_number}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard(req.phone_number)}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          {req.status === "pending" && (
            <div className="flex gap-2">
              <Button size="sm" disabled={withdrawalsStopped} className="gap-1 flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white border-0"
                onClick={() => { setSelectedReq(req); setShowAction("approve"); }}>
                <CheckCircle className="h-3 w-3" /> {withdrawalsStopped ? "السحب موقوف" : "موافقة وتحويل"}
              </Button>
              <Button size="sm" variant="destructive" className="gap-1 flex-1"
                onClick={() => { setSelectedReq(req); setShowAction("reject"); }}>
                <XCircle className="h-3 w-3" /> رفض وإرجاع المبلغ
              </Button>
            </div>
          )}
          {req.admin_message && (
            <p className="text-sm mt-2 p-2 rounded-lg bg-background/60 border border-border/50">{req.admin_message}</p>
          )}
          {req.transfer_receipt_url && (
            <div className="mt-2">
              <button
                type="button"
                onClick={async () => {
                  const { getPrivateFileSignedUrl } = await import("@/lib/privateStorage");
                  const signed = await getPrivateFileSignedUrl("payment-receipts", req.transfer_receipt_url!, 3600);
                  openUrlWithinAppContainer(signed);
                }}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <ImageIcon className="h-3 w-3" /> عرض إيصال التحويل
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="teacher-hero-card !rounded-2xl">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <Wallet className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white">إدارة طلبات سحب المعلمين</h1>
              <p className="text-white/70 text-sm">مراجعة ومعالجة طلبات السحب المالية</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSettingsOpen(true)}
              className="gap-1 bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">إعدادات السحب</span>
            </Button>
          </div>
        </div>
      </div>

      {withdrawalsStopped && (
        <Card className="border-0 shadow-md bg-gradient-to-r from-red-500 to-rose-600 text-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <XCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm">السحب موقوف حالياً</p>
              <p className="text-[11px] opacity-90">لا يمكن للمعلمين تقديم طلبات جديدة، ولا يمكن اعتماد أي تحويلات حتى يُعاد التفعيل من إعدادات السحب.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setSettingsOpen(true)} className="shrink-0">إدارة</Button>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { title: "طلبات معلقة", value: stats.pendingCount, amount: stats.pendingAmount, icon: Clock, cls: "teacher-stat-icon--orange" },
          { title: "تم تحويلها", value: stats.approvedCount, amount: stats.approvedAmount, icon: CheckCircle, cls: "teacher-stat-icon--green" },
          { title: "إجمالي الطلبات", value: requests.length, amount: stats.totalAmount, icon: TrendingUp, cls: "teacher-stat-icon--blue" },
          { title: "إجمالي المبالغ", value: `${stats.totalAmount.toLocaleString()} ج`, amount: 0, icon: Wallet, cls: "teacher-stat-icon--purple" },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{s.title}</p>
                    <p className="text-lg font-bold">{s.value}</p>
                    {s.amount > 0 && <p className="text-[10px] text-muted-foreground">{s.amount.toLocaleString()} جنيه</p>}
                  </div>
                  <div className={`teacher-stat-icon ${s.cls} h-9 w-9 rounded-xl`}>
                    <s.icon className="h-4 w-4 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث بالاسم، البريد، الكود، أو رقم الهاتف..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pr-9 h-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-9"><Filter className="h-3 w-3 ml-1" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="pending">معلق</SelectItem>
                <SelectItem value="approved">مكتمل</SelectItem>
                <SelectItem value="rejected">مرفوض</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[130px] h-9"><Calendar className="h-3 w-3 ml-1" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأوقات</SelectItem>
                <SelectItem value="today">اليوم</SelectItem>
                <SelectItem value="week">آخر أسبوع</SelectItem>
                <SelectItem value="month">آخر شهر</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant={groupByMonth ? "default" : "outline"}
              onClick={() => setGroupByMonth(v => !v)}
              className="h-9 gap-1"
            >
              <Calendar className="h-3.5 w-3.5" />
              {groupByMonth ? "إلغاء التجميع الشهري" : "عرض حسب الشهر"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Requests List */}
      {filteredRequests.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="p-8 text-center">
            <ArrowDownCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">لا توجد طلبات سحب مطابقة</p>
          </CardContent>
        </Card>
      ) : groupByMonth ? (
        <div className="space-y-5">
          {monthlyGroups.map(([key, g]) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-200/40">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-indigo-600" />
                  <span className="font-bold text-sm">{g.label}</span>
                  <Badge variant="outline" className="text-[10px]">{g.items.length} طلب</Badge>
                </div>
                <div className="text-left text-xs">
                  <p className="font-bold text-emerald-600">تم تحويل: {g.approved.toLocaleString()} ج</p>
                  <p className="text-muted-foreground">إجمالي: {g.total.toLocaleString()} ج</p>
                </div>
              </div>
              <div className="space-y-3">
                {g.items.map((req, i) => renderRequestCard(req, i))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((req, i) => renderRequestCard(req, i))}
        </div>
      )}

      {/* Approve Dialog */}
      <Dialog open={showAction === "approve"} onOpenChange={() => resetDialogs()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-emerald-600" />الموافقة على السحب</DialogTitle>
            <DialogDescription>تأكيد تحويل المبلغ للمعلم</DialogDescription>
          </DialogHeader>
          {selectedReq && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-accent/50">
                <p className="text-sm"><strong>{selectedReq.teacher_name}</strong> {selectedReq.teacher_code && <span className="font-mono text-muted-foreground">#{selectedReq.teacher_code}</span>}</p>
                <p className="text-lg font-bold mt-1">{selectedReq.amount.toLocaleString()} جنيه</p>
                <p className="text-xs text-muted-foreground">{methodLabels[selectedReq.payment_method]} - {selectedReq.phone_number}</p>
              </div>
              <div>
                <label className="text-sm font-medium">رسالة للمعلم (اختياري)</label>
                <Textarea value={adminMessage} onChange={e => setAdminMessage(e.target.value)} placeholder="تم التحويل بنجاح..." rows={2} />
              </div>
              <div>
                <label className="text-sm font-medium">صورة التحويل (اختياري)</label>
                <Input type="file" accept="image/*" onChange={e => setReceiptFile(e.target.files?.[0] || null)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => resetDialogs()}>إلغاء</Button>
            <Button onClick={handleApprove} disabled={submitting} className="gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white border-0">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              تأكيد الموافقة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showAction === "reject"} onOpenChange={() => resetDialogs()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><XCircle className="h-5 w-5 text-red-600" />رفض طلب السحب</DialogTitle>
            <DialogDescription>سيتم إرجاع المبلغ لمحفظة المعلم تلقائياً</DialogDescription>
          </DialogHeader>
          {selectedReq && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-accent/50">
                <p className="text-sm"><strong>{selectedReq.teacher_name}</strong> - {selectedReq.amount.toLocaleString()} جنيه</p>
              </div>
              <div>
                <label className="text-sm font-medium">سبب الرفض</label>
                <Textarea value={adminMessage} onChange={e => setAdminMessage(e.target.value)} placeholder="سبب رفض الطلب..." rows={3} />
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/30">
                <p className="text-sm text-amber-700 dark:text-amber-300">⚠️ سيتم إرجاع المبلغ تلقائياً لمحفظة المعلم</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => resetDialogs()}>إلغاء</Button>
            <Button onClick={handleReject} disabled={submitting} variant="destructive" className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              تأكيد الرفض وإرجاع المبلغ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdrawal settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={(v) => { setSettingsOpen(v); if (!v) fetchSettings(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              إعدادات السحب والعمولة
            </DialogTitle>
            <DialogDescription>
              تحكم بنسبة العمولة، يوم فتح السحب، وأرشفة الشهر الحالي
            </DialogDescription>
          </DialogHeader>
          <WithdrawalSettings />
        </DialogContent>
      </Dialog>
    </div>
  );
}