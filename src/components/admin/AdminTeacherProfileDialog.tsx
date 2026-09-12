import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { savePdfDocument } from "@/lib/fileDownload";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  User,
  Mail,
  Phone,
  Lock,
  Wallet,
  Activity,
  Trash2,
  Ban,
  CheckCircle2,
  Download,
  Plus,
  Minus,
  Gift,
  TrendingUp,
  TrendingDown,
  Clock,
  Loader2,
  Save,
  FileText,
  Users,
  BookOpen,
  AlertTriangle,
  Receipt,
  Shield,
} from "lucide-react";

interface TeacherFull {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  teacher_code: string | null;
  is_banned: boolean | null;
  created_at: string | null;
}

interface WalletInfo {
  balance: number;
  total_earned: number;
}

interface Transaction {
  id: string;
  amount: number;
  transaction_type: string;
  description: string | null;
  admin_message: string | null;
  balance_after: number | null;
  created_at: string;
}

interface Withdrawal {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  processed_at: string | null;
  rejection_reason: string | null;
  payment_method: string | null;
}

interface ActivityLog {
  id: string;
  action_type: string;
  action_label: string;
  page_path: string | null;
  duration_seconds: number | null;
  created_at: string;
}

interface Props {
  teacherId: string | null;
  open: boolean;
  onClose: () => void;
  onTeacherChanged?: () => void;
}

const TX_LABEL: Record<string, string> = {
  admin_credit: "إضافة رصيد",
  admin_debit: "خصم رصيد",
  admin_bonus: "مكافأة من الإدارة",
  commission: "عمولة بيع",
  withdrawal: "سحب رصيد",
  refund: "استرجاع",
};

