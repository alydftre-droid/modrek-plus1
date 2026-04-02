import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Wallet, TrendingUp, ArrowDownCircle, Plus, CreditCard, Users, BookOpen, Clock, CheckCircle, XCircle
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

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
  transfer_receipt_url: string | null;
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

export default function TeacherWalletPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState("");
  const [balance, setBalance] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [gradeEarnings, setGradeEarnings] = useState<GradeEarning[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // Withdrawal dialog  
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Payment method dialog
  const [showAddMethod, setShowAddMethod] = useState(false);
  const [newMethodType, setNewMethodType] = useState("vodafone_cash");
  const [newMethodPhone, setNewMethodPhone] = useState("");

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
      supabase.from("teacher_withdrawal_requests").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(20),
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

    // Batch earnings computation - fetch all groups and purchases in 2 queries max
    const assignments = (assignRes.data || []) as { stage: string; grade: string; category: string }[];
    if (assignments.length === 0) {
      setGradeEarnings([]);
      setLoading(false);
      return;
    }

    // Get all teacher's groups in one query
    const { data: allGroups } = await supabase
      .from("content_groups")
      .select("id, title, price, subject_id")
      .or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`);

    if (!allGroups?.length) {
      setGradeEarnings(assignments.map(a => ({ ...a, totalEarned: 0, subscriberCount: 0, groups: [] })));
      setLoading(false);
      return;
    }

    // Get subjects for these groups
    const subjectIds = [...new Set(allGroups.map(g => g.subject_id).filter(Boolean))];
    const { data: subjects } = await supabase.from("subjects").select("id, category, grade, stage").in("id", subjectIds);
    const subjectMap = new Map((subjects || []).map(s => [s.id, s]));

    // Get all purchases for teacher's groups in one query
    const groupIds = allGroups.map(g => g.id);
    const { data: allPurchases } = await supabase
      .from("student_group_purchases")
      .select("group_id, student_id")
      .in("group_id", groupIds);

    const purchasesByGroup = new Map<string, number>();
    for (const p of (allPurchases || [])) {
      purchasesByGroup.set(p.group_id, (purchasesByGroup.get(p.group_id) || 0) + 1);
    }

    // Map groups to assignments
    const earnings: GradeEarning[] = assignments.map(asgn => {
      const matchingGroups = allGroups.filter(g => {
        const subj = subjectMap.get(g.subject_id);
        if (!subj) return false;
        return subj.category.toLowerCase().includes(asgn.category.toLowerCase()) &&
               subj.grade.toLowerCase().includes(asgn.grade.toLowerCase()) &&
               subj.stage.toLowerCase().includes(asgn.stage.toLowerCase());
      });

      let totalGradeEarned = 0;
      let totalSubscribers = 0;
      const groupDetails = matchingGroups.map(g => {
        const sc = purchasesByGroup.get(g.id) || 0;
        totalGradeEarned += g.price * sc;
        totalSubscribers += sc;
        return { title: g.title, price: g.price, studentCount: sc };
      });

      return { ...asgn, totalEarned: totalGradeEarned, subscriberCount: totalSubscribers, groups: groupDetails };
    });

    setGradeEarnings(earnings);
    setLoading(false);
  };

  const handleWithdraw = async () => {
    if (!user || !withdrawAmount || !selectedPaymentMethodId) return;
    const amount = Number(withdrawAmount);
    const selectedMethod = paymentMethods.find(m => m.id === selectedPaymentMethodId);
    if (!selectedMethod) {
      toast.error("يرجى اختيار طريقة دفع");
      return;
    }

    if (amount <= 0 || amount > balance) {
      toast.error("المبلغ غير صالح أو أكبر من الرصيد المتاح");
      return;
    }

    setSubmitting(true);
    try {
      // Create withdrawal request
      const { error } = await supabase.from("teacher_withdrawal_requests" as any).insert({
        teacher_id: user.id,
        amount,
        payment_method: selectedMethod.method_type,
        phone_number: selectedMethod.phone_number,
      } as any);
      if (error) throw error;

      // Deduct from balance
      await supabase
        .from("teacher_wallets")
        .update({ balance: balance - amount, updated_at: new Date().toISOString() })
        .eq("teacher_id", user.id);

      // Send notification to admins
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (admins) {
        const notifications = admins.map(a => ({
          user_id: a.user_id,
          title: "طلب سحب جديد من معلم",
          message: `المعلم ${teacherName} يطلب سحب ${amount} جنيه`,
          notification_type: "withdrawal",
        }));
        await supabase.from("notifications").insert(notifications);
      }

      toast.success("تم تقديم طلب السحب بنجاح - المبلغ تم خصمه من رصيدك");
      setShowWithdraw(false);
      setWithdrawAmount("");
      fetchAll();
    } catch (e) {
      console.error(e);
      toast.error("خطأ في تقديم طلب السحب");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMethod = async () => {
    if (!user || !newMethodPhone.trim()) return;
    setSubmitting(true);
    try {
      await supabase.from("teacher_payment_methods").insert({
        teacher_id: user.id,
        method_type: newMethodType,
        phone_number: newMethodPhone.trim(),
      });
      toast.success("تم إضافة طريقة الدفع");
      setShowAddMethod(false);
      setNewMethodPhone("");
      fetchAll();
    } catch (e) {
      toast.error("خطأ في إضافة طريقة الدفع");
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

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge className="bg-amber-100 text-amber-700 border-0"><Clock className="h-3 w-3 ml-1" />تحت المراجعة</Badge>;
    if (status === "approved") return <Badge className="bg-emerald-100 text-emerald-700 border-0"><CheckCircle className="h-3 w-3 ml-1" />مكتمل</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-700 border-0"><XCircle className="h-3 w-3 ml-1" />مرفوض</Badge>;
    return <Badge>{status}</Badge>;
  };

  const selectedMethodForWithdraw = useMemo(() =>
    paymentMethods.find(m => m.id === selectedPaymentMethodId),
    [paymentMethods, selectedPaymentMethodId]
  );

  if (loading) {
    return (
      <TeacherSidebarLayout title="المحفظة" teacherName={teacherName}>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
      </TeacherSidebarLayout>
    );
  }

  const overallEarned = gradeEarnings.reduce((s, g) => s + g.totalEarned, 0);

  return (
    <TeacherSidebarLayout title="المحفظة" teacherName={teacherName}>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        {/* Balance Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="teacher-wallet-card relative">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <Wallet className="h-6 w-6 text-white" />
                <span className="text-white/70 text-sm">الرصيد المتاح</span>
              </div>
              <p className="text-4xl font-bold mb-2 text-white">{balance.toLocaleString()} جنيه</p>
              <p className="text-white/60 text-sm mb-6">إجمالي الأرباح: {overallEarned.toLocaleString()} جنيه</p>
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => setShowWithdraw(true)}
                  className="teacher-btn-primary"
                >
                  <ArrowDownCircle className="h-4 w-4" />
                  سحب الأرباح
                </button>
                <button
                  onClick={() => setShowAddMethod(true)}
                  className="teacher-btn-secondary !bg-white/15 !text-white !border-white/20 hover:!bg-white/25"
                >
                  <Plus className="h-4 w-4" />
                  إضافة طريقة دفع
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Payment Methods */}
        <Card className="teacher-settings-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="card-icon card-icon--blue">
                <CreditCard className="h-4 w-4" />
              </div>
              طرق الدفع المسجلة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {paymentMethods.length === 0 ? (
              <div className="text-center py-6">
                <CreditCard className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground mb-3">لم تضف أي طريقة دفع بعد</p>
                <button onClick={() => setShowAddMethod(true)} className="teacher-btn-primary text-sm">
                  <Plus className="h-4 w-4" /> إضافة طريقة دفع
                </button>
              </div>
            ) : (
              <>
                {paymentMethods.map(pm => (
                  <div key={pm.id} className="flex items-center justify-between p-3 rounded-xl bg-accent/50 border border-border/50">
                    <div className="flex items-center gap-3">
                      <div className="teacher-stat-icon teacher-stat-icon--blue h-9 w-9 rounded-xl">
                        <CreditCard className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">{methodLabels[pm.method_type] || pm.method_type}</p>
                        <p className="text-xs text-muted-foreground font-mono">{pm.phone_number}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteMethod(pm.id)}>
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <button onClick={() => setShowAddMethod(true)} className="teacher-btn-secondary w-full justify-center text-sm mt-2">
                  <Plus className="h-4 w-4" /> إضافة طريقة دفع جديدة
                </button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Earnings Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              تفاصيل الأرباح حسب الصف
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {gradeEarnings.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">لا توجد أرباح بعد</p>
            ) : (
              gradeEarnings.map((ge, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="p-4 rounded-xl bg-accent/30 border border-border/50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <span className="font-bold text-sm">الصف {formatGrade(ge.grade)} {formatStage(ge.stage)}</span>
                    </div>
                    <span className="font-bold text-primary">{ge.totalEarned.toLocaleString()} جنيه</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{ge.subscriberCount} مشترك</span>
                  </div>
                  {ge.groups.length > 0 && (
                    <div className="space-y-2">
                      {ge.groups.map((g, j) => (
                        <div key={j} className="flex items-center justify-between text-sm p-2 rounded-lg bg-background/60">
                          <span>{g.title}</span>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{g.studentCount} طالب</span>
                            <span className="font-medium text-foreground">{(g.price * g.studentCount).toLocaleString()} جنيه</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Withdrawal History */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowDownCircle className="h-5 w-5" />
              سجل طلبات السحب
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {withdrawals.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">لا توجد طلبات سحب</p>
            ) : (
              withdrawals.map(w => (
                <div key={w.id} className="p-4 rounded-xl bg-accent/30 border border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold">{w.amount.toLocaleString()} جنيه</span>
                    {statusBadge(w.status)}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>{methodLabels[w.payment_method] || w.payment_method} - {w.phone_number}</p>
                    <p>{new Date(w.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</p>
                    {w.admin_message && (
                      <p className="text-foreground bg-background/60 p-2 rounded-lg mt-2">{w.admin_message}</p>
                    )}
                    {w.status === "pending" && (
                      <p className="text-amber-600 mt-1">⏳ تستغرق عملية السحب من ساعة إلى 3 أيام</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Withdrawal Dialog */}
        <Dialog open={showWithdraw} onOpenChange={setShowWithdraw}>
          <DialogContent className="max-w-md" aria-describedby="withdraw-desc">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ArrowDownCircle className="h-5 w-5" />سحب الأرباح</DialogTitle>
            </DialogHeader>
            <div className="space-y-4" id="withdraw-desc">
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
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-300 mb-2">يجب إضافة طريقة دفع أولاً</p>
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
                  {selectedMethodForWithdraw && (
                    <div className="mt-2 p-2.5 rounded-lg bg-accent/50 flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-primary" />
                      <span className="text-sm">{methodLabels[selectedMethodForWithdraw.method_type]}: <strong className="font-mono">{selectedMethodForWithdraw.phone_number}</strong></span>
                    </div>
                  )}
                </div>
              )}

              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                <p className="text-sm text-amber-700 dark:text-amber-300">⏳ تستغرق عملية السحب حتى 3 أيام عمل. في حالة عدم المعالجة خلال 3 أيام يُلغى الطلب ويُرد المبلغ تلقائياً.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowWithdraw(false)}>إلغاء</Button>
              <Button onClick={handleWithdraw} disabled={submitting || !withdrawAmount || !selectedPaymentMethodId || paymentMethods.length === 0} className="gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                تأكيد السحب
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Payment Method Dialog */}
        <Dialog open={showAddMethod} onOpenChange={setShowAddMethod}>
          <DialogContent className="max-w-md" aria-describedby="add-method-desc">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />إضافة طريقة دفع</DialogTitle>
            </DialogHeader>
            <div className="space-y-4" id="add-method-desc">
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
              <Button variant="outline" onClick={() => setShowAddMethod(false)}>إلغاء</Button>
              <Button onClick={handleAddMethod} disabled={submitting || !newMethodPhone.trim()} className="gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                إضافة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TeacherSidebarLayout>
  );
}
