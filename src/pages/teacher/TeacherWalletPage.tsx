import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Wallet, ArrowDownCircle, Plus, CreditCard, Users, BookOpen, Clock, CheckCircle, XCircle,
  ChevronLeft, TrendingUp, History, Settings2, BarChart3
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface GradeEarning {
  grade: string;
  stage: string;
  category: string;
  totalEarned: number;
  subscriberCount: number;
  groups: { title: string; price: number; studentCount: number }[];
}

interface WithdrawalRequest {
  id: string;
  amount: number;
  payment_method: string;
  phone_number: string;
  status: string;
  admin_message: string | null;
  created_at: string;
}

interface PaymentMethod {
  id: string;
  method_type: string;
  phone_number: string;
  is_default: boolean;
}

const methodLabels: Record<string, string> = {
  vodafone_cash: "فودافون كاش",
  orange_cash: "أورانج كاش",
  etisalat_cash: "اتصالات كاش",
  instapay: "InstaPay",
};

const formatGrade = (g: string) => {
  if (g === "first") return "الأول";
  if (g === "second") return "الثاني";
  if (g === "third") return "الثالث";
  return g;
};
const formatStage = (s: string) => (s === "secondary" ? "الثانوي" : s === "preparatory" ? "الإعدادي" : s);

type WalletView = "main" | "payment-methods" | "withdrawal-history" | "grade-detail";