export default function AdminTeacherProfileDialog({ teacherId, open, onClose, onTeacherChanged }: Props) {
  const [teacher, setTeacher] = useState<TeacherFull | null>(null);
  const [wallet, setWallet] = useState<WalletInfo>({ balance: 0, total_earned: 0 });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [contentCount, setContentCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Form states
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Wallet adjustment
  const [adjAmount, setAdjAmount] = useState("");
  const [adjType, setAdjType] = useState<"admin_credit" | "admin_debit" | "admin_bonus">("admin_credit");
  const [adjMessage, setAdjMessage] = useState("");
  const [adjLoading, setAdjLoading] = useState(false);

  // Confirmations
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmBan, setConfirmBan] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!teacherId) return;
    setLoading(true);
    try {
      const [profRes, walletRes, txRes, wdRes, actRes, contentRes] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email,phone,avatar_url,teacher_code,is_banned,created_at").eq("id", teacherId).maybeSingle(),
        supabase.from("teacher_wallets").select("balance,total_earned").eq("teacher_id", teacherId).maybeSingle(),
        supabase.from("teacher_wallet_transactions").select("*").eq("teacher_id", teacherId).order("created_at", { ascending: false }).limit(100),
        supabase.from("teacher_withdrawal_requests").select("id,amount,status,created_at,processed_at,rejection_reason,payment_method").eq("teacher_id", teacherId).order("created_at", { ascending: false }).limit(50),
        supabase.from("teacher_activity_logs").select("*").eq("teacher_id", teacherId).order("created_at", { ascending: false }).limit(100),
        supabase.from("content").select("id", { count: "exact", head: true }).eq("uploaded_by", teacherId),
      ]);

      const t = profRes.data as TeacherFull | null;
      setTeacher(t);
      if (t) {
        setEditName(t.full_name || "");
        setEditPhone(t.phone || "");
        setNewEmail(t.email || "");
      }
      setWallet({ balance: Number(walletRes.data?.balance || 0), total_earned: Number(walletRes.data?.total_earned || 0) });
      setTransactions((txRes.data || []) as Transaction[]);
      setWithdrawals((wdRes.data || []) as Withdrawal[]);
      setActivities((actRes.data || []) as ActivityLog[]);
      setContentCount(contentRes.count || 0);

      // student count via teacher's groups
      const { data: groups } = await supabase.from("content_groups").select("id").eq("teacher_id", teacherId);
      const groupIds = (groups || []).map(g => g.id);
      if (groupIds.length) {
        const { count } = await supabase.from("student_group_purchases").select("student_id", { count: "exact", head: true }).in("group_id", groupIds);
        setStudentCount(count || 0);
      } else {
        setStudentCount(0);
      }
    } catch (e) {
      console.error(e);
      toast.error("خطأ في تحميل بيانات المعلم");
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    if (open && teacherId) fetchAll();
  }, [open, teacherId, fetchAll]);

  const callAdminFn = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("admin-manage-teacher", { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const handleSaveProfile = async () => {
    if (!teacherId) return;
    if (!editName.trim()) { toast.error("الاسم مطلوب"); return; }
    setSavingProfile(true);
    try {
      await callAdminFn({ action: "update_profile", teacher_id: teacherId, full_name: editName.trim(), phone: editPhone.trim() });
      toast.success("تم حفظ البيانات");
      fetchAll();
      onTeacherChanged?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!teacherId || !newEmail) return;
    setSavingEmail(true);
    try {
      await callAdminFn({ action: "update_email", teacher_id: teacherId, new_email: newEmail.trim() });
      toast.success("تم تحديث البريد الإلكتروني");
      fetchAll();
      onTeacherChanged?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingEmail(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!teacherId || newPassword.length < 6) { toast.error("كلمة السر 6 أحرف على الأقل"); return; }
    setSavingPassword(true);
    try {
      await callAdminFn({ action: "update_password", teacher_id: teacherId, new_password: newPassword });
      toast.success("تم تغيير كلمة السر بنجاح");
      setNewPassword("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleAdjustWallet = async () => {
    if (!teacherId) return;
    const amt = parseFloat(adjAmount);
    if (!amt || isNaN(amt) || amt <= 0) { toast.error("أدخل مبلغاً صحيحاً"); return; }
    setAdjLoading(true);
    try {
      const signed = adjType === "admin_debit" ? -amt : amt;
      const { data, error } = await supabase.rpc("admin_adjust_teacher_wallet", {
        _teacher_id: teacherId,
        _amount: signed,
        _transaction_type: adjType,
        _description: adjType === "admin_bonus" ? "مكافأة من الإدارة" : null,
        _admin_message: adjMessage.trim() || null,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) { toast.error(result.error || "فشلت العملية"); return; }
      toast.success("تمت العملية بنجاح");
      setAdjAmount(""); setAdjMessage("");
      fetchAll();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAdjLoading(false);
    }
  };

  const handleBanToggle = async () => {
    if (!teacherId || !teacher) return;
    try {
      await callAdminFn({ action: teacher.is_banned ? "unban_teacher" : "ban_teacher", teacher_id: teacherId });
      toast.success(teacher.is_banned ? "تم رفع الحظر" : "تم حظر المعلم");
      setConfirmBan(false);
      fetchAll();
      onTeacherChanged?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!teacherId) return;
    try {
      await callAdminFn({ action: "delete_teacher", teacher_id: teacherId });
      toast.success("تم حذف حساب المعلم نهائياً");
      setConfirmDelete(false);
      onClose();
      onTeacherChanged?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleExportPDF = async () => {
    if (!teacher) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const node = document.getElementById("teacher-pdf-export");
      if (!node) throw new Error("لا يمكن تصدير الملف");
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(img, "PNG", 0, position, pageW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(img, "PNG", 0, position, pageW, imgH);
        heightLeft -= pageH;
      }
      await savePdfDocument(`teacher-${teacher.full_name}-${new Date().toISOString().slice(0,10)}.pdf`, pdf);
      toast.success("تم تصدير الملف");
    } catch (e) {
      toast.error("تعذر تصدير PDF");
    } finally {
      setExporting(false);
    }
  };

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "—";
  const fmtAmount = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString("ar-EG")} ج`;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden p-0 gap-0">
          <DialogHeader className="p-5 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Shield className="h-5 w-5 text-primary" />
              ملف المعلم — وضع المطور
            </DialogTitle>
          </DialogHeader>

          {loading || !teacher ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <ScrollArea className="max-h-[80vh]">
              <div className="p-5 space-y-5">
                {/* Header card */}
                <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4 flex-wrap">
                      <Avatar className="h-20 w-20 ring-2 ring-primary/30">
                        <AvatarImage src={teacher.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                          {teacher.full_name?.[0] || "م"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-[200px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xl font-bold">{teacher.full_name}</h3>
                          {teacher.is_banned && <Badge variant="destructive">محظور</Badge>}
                          {teacher.teacher_code && <Badge variant="secondary">{teacher.teacher_code}</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1"><Mail className="h-3 w-3" />{teacher.email}</p>
                        {teacher.phone && <p className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{teacher.phone}</p>}
                        <p className="text-xs text-muted-foreground mt-2">سُجّل في: {fmtDate(teacher.created_at)}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-background border p-2 min-w-[70px]">
                          <Users className="h-4 w-4 mx-auto text-blue-500" />
                          <p className="text-xs text-muted-foreground mt-1">الطلاب</p>
                          <p className="font-bold">{studentCount}</p>
                        </div>
                        <div className="rounded-lg bg-background border p-2 min-w-[70px]">
                          <BookOpen className="h-4 w-4 mx-auto text-emerald-500" />
                          <p className="text-xs text-muted-foreground mt-1">المحتوى</p>
                          <p className="font-bold">{contentCount}</p>
                        </div>
                        <div className="rounded-lg bg-background border p-2 min-w-[70px]">
                          <Wallet className="h-4 w-4 mx-auto text-amber-500" />
                          <p className="text-xs text-muted-foreground mt-1">الرصيد</p>
                          <p className="font-bold">{wallet.balance.toLocaleString("ar-EG")}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-4">
                      <Button size="sm" variant="outline" onClick={handleExportPDF} disabled={exporting} className="gap-1">
                        {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                        تصدير PDF
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmBan(true)} className="gap-1">
                        <Ban className="h-3 w-3" />
                        {teacher.is_banned ? "رفع الحظر" : "حظر"}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)} className="gap-1">
                        <Trash2 className="h-3 w-3" />
                        حذف نهائي
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Tabs */}
                <Tabs defaultValue="profile" className="w-full">
                  <TabsList className="grid grid-cols-4 w-full">
                    <TabsTrigger value="profile" className="gap-1"><User className="h-3 w-3" />البيانات</TabsTrigger>
                    <TabsTrigger value="security" className="gap-1"><Lock className="h-3 w-3" />الأمان</TabsTrigger>
                    <TabsTrigger value="wallet" className="gap-1"><Wallet className="h-3 w-3" />المحفظة</TabsTrigger>
                    <TabsTrigger value="activity" className="gap-1"><Activity className="h-3 w-3" />النشاط</TabsTrigger>
                  </TabsList>

                  {/* PROFILE */}
                  <TabsContent value="profile" className="space-y-3 mt-3">
                    <Card>
                      <CardHeader className="pb-3"><CardTitle className="text-base">تعديل البيانات الشخصية</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <Label>الاسم الكامل</Label>
                          <Input value={editName} onChange={e => setEditName(e.target.value)} />
                        </div>
                        <div>
                          <Label>رقم الهاتف</Label>
                          <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="01xxxxxxxxx" />
                        </div>
                        <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full gap-1">
                          {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          حفظ التغييرات
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* SECURITY */}
                  <TabsContent value="security" className="space-y-3 mt-3">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" />تغيير البريد الإلكتروني</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} dir="ltr" />
                        <Button onClick={handleUpdateEmail} disabled={savingEmail || newEmail === teacher.email} className="w-full gap-1">
                          {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          تحديث البريد
                        </Button>
                      </CardContent>
                    </Card>

                    <Card className="border-amber-500/30 bg-amber-500/5">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
                          <Lock className="h-4 w-4" />تغيير كلمة السر (بدون القديمة)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          المعلم سيتلقى إشعاراً بهذه العملية تلقائياً.
                        </p>
                        <Input
                          type="text"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="كلمة السر الجديدة (6 أحرف على الأقل)"
                          dir="ltr"
                        />
                        <Button onClick={handleUpdatePassword} disabled={savingPassword || newPassword.length < 6} className="w-full gap-1">
                          {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                          تعيين كلمة السر الجديدة
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* WALLET */}
                  <TabsContent value="wallet" className="space-y-3 mt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Card className="bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/30">
                        <CardContent className="p-4">
                          <p className="text-xs text-muted-foreground">الرصيد الحالي</p>
                          <p className="text-2xl font-bold text-emerald-600">{wallet.balance.toLocaleString("ar-EG")} ج</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-gradient-to-br from-blue-500/10 to-transparent border-blue-500/30">
                        <CardContent className="p-4">
                          <p className="text-xs text-muted-foreground">إجمالي الأرباح</p>
                          <p className="text-2xl font-bold text-blue-600">{wallet.total_earned.toLocaleString("ar-EG")} ج</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Wallet adjustment */}
                    <Card className="border-primary/30">
                      <CardHeader className="pb-3"><CardTitle className="text-base">تعديل الرصيد</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <Button type="button" variant={adjType === "admin_credit" ? "default" : "outline"} size="sm" onClick={() => setAdjType("admin_credit")} className="gap-1">
                            <Plus className="h-3 w-3" />إضافة
                          </Button>
                          <Button type="button" variant={adjType === "admin_debit" ? "default" : "outline"} size="sm" onClick={() => setAdjType("admin_debit")} className="gap-1">
                            <Minus className="h-3 w-3" />خصم
                          </Button>
                          <Button type="button" variant={adjType === "admin_bonus" ? "default" : "outline"} size="sm" onClick={() => setAdjType("admin_bonus")} className="gap-1">
                            <Gift className="h-3 w-3" />مكافأة
                          </Button>
                        </div>
                        <Input type="number" min="1" placeholder="المبلغ بالجنيه" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} />
                        <Textarea
                          rows={2}
                          placeholder={adjType === "admin_bonus" ? "رسالة شكر للمعلم (اختياري)" : "ملاحظة (اختياري)"}
                          value={adjMessage}
                          onChange={e => setAdjMessage(e.target.value)}
                        />
                        <Button onClick={handleAdjustWallet} disabled={adjLoading} className="w-full gap-1">
                          {adjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          تنفيذ العملية
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Transactions */}
                    <Card>
                      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" />كشف المعاملات</CardTitle></CardHeader>
                      <CardContent>
                        {transactions.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-3">لا توجد معاملات</p>
                        ) : (
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {transactions.map(tx => (
                              <div key={tx.id} className="flex items-center justify-between p-2 rounded-lg border bg-card">
                                <div className="flex items-center gap-2 min-w-0">
                                  {tx.amount > 0 ? <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" /> : <TrendingDown className="h-4 w-4 text-red-500 shrink-0" />}
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{TX_LABEL[tx.transaction_type] || tx.transaction_type}</p>
                                    {tx.admin_message && <p className="text-xs text-muted-foreground truncate">{tx.admin_message}</p>}
                                    <p className="text-xs text-muted-foreground">{fmtDate(tx.created_at)}</p>
                                  </div>
                                </div>
                                <span className={`text-sm font-bold whitespace-nowrap ${tx.amount > 0 ? "text-emerald-600" : "text-red-600"}`}>
                                  {fmtAmount(Number(tx.amount))}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Withdrawals */}
                    <Card>
                      <CardHeader className="pb-3"><CardTitle className="text-base">سجل السحوبات</CardTitle></CardHeader>
                      <CardContent>
                        {withdrawals.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-3">لا توجد سحوبات</p>
                        ) : (
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {withdrawals.map(w => (
                              <div key={w.id} className="flex items-center justify-between p-2 rounded-lg border">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium">{Number(w.amount).toLocaleString("ar-EG")} ج</p>
                                  <p className="text-xs text-muted-foreground">{fmtDate(w.created_at)}</p>
                                  {w.rejection_reason && <p className="text-xs text-red-500">سبب الرفض: {w.rejection_reason}</p>}
                                </div>
                                <Badge variant={w.status === "approved" ? "default" : w.status === "rejected" ? "destructive" : "secondary"}>
                                  {w.status === "approved" ? "ناجح" : w.status === "rejected" ? "فاشل" : w.status === "pending" ? "قيد المراجعة" : w.status}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ACTIVITY */}
                  <TabsContent value="activity" className="space-y-3 mt-3">
                    <Card>
                      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />سجل النشاط (آخر 100 عملية)</CardTitle></CardHeader>
                      <CardContent>
                        {activities.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">لا يوجد نشاط مسجل بعد</p>
                        ) : (
                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            {activities.map(a => (
                              <div key={a.id} className="flex items-start justify-between p-2 rounded-lg border bg-card text-sm">
                                <div className="min-w-0">
                                  <p className="font-medium">{a.action_label}</p>
                                  {a.page_path && <p className="text-xs text-muted-foreground truncate">{a.page_path}</p>}
                                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(a.created_at)}</p>
                                </div>
                                {a.duration_seconds != null && (
                                  <Badge variant="outline" className="text-xs whitespace-nowrap">{a.duration_seconds}ث</Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Hidden PDF export node */}
              <div id="teacher-pdf-export" className="absolute -left-[9999px] top-0 w-[800px] bg-white text-black p-8" dir="rtl">
                <h1 className="text-2xl font-bold text-center mb-4">تقرير المعلم — مدرك Plus</h1>
                <Separator className="mb-4" />
                <div className="grid grid-cols-2 gap-3 text-sm mb-5">
                  <div><strong>الاسم:</strong> {teacher.full_name}</div>
                  <div><strong>البريد:</strong> {teacher.email}</div>
                  <div><strong>الهاتف:</strong> {teacher.phone || "—"}</div>
                  <div><strong>كود المعلم:</strong> {teacher.teacher_code || "—"}</div>
                  <div><strong>تاريخ التسجيل:</strong> {fmtDate(teacher.created_at)}</div>
                  <div><strong>الحالة:</strong> {teacher.is_banned ? "محظور" : "نشط"}</div>
                </div>
                <h2 className="text-lg font-bold mb-2">المحفظة</h2>
                <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                  <div>الرصيد الحالي: {wallet.balance.toLocaleString("ar-EG")} ج</div>
                  <div>إجمالي الأرباح: {wallet.total_earned.toLocaleString("ar-EG")} ج</div>
                  <div>عدد الطلاب: {studentCount}</div>
                  <div>عدد المحتوى: {contentCount}</div>
                </div>
                <h2 className="text-lg font-bold mb-2">آخر المعاملات</h2>
                <table className="w-full text-xs border-collapse mb-4">
                  <thead><tr className="bg-gray-100"><th className="border p-1">النوع</th><th className="border p-1">المبلغ</th><th className="border p-1">التاريخ</th></tr></thead>
                  <tbody>
                    {transactions.slice(0, 20).map(tx => (
                      <tr key={tx.id}><td className="border p-1">{TX_LABEL[tx.transaction_type] || tx.transaction_type}</td><td className="border p-1">{fmtAmount(Number(tx.amount))}</td><td className="border p-1">{fmtDate(tx.created_at)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <h2 className="text-lg font-bold mb-2">السحوبات</h2>
                <table className="w-full text-xs border-collapse">
                  <thead><tr className="bg-gray-100"><th className="border p-1">المبلغ</th><th className="border p-1">الحالة</th><th className="border p-1">التاريخ</th></tr></thead>
                  <tbody>
                    {withdrawals.slice(0, 20).map(w => (
                      <tr key={w.id}><td className="border p-1">{Number(w.amount).toLocaleString("ar-EG")} ج</td><td className="border p-1">{w.status}</td><td className="border p-1">{fmtDate(w.created_at)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">حذف نهائي للمعلم؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف حساب المعلم وجميع بياناته نهائياً (المحتوى، المحفظة، السجلات). هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">حذف نهائي</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmBan} onOpenChange={setConfirmBan}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{teacher?.is_banned ? "رفع الحظر عن المعلم؟" : "حظر المعلم؟"}</AlertDialogTitle>
            <AlertDialogDescription>
              {teacher?.is_banned ? "سيتمكن المعلم من الدخول مجدداً." : "سيُمنع المعلم من الدخول حتى يُرفع الحظر."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleBanToggle}>تأكيد</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
