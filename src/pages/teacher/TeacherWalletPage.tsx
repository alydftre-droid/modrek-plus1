import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherProfile, useTeacherWallet, useTeacherPaymentMethods, useTeacherWithdrawals, useTeacherAssignments } from "@/hooks/useTeacherData";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  ChevronLeft, TrendingUp, History, Settings2, BarChart3, Calendar
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const methodLabels: Record<string, string> = {
  vodafone_cash: "فودافون كاش", orange_cash: "أورانج كاش", etisalat_cash: "اتصالات كاش", instapay: "InstaPay",
};
const formatGrade = (g: string) => g === "first" ? "الأول" : g === "second" ? "الثاني" : g === "third" ? "الثالث" : g;
const formatStage = (s: string) => s === "secondary" ? "الثانوي" : s === "preparatory" ? "الإعدادي" : s;

type WalletView = "main" | "payment-methods" | "withdrawal-history" | "grade-detail";

interface GradeEarning {
  grade: string; stage: string; category: string; totalEarned: number; subscriberCount: number;
  groups: { title: string; price: number; studentCount: number; monthlyData: { month: string; earned: number; students: number }[] }[];
}

export default function TeacherWalletPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useTeacherProfile();
  const { data: wallet, isLoading: walletLoading } = useTeacherWallet();
  const { data: paymentMethods = [] } = useTeacherPaymentMethods();
  const { data: withdrawals = [] } = useTeacherWithdrawals();
  const { data: assignments = [] } = useTeacherAssignments();

  const [view, setView] = useState<WalletView>("main");
  const [selectedGrade, setSelectedGrade] = useState<GradeEarning | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState(paymentMethods[0]?.id || "");
  const [submitting, setSubmitting] = useState(false);
  const [showAddMethod, setShowAddMethod] = useState(false);
  const [newMethodType, setNewMethodType] = useState("vodafone_cash");
  const [newMethodPhone, setNewMethodPhone] = useState("");
  const [editingMethod, setEditingMethod] = useState<any>(null);

  const teacherName = profile?.full_name || "";
  const balance = wallet?.balance || 0;
  const totalEarned = wallet?.total_earned || 0;

  // Fetch earnings data
  const { data: gradeEarnings = [], isLoading: earningsLoading } = useQuery({
    queryKey: ["teacher-earnings", user?.id],
    queryFn: async () => {
      if (!user || !assignments.length) return [];
      const { data: allGroups } = await supabase.from("content_groups").select("id, title, price, subject_id")
        .or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`);
      if (!allGroups?.length) return assignments.map(a => ({ ...a, totalEarned: 0, subscriberCount: 0, groups: [] }));

      const subjectIds = [...new Set(allGroups.map(g => g.subject_id).filter(Boolean))];
      const { data: subjects } = await supabase.from("subjects").select("id, category, grade, stage").in("id", subjectIds);
      const subjectMap = new Map((subjects || []).map(s => [s.id, s]));
      const groupIds = allGroups.map(g => g.id);
      const { data: allPurchases } = await supabase.from("student_group_purchases").select("group_id, student_id, purchased_at, amount_paid").in("group_id", groupIds);

      return assignments.map(asgn => {
        const matchingGroups = allGroups.filter(g => {
          const subj = subjectMap.get(g.subject_id);
          return subj && subj.category.toLowerCase().includes(asgn.category.toLowerCase()) &&
            subj.grade.toLowerCase().includes(asgn.grade.toLowerCase()) && subj.stage.toLowerCase().includes(asgn.stage.toLowerCase());
        });

        let totalGradeEarned = 0;
        const allStudents = new Set<string>();
        const groupDetails = matchingGroups.map(g => {
          const gPurchases = (allPurchases || []).filter(p => p.group_id === g.id);
          const sc = gPurchases.length;
          const earned = gPurchases.reduce((s, p) => s + (p.amount_paid || g.price) * 0.7, 0);
          totalGradeEarned += earned;
          gPurchases.forEach(p => allStudents.add(p.student_id));

          // Monthly breakdown
          const monthMap = new Map<string, { earned: number; students: Set<string> }>();
          gPurchases.forEach(p => {
            const d = new Date(p.purchased_at);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString("ar-EG", { year: "numeric", month: "long" });
            if (!monthMap.has(key)) monthMap.set(key, { earned: 0, students: new Set() });
            const m = monthMap.get(key)!;
            m.earned += (p.amount_paid || g.price) * 0.7;
            m.students.add(p.student_id);
          });
          const monthlyData = [...monthMap.entries()]
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([key, v]) => {
              const d = new Date(key + "-01");
              return { month: d.toLocaleDateString("ar-EG", { year: "numeric", month: "long" }), earned: Math.round(v.earned), students: v.students.size };
            });

          return { title: g.title, price: g.price, studentCount: sc, monthlyData };
        });

        return { ...asgn, totalEarned: Math.round(totalGradeEarned), subscriberCount: allStudents.size, groups: groupDetails };
      });
    },
    enabled: !!user && assignments.length > 0,
    staleTime: 60 * 1000,
  });

  const totalWithdrawn = useMemo(() => withdrawals.filter((w: any) => w.status === "approved").reduce((s: number, w: any) => s + w.amount, 0), [withdrawals]);
  const pendingWithdrawal = withdrawals.find((w: any) => w.status === "pending");
  const loading = walletLoading || earningsLoading;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["teacher-wallet"] });
    qc.invalidateQueries({ queryKey: ["teacher-payment-methods"] });
    qc.invalidateQueries({ queryKey: ["teacher-withdrawals"] });
    qc.invalidateQueries({ queryKey: ["teacher-earnings"] });
  };

  const handleWithdraw = async () => {
    if (!user || !withdrawAmount || !selectedPaymentMethodId) return;
    const amount = Number(withdrawAmount);
    const method = paymentMethods.find((m: any) => m.id === selectedPaymentMethodId);
    if (!method) { toast.error("اختر طريقة دفع"); return; }
    if (amount <= 0 || amount > balance) { toast.error("المبلغ غير صالح"); return; }
    setSubmitting(true);
    try {
      await supabase.from("teacher_withdrawal_requests" as any).insert({ teacher_id: user.id, amount, payment_method: method.method_type, phone_number: method.phone_number } as any);
      await supabase.from("teacher_wallets").update({ balance: balance - amount, updated_at: new Date().toISOString() }).eq("teacher_id", user.id);
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (admins) await supabase.from("notifications").insert(admins.map(a => ({ user_id: a.user_id, title: "طلب سحب جديد", message: `المعلم ${teacherName} يطلب سحب ${amount} جنيه`, notification_type: "withdrawal" })));
      toast.success("تم تقديم طلب السحب");
      setShowWithdraw(false); setWithdrawAmount("");
      invalidateAll();
    } catch { toast.error("خطأ في تقديم الطلب"); }
    finally { setSubmitting(false); }
  };

  const handleAddMethod = async () => {
    if (!user || !newMethodPhone.trim()) return;
    setSubmitting(true);
    try {
      if (editingMethod) {
        await supabase.from("teacher_payment_methods").update({ method_type: newMethodType, phone_number: newMethodPhone.trim() }).eq("id", editingMethod.id);
      } else {
        await supabase.from("teacher_payment_methods").insert({ teacher_id: user.id, method_type: newMethodType, phone_number: newMethodPhone.trim() });
      }
      toast.success(editingMethod ? "تم التعديل" : "تم الإضافة");
      setShowAddMethod(false); setNewMethodPhone(""); setEditingMethod(null);
      invalidateAll();
    } catch { toast.error("خطأ"); }
    finally { setSubmitting(false); }
  };

  const handleDeleteMethod = async (id: string) => {
    await supabase.from("teacher_payment_methods").delete().eq("id", id);
    toast.success("تم الحذف");
    invalidateAll();
  };

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]"><Clock className="h-3 w-3 ml-0.5" />معلق</Badge>;
    if (status === "approved") return <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]"><CheckCircle className="h-3 w-3 ml-0.5" />مكتمل</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-700 border-0 text-[10px]"><XCircle className="h-3 w-3 ml-0.5" />مرفوض</Badge>;
    return <Badge className="text-[10px]">{status}</Badge>;
  };

  if (loading) {
    return <TeacherSidebarLayout title="المحفظة" teacherName={teacherName}><div className="flex items-center justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div></TeacherSidebarLayout>;
  }

  // Grade Detail View with chart and monthly records
  if (view === "grade-detail" && selectedGrade) {
    const allMonthly = selectedGrade.groups.flatMap(g => g.monthlyData);
    const monthAgg = new Map<string, { earned: number; students: number }>();
    allMonthly.forEach(m => {
      const existing = monthAgg.get(m.month) || { earned: 0, students: 0 };
      monthAgg.set(m.month, { earned: existing.earned + m.earned, students: existing.students + m.students });
    });
    const chartData = [...monthAgg.entries()].map(([month, v]) => ({ name: month, earnings: v.earned, students: v.students }));

    return (
      <TeacherSidebarLayout title="تفاصيل الأرباح" teacherName={teacherName}>
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
          <Button variant="ghost" onClick={() => { setView("main"); setSelectedGrade(null); }} className="gap-1">
            <ChevronLeft className="h-4 w-4 rotate-180" /> رجوع للمحفظة
          </Button>

          <div className="teacher-hero-card !py-4 !px-5">
            <div className="relative z-10">
              <h2 className="text-lg font-bold text-primary-foreground">الصف {formatGrade(selectedGrade.grade)} {formatStage(selectedGrade.stage)}</h2>
              <p className="text-primary-foreground/60 text-xs">{selectedGrade.category}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-primary">{selectedGrade.totalEarned.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">جنيه أرباح</p></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-emerald-600">{selectedGrade.subscriberCount}</p><p className="text-[10px] text-muted-foreground">مشترك</p></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-purple-600">{selectedGrade.groups.length}</p><p className="text-[10px] text-muted-foreground">مجموعة</p></CardContent></Card>
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> الأرباح الشهرية</CardTitle></CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => [`${v.toLocaleString()} جنيه`, "الأرباح"]} />
                      <Bar dataKey="earnings" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Monthly Records */}
          {chartData.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> سجل الأشهر</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {chartData.map((m, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-accent/50 text-sm">
                    <div><p className="font-bold">{m.name}</p><p className="text-[10px] text-muted-foreground">{m.students} مشترك</p></div>
                    <span className="font-bold text-primary">{m.earnings.toLocaleString()} ج</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Groups */}
          {selectedGrade.groups.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm">المجموعات</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {selectedGrade.groups.map((g, j) => (
                  <div key={j} className="p-3 rounded-xl bg-accent/50 text-sm">
                    <div className="flex items-center justify-between">
                      <div><p className="font-bold">{g.title}</p><p className="text-[10px] text-muted-foreground">{g.studentCount} طالب × {g.price} ج × 70%</p></div>
                      <span className="font-bold text-primary">{Math.round(g.price * g.studentCount * 0.7).toLocaleString()} ج</span>
                    </div>
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
          <Button variant="ghost" onClick={() => setView("main")} className="gap-1"><ChevronLeft className="h-4 w-4 rotate-180" /> رجوع</Button>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> طرق الدفع</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {paymentMethods.length === 0 ? (
                <div className="text-center py-8"><CreditCard className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" /><p className="text-sm text-muted-foreground mb-3">لم تضف طريقة دفع</p></div>
              ) : paymentMethods.map((pm: any) => (
                <div key={pm.id} className="flex items-center justify-between p-3 rounded-xl bg-accent/50">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center"><CreditCard className="h-5 w-5 text-primary-foreground" /></div>
                    <div><p className="text-sm font-bold">{methodLabels[pm.method_type] || pm.method_type}</p><p className="text-xs text-muted-foreground font-mono">{pm.phone_number}</p></div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setEditingMethod(pm); setNewMethodType(pm.method_type); setNewMethodPhone(pm.phone_number); setShowAddMethod(true); }}>تعديل</Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteMethod(pm.id)}><XCircle className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
              <button onClick={() => { setEditingMethod(null); setNewMethodPhone(""); setShowAddMethod(true); }} className="teacher-btn-primary w-full justify-center text-sm"><Plus className="h-4 w-4" /> إضافة طريقة دفع</button>
            </CardContent>
          </Card>
        </div>
        <MethodDialog open={showAddMethod} onOpenChange={v => { setShowAddMethod(v); if (!v) setEditingMethod(null); }} editing={editingMethod} methodType={newMethodType} setMethodType={setNewMethodType} phone={newMethodPhone} setPhone={setNewMethodPhone} onSubmit={handleAddMethod} submitting={submitting} />
      </TeacherSidebarLayout>
    );
  }

  // Withdrawal History
  if (view === "withdrawal-history") {
    return (
      <TeacherSidebarLayout title="سجل السحب" teacherName={teacherName}>
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
          <Button variant="ghost" onClick={() => setView("main")} className="gap-1"><ChevronLeft className="h-4 w-4 rotate-180" /> رجوع</Button>
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-lg font-bold">{withdrawals.length}</p><p className="text-[10px] text-muted-foreground">إجمالي الطلبات</p></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-emerald-600">{totalWithdrawn.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">تم تحويلها</p></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-amber-600">{withdrawals.filter((w: any) => w.status === "pending").length}</p><p className="text-[10px] text-muted-foreground">معلقة</p></CardContent></Card>
          </div>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 space-y-3">
              {withdrawals.length === 0 ? <p className="text-center text-muted-foreground py-8">لا توجد طلبات</p> : withdrawals.map((w: any) => (
                <div key={w.id} className="p-3 rounded-xl bg-accent/30 border border-border/50">
                  <div className="flex items-center justify-between mb-1"><span className="font-bold text-sm">{w.amount.toLocaleString()} جنيه</span>{statusBadge(w.status)}</div>
                  <div className="text-[11px] text-muted-foreground space-y-0.5">
                    <p>{methodLabels[w.payment_method] || w.payment_method} - {w.phone_number}</p>
                    <p>{new Date(w.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</p>
                    {w.admin_message && <p className="text-foreground bg-background/60 p-2 rounded-lg mt-1">{w.admin_message}</p>}
                    {w.status === "pending" && <p className="text-amber-600 mt-1">⏳ يتم إلغاء الطلب تلقائياً بعد 3 أيام عمل</p>}
                  </div>
                </div>
              ))}
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
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
          <div className="teacher-wallet-card relative">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3"><Wallet className="h-5 w-5 text-primary-foreground" /><span className="text-primary-foreground/70 text-xs">الرصيد المتاح</span></div>
              <p className="text-3xl font-bold mb-1 text-primary-foreground">{balance.toLocaleString()} جنيه</p>
              <p className="text-primary-foreground/50 text-xs mb-4">إجمالي الأرباح: {totalEarned.toLocaleString()} ج | تم سحب: {totalWithdrawn.toLocaleString()} ج</p>
              <div className="flex gap-2">
                <button onClick={() => setShowWithdraw(true)} className="teacher-btn-primary text-sm"><ArrowDownCircle className="h-4 w-4" /> سحب</button>
                <button onClick={() => { setEditingMethod(null); setNewMethodPhone(""); setShowAddMethod(true); }} className="teacher-btn-secondary !bg-white/15 !text-primary-foreground !border-white/20 hover:!bg-white/25 text-sm"><Plus className="h-4 w-4" /> طريقة دفع</button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Pending Withdrawal Notice */}
        {pendingWithdrawal && (
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 border-0 shadow-sm">
            <CardContent className="p-3 flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-700">طلب سحب معلق: {(pendingWithdrawal as any).amount.toLocaleString()} جنيه</p>
                <p className="text-[10px] text-amber-600">بانتظار الموافقة - {new Date((pendingWithdrawal as any).created_at).toLocaleDateString("ar-EG")}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => setView("payment-methods")}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shrink-0"><Settings2 className="h-5 w-5 text-primary-foreground" /></div>
              <div><p className="text-sm font-bold">طرق الدفع</p><p className="text-[10px] text-muted-foreground">{paymentMethods.length} مسجلة</p></div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => setView("withdrawal-history")}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center shrink-0"><History className="h-5 w-5 text-secondary-foreground" /></div>
              <div><p className="text-sm font-bold">سجل السحب</p><p className="text-[10px] text-muted-foreground">{withdrawals.length} طلب</p></div>
            </CardContent>
          </Card>
        </div>

        {/* Earnings Breakdown */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> تفاصيل الأرباح حسب الصف</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {gradeEarnings.length === 0 ? <p className="text-center text-muted-foreground py-6 text-sm">لا توجد أرباح</p> : gradeEarnings.map((ge, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.08 }}
                className="p-3 rounded-xl bg-accent/30 border border-border/50 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => { setSelectedGrade(ge); setView("grade-detail"); }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /><span className="font-bold text-sm">الصف {formatGrade(ge.grade)} {formatStage(ge.stage)}</span></div>
                  <div className="flex items-center gap-2"><span className="font-bold text-primary text-sm">{ge.totalEarned.toLocaleString()} ج</span><ChevronLeft className="h-4 w-4 text-muted-foreground" /></div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2"><Users className="h-3 w-3" /> {ge.subscriberCount} مشترك</p>
              </motion.div>
            ))}
          </CardContent>
        </Card>

        {/* Withdraw Dialog */}
        <Dialog open={showWithdraw} onOpenChange={setShowWithdraw}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowDownCircle className="h-5 w-5" />سحب</DialogTitle><DialogDescription>أدخل المبلغ واختر طريقة الاستلام</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-accent/50"><p className="text-sm text-muted-foreground">الرصيد</p><p className="text-xl font-bold">{balance.toLocaleString()} جنيه</p></div>
              <div><Label>المبلغ *</Label><Input type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="المبلغ" min={1} max={balance} /></div>
              {paymentMethods.length === 0 ? (
                <div className="p-4 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 text-center">
                  <p className="text-sm font-bold text-amber-700 mb-2">أضف طريقة دفع أولاً</p>
                  <button onClick={() => { setShowWithdraw(false); setShowAddMethod(true); }} className="teacher-btn-primary text-xs"><Plus className="h-3 w-3" /> إضافة</button>
                </div>
              ) : (
                <div><Label>طريقة الاستلام *</Label>
                  <Select value={selectedPaymentMethodId} onValueChange={setSelectedPaymentMethodId}>
                    <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>{paymentMethods.map((pm: any) => <SelectItem key={pm.id} value={pm.id}>{methodLabels[pm.method_type] || pm.method_type} - {pm.phone_number}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200"><p className="text-xs text-amber-700">⏳ تستغرق حتى 3 أيام عمل</p></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowWithdraw(false)}>إلغاء</Button>
              <Button onClick={handleWithdraw} disabled={submitting || !withdrawAmount || !selectedPaymentMethodId || paymentMethods.length === 0} className="gap-2 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground border-0">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <MethodDialog open={showAddMethod} onOpenChange={v => { setShowAddMethod(v); if (!v) setEditingMethod(null); }} editing={editingMethod} methodType={newMethodType} setMethodType={setNewMethodType} phone={newMethodPhone} setPhone={setNewMethodPhone} onSubmit={handleAddMethod} submitting={submitting} />
      </div>
    </TeacherSidebarLayout>
  );
}

function MethodDialog({ open, onOpenChange, editing, methodType, setMethodType, phone, setPhone, onSubmit, submitting }: any) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />{editing ? "تعديل" : "إضافة"} طريقة دفع</DialogTitle><DialogDescription>اختر النوع وأدخل الرقم</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div><Label>نوع المحفظة *</Label><Select value={methodType} onValueChange={setMethodType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="vodafone_cash">فودافون كاش</SelectItem><SelectItem value="orange_cash">أورانج كاش</SelectItem><SelectItem value="etisalat_cash">اتصالات كاش</SelectItem><SelectItem value="instapay">InstaPay</SelectItem></SelectContent></Select></div>
          <div><Label>الرقم *</Label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="01xxxxxxxxx" dir="ltr" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={onSubmit} disabled={submitting || !phone.trim()} className="gap-2 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground border-0">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "حفظ" : "إضافة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