export default function TeacherWalletPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState("");
  const [balance, setBalance] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [gradeEarnings, setGradeEarnings] = useState<GradeEarning[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [view, setView] = useState<WalletView>("main");
  const [selectedGrade, setSelectedGrade] = useState<GradeEarning | null>(null);

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [showAddMethod, setShowAddMethod] = useState(false);
  const [newMethodType, setNewMethodType] = useState("vodafone_cash");
  const [newMethodPhone, setNewMethodPhone] = useState("");
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchAll();
  }, [user?.id]);

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);

    const [profileRes, walletRes, assignRes, methodsRes, withdrawRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      supabase.from("teacher_wallets").select("*").eq("teacher_id", user.id).maybeSingle(),
      supabase.from("teacher_assignments").select("stage, grade, category").eq("teacher_id", user.id),
      supabase.from("teacher_payment_methods").select("*").eq("teacher_id", user.id).order("created_at"),
      supabase.from("teacher_withdrawal_requests").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);

    if (profileRes.data) setTeacherName(profileRes.data.full_name);

    if (!walletRes.data) {
      await supabase.from("teacher_wallets").insert({ teacher_id: user.id, balance: 0, total_earned: 0 });
      setBalance(0);
      setTotalEarned(0);
    } else {
      setBalance(walletRes.data.balance || 0);
      setTotalEarned(walletRes.data.total_earned || 0);
    }

    const methods = (methodsRes.data || []) as PaymentMethod[];
    setPaymentMethods(methods);
    if (methods.length > 0 && !selectedPaymentMethodId) {
      setSelectedPaymentMethodId(methods[0].id);
    }
    setWithdrawals((withdrawRes.data || []) as WithdrawalRequest[]);

    const assignments = (assignRes.data || []) as { stage: string; grade: string; category: string }[];
    if (assignments.length === 0) {
      setGradeEarnings([]);
      setLoading(false);
      return;
    }

    const { data: allGroups } = await supabase
      .from("content_groups")
      .select("id, title, price, subject_id")
      .or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`);

    if (!allGroups?.length) {
      setGradeEarnings(assignments.map(a => ({ ...a, totalEarned: 0, subscriberCount: 0, groups: [] })));
      setLoading(false);
      return;
    }

    const subjectIds = [...new Set(allGroups.map(g => g.subject_id).filter(Boolean))];
    const { data: subjects } = await supabase.from("subjects").select("id, category, grade, stage").in("id", subjectIds);
    const subjectMap = new Map((subjects || []).map(s => [s.id, s]));

    const groupIds = allGroups.map(g => g.id);
    const { data: allPurchases } = await supabase
      .from("student_group_purchases")
      .select("group_id, student_id, purchased_at")
      .in("group_id", groupIds);

    const purchasesByGroup = new Map<string, { count: number; students: Set<string> }>();
    for (const p of (allPurchases || [])) {
      const existing = purchasesByGroup.get(p.group_id) || { count: 0, students: new Set<string>() };
      existing.count++;
      existing.students.add(p.student_id);
      purchasesByGroup.set(p.group_id, existing);
    }

    const earnings: GradeEarning[] = assignments.map(asgn => {
      const matchingGroups = allGroups.filter(g => {
        const subj = subjectMap.get(g.subject_id);
        if (!subj) return false;
        return subj.category.toLowerCase().includes(asgn.category.toLowerCase()) &&
               subj.grade.toLowerCase().includes(asgn.grade.toLowerCase()) &&
               subj.stage.toLowerCase().includes(asgn.stage.toLowerCase());
      });

      let totalGradeEarned = 0;
      let allStudents = new Set<string>();
      const groupDetails = matchingGroups.map(g => {
        const data = purchasesByGroup.get(g.id);
        const sc = data?.count || 0;
        totalGradeEarned += g.price * sc * 0.7; // 70% commission
        data?.students.forEach(s => allStudents.add(s));
        return { title: g.title, price: g.price, studentCount: sc };
      });

      return { ...asgn, totalEarned: Math.round(totalGradeEarned), subscriberCount: allStudents.size, groups: groupDetails };
    });

    setGradeEarnings(earnings);
    setLoading(false);
  };

  const handleWithdraw = async () => {
    if (!user || !withdrawAmount || !selectedPaymentMethodId) return;
    const amount = Number(withdrawAmount);
    const selectedMethod = paymentMethods.find(m => m.id === selectedPaymentMethodId);
    if (!selectedMethod) { toast.error("يرجى اختيار طريقة دفع"); return; }
    if (amount <= 0 || amount > balance) { toast.error("المبلغ غير صالح أو أكبر من الرصيد المتاح"); return; }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("teacher_withdrawal_requests" as any).insert({
        teacher_id: user.id, amount, payment_method: selectedMethod.method_type, phone_number: selectedMethod.phone_number,
      } as any);
      if (error) throw error;

      await supabase.from("teacher_wallets").update({ balance: balance - amount, updated_at: new Date().toISOString() }).eq("teacher_id", user.id);

      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (admins) {
        await supabase.from("notifications").insert(admins.map(a => ({
          user_id: a.user_id, title: "طلب سحب جديد من معلم",
          message: `المعلم ${teacherName} يطلب سحب ${amount} جنيه`, notification_type: "withdrawal",
        })));
      }

      toast.success("تم تقديم طلب السحب بنجاح");
      setShowWithdraw(false);
      setWithdrawAmount("");
      fetchAll();
    } catch {
      toast.error("خطأ في تقديم طلب السحب");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMethod = async () => {
    if (!user || !newMethodPhone.trim()) return;
    setSubmitting(true);
    try {
      if (editingMethod) {
        await supabase.from("teacher_payment_methods").update({
          method_type: newMethodType, phone_number: newMethodPhone.trim(),
        }).eq("id", editingMethod.id);
        toast.success("تم تعديل طريقة الدفع");
      } else {
        await supabase.from("teacher_payment_methods").insert({
          teacher_id: user.id, method_type: newMethodType, phone_number: newMethodPhone.trim(),
        });
        toast.success("تم إضافة طريقة الدفع");
      }
      setShowAddMethod(false);
      setNewMethodPhone("");
      setEditingMethod(null);
      fetchAll();
    } catch {
      toast.error("خطأ");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMethod = async (id: string) => {
    const { error } = await supabase.from("teacher_payment_methods").delete().eq("id", id);
    if (error) { toast.error("خطأ في حذف طريقة الدفع"); return; }
    toast.success("تم حذف طريقة الدفع");
    if (selectedPaymentMethodId === id) setSelectedPaymentMethodId("");
    fetchAll();
  };

  const startEditMethod = (pm: PaymentMethod) => {
    setEditingMethod(pm);
    setNewMethodType(pm.method_type);
    setNewMethodPhone(pm.phone_number);
    setShowAddMethod(true);
  };

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]"><Clock className="h-3 w-3 ml-0.5" />معلق</Badge>;
    if (status === "approved") return <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]"><CheckCircle className="h-3 w-3 ml-0.5" />مكتمل</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-700 border-0 text-[10px]"><XCircle className="h-3 w-3 ml-0.5" />مرفوض</Badge>;
    return <Badge className="text-[10px]">{status}</Badge>;
  };

  const totalWithdrawn = useMemo(() =>
    withdrawals.filter(w => w.status === "approved").reduce((s, w) => s + w.amount, 0),
    [withdrawals]
  );

  const chartData = useMemo(() =>
    gradeEarnings.map(ge => ({
      name: `${formatGrade(ge.grade)} ${formatStage(ge.stage)}`,
      earnings: ge.totalEarned,
      students: ge.subscriberCount,
    })),
    [gradeEarnings]
  );

  if (loading) {
    return (
      <TeacherSidebarLayout title="المحفظة" teacherName={teacherName}>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
      </TeacherSidebarLayout>
    );
  }

  // Grade Detail View
  if (view === "grade-detail" && selectedGrade) {
    return (
      <TeacherSidebarLayout title="تفاصيل الأرباح" teacherName={teacherName}>
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
          <Button variant="ghost" onClick={() => { setView("main"); setSelectedGrade(null); }} className="gap-1">
            <ChevronLeft className="h-4 w-4 rotate-180" /> رجوع للمحفظة
          </Button>

          <div className="teacher-hero-card !py-4 !px-5">
            <div className="relative z-10">
              <h2 className="text-lg font-bold text-white">الصف {formatGrade(selectedGrade.grade)} {formatStage(selectedGrade.stage)}</h2>
              <p className="text-white/60 text-xs">{selectedGrade.category}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-blue-600">{selectedGrade.totalEarned.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">جنيه أرباح</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-emerald-600">{selectedGrade.subscriberCount}</p>
                <p className="text-[10px] text-muted-foreground">مشترك</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-purple-600">{selectedGrade.groups.length}</p>
                <p className="text-[10px] text-muted-foreground">مجموعة</p>
              </CardContent>
            </Card>
          </div>

          {selectedGrade.groups.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">المجموعات والأرباح</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {selectedGrade.groups.map((g, j) => (
                  <div key={j} className="flex items-center justify-between p-3 rounded-xl bg-accent/50 text-sm">
                    <div>
                      <p className="font-bold text-sm">{g.title}</p>
                      <p className="text-[10px] text-muted-foreground">{g.studentCount} طالب × {g.price} جنيه × 70%</p>
                    </div>
                    <span className="font-bold text-primary">{Math.round(g.price * g.studentCount * 0.7).toLocaleString()} ج</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </TeacherSidebarLayout>
    );
  }

  // Payment Methods View
  if (view === "payment-methods") {
    return (
      <TeacherSidebarLayout title="طرق الدفع" teacherName={teacherName}>
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
          <Button variant="ghost" onClick={() => setView("main")} className="gap-1">
            <ChevronLeft className="h-4 w-4 rotate-180" /> رجوع للمحفظة
          </Button>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-blue-500" /> طرق الدفع المسجلة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {paymentMethods.length === 0 ? (
                <div className="text-center py-8">
                  <CreditCard className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">لم تضف أي طريقة دفع بعد</p>
                </div>
              ) : (
                paymentMethods.map(pm => (
                  <div key={pm.id} className="flex items-center justify-between p-3 rounded-xl bg-accent/50">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-blue-500 flex items-center justify-center">
                        <CreditCard className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">{methodLabels[pm.method_type] || pm.method_type}</p>
                        <p className="text-xs text-muted-foreground font-mono">{pm.phone_number}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => startEditMethod(pm)}>تعديل</Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteMethod(pm.id)}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
              <button onClick={() => { setEditingMethod(null); setNewMethodPhone(""); setShowAddMethod(true); }} className="teacher-btn-primary w-full justify-center text-sm">
                <Plus className="h-4 w-4" /> إضافة طريقة دفع جديدة
              </button>
            </CardContent>
          </Card>
        </div>

        {/* Add/Edit Method Dialog */}
        <Dialog open={showAddMethod} onOpenChange={v => { setShowAddMethod(v); if (!v) setEditingMethod(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />{editingMethod ? "تعديل" : "إضافة"} طريقة دفع</DialogTitle>
              <DialogDescription>اختر نوع المحفظة وأدخل الرقم</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>نوع المحفظة *</Label>
                <Select value={newMethodType} onValueChange={setNewMethodType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vodafone_cash">فودافون كاش</SelectItem>
                    <SelectItem value="orange_cash">أورانج كاش</SelectItem>
                    <SelectItem value="etisalat_cash">اتصالات كاش</SelectItem>
                    <SelectItem value="instapay">InstaPay</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>رقم المحفظة *</Label>
                <Input value={newMethodPhone} onChange={e => setNewMethodPhone(e.target.value)} placeholder="01xxxxxxxxx" dir="ltr" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowAddMethod(false); setEditingMethod(null); }}>إلغاء</Button>
              <Button onClick={handleAddMethod} disabled={submitting || !newMethodPhone.trim()} className="gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingMethod ? "حفظ التعديل" : "إضافة"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TeacherSidebarLayout>
    );
  }

  // Withdrawal History View
  if (view === "withdrawal-history") {
    return (
      <TeacherSidebarLayout title="سجل السحب" teacherName={teacherName}>
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
          <Button variant="ghost" onClick={() => setView("main")} className="gap-1">
            <ChevronLeft className="h-4 w-4 rotate-180" /> رجوع للمحفظة
          </Button>

          <div className="grid grid-cols-3 gap-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold">{withdrawals.length}</p>
                <p className="text-[10px] text-muted-foreground">إجمالي الطلبات</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-emerald-600">{totalWithdrawn.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">تم تحويلها</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-amber-600">{withdrawals.filter(w => w.status === "pending").length}</p>
                <p className="text-[10px] text-muted-foreground">معلقة</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 space-y-3">
              {withdrawals.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">لا توجد طلبات سحب</p>
              ) : (
                withdrawals.map(w => (
                  <div key={w.id} className="p-3 rounded-xl bg-accent/30 border border-border/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm">{w.amount.toLocaleString()} جنيه</span>
                      {statusBadge(w.status)}
                    </div>
                    <div className="text-[11px] text-muted-foreground space-y-0.5">
                      <p>{methodLabels[w.payment_method] || w.payment_method} - {w.phone_number}</p>
                      <p>{new Date(w.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</p>
                      {w.admin_message && <p className="text-foreground bg-background/60 p-2 rounded-lg mt-1">{w.admin_message}</p>}
                      {w.status === "pending" && <p className="text-amber-600 mt-1">⏳ يتم إلغاء الطلب تلقائياً بعد 3 أيام عمل</p>}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </TeacherSidebarLayout>
    );
  }

  // Main Wallet View
  return (
    <TeacherSidebarLayout title="المحفظة" teacherName={teacherName}>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        {/* Balance Card */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
          <div className="teacher-wallet-card relative">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="h-5 w-5 text-white" />
                <span className="text-white/70 text-xs">الرصيد المتاح</span>
              </div>
              <p className="text-3xl font-bold mb-1 text-white">{balance.toLocaleString()} جنيه</p>
              <p className="text-white/50 text-xs mb-4">إجمالي الأرباح: {totalEarned.toLocaleString()} جنيه | تم سحب: {totalWithdrawn.toLocaleString()} جنيه</p>
              <div className="flex gap-2">
                <button onClick={() => setShowWithdraw(true)} className="teacher-btn-primary text-sm">
                  <ArrowDownCircle className="h-4 w-4" /> سحب الأرباح
                </button>
                <button onClick={() => { setEditingMethod(null); setNewMethodPhone(""); setShowAddMethod(true); }}
                  className="teacher-btn-secondary !bg-white/15 !text-white !border-white/20 hover:!bg-white/25 text-sm">
                  <Plus className="h-4 w-4" /> إضافة طريقة دفع
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quick Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => setView("payment-methods")}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500 flex items-center justify-center shrink-0">
                <Settings2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold">تعديل طرق الدفع</p>
                <p className="text-[10px] text-muted-foreground">{paymentMethods.length} طريقة مسجلة</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => setView("withdrawal-history")}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-purple-500 flex items-center justify-center shrink-0">
                <History className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold">سجل طلبات السحب</p>
                <p className="text-[10px] text-muted-foreground">{withdrawals.length} طلب</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Earnings Chart */}
        {chartData.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-500" /> نسبة الأرباح حسب الصف
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`${v.toLocaleString()} جنيه`, "الأرباح"]} />
                    <Bar dataKey="earnings" fill="hsl(217, 91%, 48%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Earnings Breakdown */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" /> تفاصيل الأرباح حسب الصف
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {gradeEarnings.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">لا توجد أرباح بعد</p>
            ) : (
              gradeEarnings.map((ge, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.08 }}
                  className="p-3 rounded-xl bg-accent/30 border border-border/50 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => { setSelectedGrade(ge); setView("grade-detail"); }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <span className="font-bold text-sm">الصف {formatGrade(ge.grade)} {formatStage(ge.stage)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-primary text-sm">{ge.totalEarned.toLocaleString()} جنيه</span>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                    <Users className="h-3 w-3" /> {ge.subscriberCount} مشترك
                  </p>
                </motion.div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Withdrawal Dialog */}
        <Dialog open={showWithdraw} onOpenChange={setShowWithdraw}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ArrowDownCircle className="h-5 w-5" />سحب الأرباح</DialogTitle>
              <DialogDescription>أدخل المبلغ واختر طريقة الاستلام</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-accent/50">
                <p className="text-sm text-muted-foreground">الرصيد المتاح</p>
                <p className="text-xl font-bold">{balance.toLocaleString()} جنيه</p>
              </div>
              <div>
                <Label>المبلغ المطلوب سحبه *</Label>
                <Input type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="أدخل المبلغ" min={1} max={balance} />
              </div>

              {paymentMethods.length === 0 ? (
                <div className="p-4 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-center">
                  <CreditCard className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                  <p className="text-sm font-bold text-amber-700 mb-2">يجب إضافة طريقة دفع أولاً</p>
                  <button onClick={() => { setShowWithdraw(false); setShowAddMethod(true); }} className="teacher-btn-primary text-xs">
                    <Plus className="h-3 w-3" /> إضافة طريقة دفع
                  </button>
                </div>
              ) : (
                <div>
                  <Label>اختر طريقة الاستلام *</Label>
                  <Select value={selectedPaymentMethodId} onValueChange={setSelectedPaymentMethodId}>
                    <SelectTrigger><SelectValue placeholder="اختر طريقة الدفع" /></SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map(pm => (
                        <SelectItem key={pm.id} value={pm.id}>
                          {methodLabels[pm.method_type] || pm.method_type} - {pm.phone_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30">
                <p className="text-xs text-amber-700 dark:text-amber-300">⏳ تستغرق العملية حتى 3 أيام عمل. يتم الإلغاء التلقائي وإرجاع المبلغ عند عدم المعالجة.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowWithdraw(false)}>إلغاء</Button>
              <Button onClick={handleWithdraw} disabled={submitting || !withdrawAmount || !selectedPaymentMethodId || paymentMethods.length === 0}
                className="gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                تأكيد السحب
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Method Dialog (from main view) */}
        <Dialog open={showAddMethod} onOpenChange={v => { setShowAddMethod(v); if (!v) setEditingMethod(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />{editingMethod ? "تعديل" : "إضافة"} طريقة دفع</DialogTitle>
              <DialogDescription>اختر نوع المحفظة وأدخل الرقم</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>نوع المحفظة *</Label>
                <Select value={newMethodType} onValueChange={setNewMethodType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vodafone_cash">فودافون كاش</SelectItem>
                    <SelectItem value="orange_cash">أورانج كاش</SelectItem>
                    <SelectItem value="etisalat_cash">اتصالات كاش</SelectItem>
                    <SelectItem value="instapay">InstaPay</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>رقم المحفظة *</Label>
                <Input value={newMethodPhone} onChange={e => setNewMethodPhone(e.target.value)} placeholder="01xxxxxxxxx" dir="ltr" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowAddMethod(false); setEditingMethod(null); }}>إلغاء</Button>
              <Button onClick={handleAddMethod} disabled={submitting || !newMethodPhone.trim()} className="gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingMethod ? "حفظ" : "إضافة"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TeacherSidebarLayout>
  );
}
