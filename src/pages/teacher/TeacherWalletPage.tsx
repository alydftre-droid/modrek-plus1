import { useEffect, useState } from "react";
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
  const [withdrawMethod, setWithdrawMethod] = useState("vodafone_cash");
  const [withdrawPhone, setWithdrawPhone] = useState("");
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
      supabase.from("teacher_withdrawal_requests").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }),
    ]);

    if (profileRes.data) setTeacherName(profileRes.data.full_name);

    // Create wallet if not exists
    if (!walletRes.data) {
      await supabase.from("teacher_wallets").insert({ teacher_id: user.id, balance: 0, total_earned: 0 });
      setBalance(0);
      setTotalEarned(0);
    } else {
      setBalance(walletRes.data.balance || 0);
      setTotalEarned(walletRes.data.total_earned || 0);
    }

    setPaymentMethods((methodsRes.data || []) as PaymentMethod[]);
    setWithdrawals((withdrawRes.data || []) as WithdrawalRequest[]);

    // Compute earnings per grade
    const assignments = (assignRes.data || []) as { stage: string; grade: string; category: string }[];
    const earnings: GradeEarning[] = [];

    for (const asgn of assignments) {
      const { data: subjects } = await supabase
        .from("subjects").select("id")
        .ilike("category", `%${asgn.category}%`)
        .ilike("grade", `%${asgn.grade}%`)
        .ilike("stage", `%${asgn.stage}%`);

      const subjectIds = subjects?.map(s => s.id) || [];
      if (subjectIds.length === 0) {
        earnings.push({ ...asgn, totalEarned: 0, subscriberCount: 0, groups: [] });
        continue;
      }

      const { data: groups } = await supabase
        .from("content_groups")
        .select("id, title, price")
        .in("subject_id", subjectIds)
        .or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`);

      const groupDetails: { title: string; price: number; studentCount: number }[] = [];
      let totalGradeEarned = 0;
      let totalSubscribers = 0;

      for (const g of (groups || [])) {
        const { count } = await supabase
          .from("student_group_purchases")
          .select("*", { count: "exact", head: true })
          .eq("group_id", g.id);

        const sc = count || 0;
        groupDetails.push({ title: g.title, price: g.price, studentCount: sc });
        totalGradeEarned += g.price * sc;
        totalSubscribers += sc;
      }

      earnings.push({
        ...asgn,
        totalEarned: totalGradeEarned,
        subscriberCount: totalSubscribers,
        groups: groupDetails,
      });
    }

    setGradeEarnings(earnings);
    setLoading(false);
  };

  const handleWithdraw = async () => {
    if (!user || !withdrawAmount || !withdrawPhone) return;
    const amount = Number(withdrawAmount);
    if (amount <= 0 || amount > balance) {
      toast.error("المبلغ غير صالح أو أكبر من الرصيد المتاح");
      return;
    }

    setSubmitting(true);
    try {
      // Create withdrawal request
      const { error } = await supabase.from("teacher_withdrawal_requests").insert({
        teacher_id: user.id,
        amount,
        payment_method: withdrawMethod,
        phone_number: withdrawPhone,
      });
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
      setWithdrawPhone("");
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

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge className="bg-amber-100 text-amber-700 border-0"><Clock className="h-3 w-3 ml-1" />تحت المراجعة</Badge>;
    if (status === "approved") return <Badge className="bg-emerald-100 text-emerald-700 border-0"><CheckCircle className="h-3 w-3 ml-1" />مكتمل</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-700 border-0"><XCircle className="h-3 w-3 ml-1" />مرفوض</Badge>;
    return <Badge>{status}</Badge>;
  };

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
          <Card className="overflow-hidden border-0 bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground">
            <CardContent className="p-6 md:p-8">
              <div className="flex items-center gap-2 mb-4">
                <Wallet className="h-6 w-6" />
                <span className="text-primary-foreground/70 text-sm">الرصيد المتاح</span>
              </div>
              <p className="text-4xl font-bold mb-2">{balance.toLocaleString()} جنيه</p>
              <p className="text-primary-foreground/60 text-sm mb-6">إجمالي الأرباح: {overallEarned.toLocaleString()} جنيه</p>
              <div className="flex gap-3">
                <Button
                  onClick={() => setShowWithdraw(true)}
                  className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 gap-2"
                >
                  <ArrowDownCircle className="h-4 w-4" />
                  سحب الأرباح
                </Button>
                <Button
                  onClick={() => setShowAddMethod(true)}
                  variant="outline"
                  className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 gap-2"
                >
                  <Plus className="h-4 w-4" />
                  إضافة طريقة دفع
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Payment Methods */}
        {paymentMethods.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                طرق الدفع المسجلة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {paymentMethods.map(pm => (
                <div key={pm.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/50">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <CreditCard className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{methodLabels[pm.method_type] || pm.method_type}</p>
                      <p className="text-xs text-muted-foreground">{pm.phone_number}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

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
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ArrowDownCircle className="h-5 w-5" />سحب الأرباح</DialogTitle>
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
              <div>
                <Label>طريقة الاستلام *</Label>
                <Select value={withdrawMethod} onValueChange={setWithdrawMethod}>
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
                <Label>رقم الاستلام *</Label>
                <Input value={withdrawPhone} onChange={e => setWithdrawPhone(e.target.value)} placeholder="أدخل رقم المحفظة" dir="ltr" />
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                <p className="text-sm text-amber-700 dark:text-amber-300">⏳ تستغرق عملية السحب من ساعة إلى 3 أيام عمل</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowWithdraw(false)}>إلغاء</Button>
              <Button onClick={handleWithdraw} disabled={submitting || !withdrawAmount || !withdrawPhone} className="gap-2">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                تأكيد السحب
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Payment Method Dialog */}
        <Dialog open={showAddMethod} onOpenChange={setShowAddMethod}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />إضافة طريقة دفع</DialogTitle>
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
              <Button variant="outline" onClick={() => setShowAddMethod(false)}>إلغاء</Button>
              <Button onClick={handleAddMethod} disabled={submitting || !newMethodPhone.trim()} className="gap-2">
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
