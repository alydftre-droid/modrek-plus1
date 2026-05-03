import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherProfile, useTeacherPaymentMethods, useTeacherWithdrawals, useTeacherAssignments } from "@/hooks/useTeacherData";
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
  ChevronLeft, TrendingUp, History, Settings2, BarChart3, Calendar, Lock, Archive, Calculator, Info,
  Sparkles, Eye, EyeOff, Shield, Zap, Trash2, Pencil, Banknote, ArrowUpRight, Snowflake,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Area, AreaChart } from "recharts";

const methodLabels: Record<string, string> = {
  vodafone_cash: "فودافون كاش", orange_cash: "أورانج كاش", etisalat_cash: "اتصالات كاش", instapay: "InstaPay",
};
const methodColors: Record<string, string> = {
  vodafone_cash: "from-rose-500 to-red-600",
  orange_cash: "from-orange-500 to-amber-600",
  etisalat_cash: "from-emerald-500 to-green-600",
  instapay: "from-violet-500 to-purple-600",
};
const formatGrade = (g: string) => g === "first" ? "الأول" : g === "second" ? "الثاني" : g === "third" ? "الثالث" : g;
const formatStage = (s: string) => s === "secondary" ? "الثانوي" : s === "preparatory" ? "الإعدادي" : s;
const monthLabel = (period: string) => {
  const [y, m] = period.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("ar-EG", { year: "numeric", month: "long" });
};
const fmtMoney = (n: number) => Math.round(n).toLocaleString("ar-EG");

type WalletView = "main" | "payment-methods" | "withdrawal-history" | "grade-detail" | "archives" | "archive-detail";

interface GradeNode {
  key: string;
  grade: string;
  stage: string;
  category: string;
  totalEarned: number;
  subscriberCount: number;
  groupCount: number;
}

export default function TeacherWalletPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useTeacherProfile();
  const { data: paymentMethods = [] } = useTeacherPaymentMethods();
  const { data: withdrawals = [] } = useTeacherWithdrawals();
  const { data: assignments = [] } = useTeacherAssignments();

  const [view, setView] = useState<WalletView>("main");
  const [selectedGradeKey, setSelectedGradeKey] = useState<string | null>(null);
  const [selectedArchiveId, setSelectedArchiveId] = useState<string | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showAddMethod, setShowAddMethod] = useState(false);
  const [newMethodType, setNewMethodType] = useState("vodafone_cash");
  const [newMethodPhone, setNewMethodPhone] = useState("");
  const [editingMethod, setEditingMethod] = useState<any>(null);
  const [hideBalance, setHideBalance] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ amount: number; method: string; phone: string; remaining: number; refId: string } | null>(null);

  const teacherName = profile?.full_name || "";

  useEffect(() => {
    if (paymentMethods.length && !selectedPaymentMethodId) setSelectedPaymentMethodId(paymentMethods[0].id);
  }, [paymentMethods, selectedPaymentMethodId]);

  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ["teacher-wallet-v2", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("teacher_wallets").select("*").eq("teacher_id", user.id).maybeSingle();
      if (!data) {
        await supabase.from("teacher_wallets").insert({ teacher_id: user.id, balance: 0, total_earned: 0 });
        return { balance: 0, total_earned: 0, frozen_balance: 0, current_period: new Date().toISOString().slice(0, 7) };
      }
      return data as any;
    },
    enabled: !!user, staleTime: 30 * 1000,
  });

  const { data: settings } = useQuery({
    queryKey: ["withdrawal-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("key, value")
        .in("key", ["withdrawal_open_day", "withdrawal_manual_state", "withdrawal_notice_message", "teacher_commission_rate"]);
      const m = new Map((data || []).map((r: any) => [r.key, r.value]));
      return {
        openDay: parseInt(m.get("withdrawal_open_day") || "25"),
        manual: m.get("withdrawal_manual_state") || "auto",
        notice: m.get("withdrawal_notice_message") || "",
        rate: parseFloat(m.get("teacher_commission_rate") || "0.70"),
      };
    },
    staleTime: 60 * 1000,
  });

  const { data: currentRecords = [], isLoading: earningsLoading } = useQuery({
    queryKey: ["teacher-earnings-current", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("teacher_earning_records" as any).select("*")
        .eq("teacher_id", user.id).eq("is_archived", false).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user, staleTime: 30 * 1000,
  });

  const subjectIds = useMemo(() => [...new Set(currentRecords.map((r: any) => r.subject_id).filter(Boolean))], [currentRecords]);
  const groupIds = useMemo(() => [...new Set(currentRecords.map((r: any) => r.group_id).filter(Boolean))], [currentRecords]);

  const { data: meta } = useQuery({
    queryKey: ["teacher-earnings-meta", subjectIds.join(","), groupIds.join(",")],
    queryFn: async () => {
      const [subRes, grpRes] = await Promise.all([
        subjectIds.length ? supabase.from("subjects").select("id, name, stage, grade, category").in("id", subjectIds as any) : Promise.resolve({ data: [] }),
        groupIds.length ? supabase.from("content_groups").select("id, title, price").in("id", groupIds as any) : Promise.resolve({ data: [] }),
      ]);
      return {
        subjects: new Map((subRes.data || []).map((s: any) => [s.id, s])),
        groups: new Map((grpRes.data || []).map((g: any) => [g.id, g])),
      };
    },
    enabled: subjectIds.length > 0 || groupIds.length > 0,
  });

  const gradeNodes: GradeNode[] = useMemo(() => {
    if (!meta) return [];
    const map = new Map<string, GradeNode & { students: Set<string>; groups: Set<string> }>();
    currentRecords.forEach((r: any) => {
      const subj = meta.subjects.get(r.subject_id) as any;
      if (!subj) return;
      const key = `${subj.stage}__${subj.grade}__${subj.category}`;
      const existing = map.get(key) || {
        key, stage: subj.stage, grade: subj.grade, category: subj.category,
        totalEarned: 0, subscriberCount: 0, groupCount: 0,
        students: new Set<string>(), groups: new Set<string>(),
      };
      existing.totalEarned += Number(r.net_amount);
      existing.students.add(r.student_id);
      existing.groups.add(r.group_id);
      map.set(key, existing);
    });
    return [...map.values()].map(g => ({ ...g, subscriberCount: g.students.size, groupCount: g.groups.size }));
  }, [currentRecords, meta]);

  const { data: archives = [] } = useQuery({
    queryKey: ["teacher-archives", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("teacher_monthly_archives" as any).select("*")
        .eq("teacher_id", user.id).order("archived_at", { ascending: false });
      return data || [];
    },
    enabled: !!user, staleTime: 60 * 1000,
  });

  const balance = Number(wallet?.balance || 0);
  const frozen = Number(wallet?.frozen_balance || 0);
  const totalEarned = Number(wallet?.total_earned || 0);
  const totalWithdrawn = useMemo(() => withdrawals.filter((w: any) => w.status === "approved").reduce((s: number, w: any) => s + Number(w.amount), 0), [withdrawals]);
  const pendingWithdrawal = withdrawals.find((w: any) => w.status === "pending");

  const isWithdrawalOpen = useMemo(() => {
    if (!settings) return false;
    if (settings.manual === "open") return true;
    if (settings.manual === "closed") return false;
    return new Date().getDate() >= settings.openDay;
  }, [settings]);

  const daysUntilOpen = useMemo(() => {
    if (!settings || isWithdrawalOpen) return 0;
    const today = new Date();
    const target = new Date(today.getFullYear(), today.getMonth(), settings.openDay);
    if (today.getDate() >= settings.openDay) target.setMonth(target.getMonth() + 1);
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }, [settings, isWithdrawalOpen]);

  const loading = walletLoading || earningsLoading;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["teacher-wallet-v2"] });
    qc.invalidateQueries({ queryKey: ["teacher-payment-methods"] });
    qc.invalidateQueries({ queryKey: ["teacher-withdrawals"] });
    qc.invalidateQueries({ queryKey: ["teacher-earnings-current"] });
    qc.invalidateQueries({ queryKey: ["teacher-archives"] });
  };

  const handleWithdraw = async () => {
    if (!user || !withdrawAmount || !selectedPaymentMethodId) return;
    const amount = Number(withdrawAmount);
    const method = paymentMethods.find((m: any) => m.id === selectedPaymentMethodId);
    if (!method) { toast.error("اختر طريقة دفع"); return; }
    if (amount <= 0 || amount > balance) { toast.error("المبلغ غير صالح"); return; }
    if (!isWithdrawalOpen) { toast.error(settings?.notice || "السحب موقوف حالياً من الإدارة"); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("teacher_request_withdrawal" as any, {
        _amount: amount, _payment_method: method.method_type, _phone_number: method.phone_number,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) { toast.error(result?.error || "خطأ"); return; }
      toast.success("تم تقديم طلب السحب");
      setShowWithdraw(false); setWithdrawAmount("");
      setSuccessInfo({
        amount, method: methodLabels[method.method_type] || method.method_type,
        phone: method.phone_number, remaining: Number(result.remaining ?? balance - amount),
        refId: String(result.request_id || "").slice(0, 8).toUpperCase(),
      });
      invalidateAll();
    } catch (e: any) { console.error(e); toast.error(e?.message || "خطأ"); }
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
    toast.success("تم الحذف"); invalidateAll();
  };

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] gap-0.5"><Clock className="h-3 w-3" />معلق</Badge>;
    if (status === "approved") return <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] gap-0.5"><CheckCircle className="h-3 w-3" />مكتمل</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-700 border-0 text-[10px] gap-0.5"><XCircle className="h-3 w-3" />مرفوض</Badge>;
    return <Badge className="text-[10px]">{status}</Badge>;
  };

  if (loading) {
    return <TeacherSidebarLayout title="المحفظة" teacherName={teacherName}>
      <div className="flex items-center justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
    </TeacherSidebarLayout>;
  }

  // ============== ARCHIVE DETAIL ==============
  if (view === "archive-detail" && selectedArchiveId) {
    const archive = archives.find((a: any) => a.id === selectedArchiveId) as any;
    if (!archive) { setView("archives"); return null; }
    const breakdown = (archive.breakdown || []) as any[];
    return (
      <TeacherSidebarLayout title="سجل شهر" teacherName={teacherName}>
        <div className="p-4 max-w-3xl mx-auto space-y-4">
          <BackButton onClick={() => { setView("archives"); setSelectedArchiveId(null); }} label="رجوع للسجلات" />
          <HeroBanner gradient="from-indigo-600 via-purple-600 to-fuchsia-600" icon={<Archive className="h-7 w-7" />} title={monthLabel(archive.period_label)} subtitle="سجل شهر مؤرشف"
            stats={[
              { label: "الأرباح", value: `${fmtMoney(Number(archive.total_earned))} ج` },
              { label: "المشتركين", value: archive.total_subscribers },
              { label: "المجموعات", value: archive.total_groups },
            ]} />
          {breakdown.length > 0 && (
            <SectionCard icon={<BookOpen className="h-4 w-4" />} title="تفاصيل المجموعات">
              <div className="space-y-2">
                {breakdown.map((g: any, j: number) => (
                  <div key={j} className="p-3 rounded-2xl bg-muted/40 border border-border/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="font-bold text-sm">{g.group_title || "مجموعة"}</p>
                      <span className="font-bold text-emerald-600 text-sm">{fmtMoney(Number(g.net))} ج</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{g.subject_name} - {formatGrade(g.grade)} {formatStage(g.stage)}</p>
                    <CalcRow students={g.students} price={Number(g.price)} pct={Math.round(Number(archive.commission_rate) * 100)} net={Number(g.net)} />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      </TeacherSidebarLayout>
    );
  }

  // ============== ARCHIVES LIST ==============
  if (view === "archives") {
    return (
      <TeacherSidebarLayout title="سجل المحفظة" teacherName={teacherName}>
        <div className="p-4 max-w-3xl mx-auto space-y-4">
          <BackButton onClick={() => setView("main")} label="رجوع للمحفظة" />
          <SectionCard icon={<Archive className="h-5 w-5" />} title="سجلات الأشهر السابقة">
            {archives.length === 0 ? (
              <EmptyState icon={<Archive className="h-12 w-12" />} title="لا توجد سجلات بعد" subtitle="يتم إنشاء السجلات تلقائياً عند فتح موعد السحب لكل شهر" />
            ) : (
              <div className="space-y-2">
                {archives.map((a: any, i: number) => (
                  <motion.button key={a.id}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                    onClick={() => { setSelectedArchiveId(a.id); setView("archive-detail"); }}
                    className="w-full p-3 rounded-2xl bg-muted/40 border border-border/60 hover:border-primary/40 hover:bg-muted/70 transition text-right flex items-center justify-between active:scale-[0.99]">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-md">
                        <Calendar className="h-5 w-5 text-white" />
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm">{monthLabel(a.period_label)}</p>
                        <p className="text-[11px] text-muted-foreground">{a.total_subscribers} مشترك • {a.total_groups} مجموعة</p>
                      </div>
                    </div>
                    <div className="text-left flex items-center gap-1">
                      <div>
                        <p className="font-bold text-emerald-600">{fmtMoney(Number(a.total_earned))} ج</p>
                        <p className="text-[10px] text-muted-foreground">عرض التفاصيل</p>
                      </div>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </TeacherSidebarLayout>
    );
  }

  // ============== GRADE DETAIL ==============
  if (view === "grade-detail" && selectedGradeKey && meta) {
    const node = gradeNodes.find(g => g.key === selectedGradeKey);
    if (!node) { setView("main"); return null; }

    const gradeRecords = currentRecords.filter((r: any) => {
      const subj = meta.subjects.get(r.subject_id) as any;
      return subj && `${subj.stage}__${subj.grade}__${subj.category}` === selectedGradeKey;
    });

    const groupBreakdown = new Map<string, { title: string; price: number; students: Set<string>; net: number }>();
    gradeRecords.forEach((r: any) => {
      const g = meta.groups.get(r.group_id) as any;
      const title = g?.title || "مجموعة";
      const price = Number(g?.price || r.gross_amount);
      const existing = groupBreakdown.get(r.group_id) || { title, price, students: new Set<string>(), net: 0 };
      existing.students.add(r.student_id);
      existing.net += Number(r.net_amount);
      groupBreakdown.set(r.group_id, existing);
    });
    const groups = [...groupBreakdown.entries()].map(([id, v]) => ({ id, ...v, count: v.students.size }));

    const archiveBars = archives
      .filter((a: any) => (a.breakdown || []).some((b: any) =>
        meta.subjects.get(b.subject_id || "")?.stage === node.stage && meta.subjects.get(b.subject_id || "")?.grade === node.grade
      ))
      .map((a: any) => {
        const earnedThisGrade = (a.breakdown || [])
          .filter((b: any) => {
            const subj = meta.subjects.get(b.subject_id || "") as any;
            return subj && `${subj.stage}__${subj.grade}__${subj.category}` === selectedGradeKey;
          })
          .reduce((s: number, b: any) => s + Number(b.net || 0), 0);
        return { name: monthLabel(a.period_label), earnings: Math.round(earnedThisGrade) };
      })
      .reverse();
    const currentMonth = wallet?.current_period || new Date().toISOString().slice(0, 7);
    const chartData = [...archiveBars, { name: monthLabel(currentMonth) + " (الحالي)", earnings: Math.round(node.totalEarned) }];
    const ratePct = Math.round((settings?.rate || 0.7) * 100);

    return (
      <TeacherSidebarLayout title="تفاصيل الأرباح" teacherName={teacherName}>
        <div className="p-4 max-w-3xl mx-auto space-y-4">
          <BackButton onClick={() => { setView("main"); setSelectedGradeKey(null); }} label="رجوع للمحفظة" />
          <HeroBanner gradient="from-emerald-500 via-teal-500 to-cyan-600" icon={<TrendingUp className="h-7 w-7" />}
            title={`الصف ${formatGrade(node.grade)} ${formatStage(node.stage)}`} subtitle={node.category}
            stats={[
              { label: "الأرباح", value: `${fmtMoney(node.totalEarned)} ج` },
              { label: "المشتركين", value: node.subscriberCount },
              { label: "المجموعات", value: node.groupCount },
            ]} />

          <SectionCard icon={<BookOpen className="h-4 w-4" />} title={`المجموعات (${groups.length})`}>
            <div className="space-y-2">
              {groups.length === 0 ? <p className="text-center text-muted-foreground py-6 text-sm">لا توجد مجموعات بأرباح هذا الشهر</p> : groups.map((g) => (
                <motion.div key={g.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-2xl bg-muted/40 border border-border/60">
                  <div className="flex items-center justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm truncate">{g.title}</p>
                      <p className="text-[11px] text-muted-foreground">{g.count} مشترك • السعر {fmtMoney(g.price)} ج</p>
                    </div>
                    <span className="font-bold text-emerald-600 shrink-0 mr-2">{fmtMoney(g.net)} ج</span>
                  </div>
                  <CalcRow students={g.count} price={g.price} pct={ratePct} net={g.net} />
                </motion.div>
              ))}
            </div>
          </SectionCard>

          {chartData.length > 1 && (
            <SectionCard icon={<BarChart3 className="h-4 w-4" />} title="الأرباح الشهرية">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip formatter={(v: number) => [`${v.toLocaleString()} ج`, "الأرباح"]}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                    <Bar dataKey="earnings" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          )}
        </div>
      </TeacherSidebarLayout>
    );
  }

  // ============== PAYMENT METHODS ==============
  if (view === "payment-methods") {
    return (
      <TeacherSidebarLayout title="طرق الدفع" teacherName={teacherName}>
        <div className="p-4 max-w-3xl mx-auto space-y-4">
          <BackButton onClick={() => setView("main")} label="رجوع" />
          <SectionCard icon={<CreditCard className="h-5 w-5" />} title="طرق استلام الأرباح" action={
            <Button size="sm" onClick={() => { setEditingMethod(null); setNewMethodPhone(""); setShowAddMethod(true); }} className="gap-1 h-8 rounded-full">
              <Plus className="h-3.5 w-3.5" /> إضافة
            </Button>
          }>
            {paymentMethods.length === 0 ? (
              <EmptyState icon={<CreditCard className="h-12 w-12" />} title="لم تضف طريقة دفع بعد" subtitle="أضف طريقة لتتمكن من سحب أرباحك" />
            ) : (
              <div className="space-y-2">
                {paymentMethods.map((pm: any) => (
                  <div key={pm.id} className="flex items-center justify-between p-3 rounded-2xl bg-muted/40 border border-border/60 hover:border-primary/40 transition">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-11 w-11 rounded-2xl bg-gradient-to-br ${methodColors[pm.method_type] || "from-primary to-primary/70"} flex items-center justify-center shadow-md shrink-0`}>
                        <CreditCard className="h-5 w-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold">{methodLabels[pm.method_type] || pm.method_type}</p>
                        <p className="text-xs text-muted-foreground font-mono" dir="ltr">{pm.phone_number}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingMethod(pm); setNewMethodType(pm.method_type); setNewMethodPhone(pm.phone_number); setShowAddMethod(true); }}>
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteMethod(pm.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
        <MethodDialog open={showAddMethod} onOpenChange={v => { setShowAddMethod(v); if (!v) setEditingMethod(null); }} editing={editingMethod} methodType={newMethodType} setMethodType={setNewMethodType} phone={newMethodPhone} setPhone={setNewMethodPhone} onSubmit={handleAddMethod} submitting={submitting} />
      </TeacherSidebarLayout>
    );
  }

  // ============== WITHDRAWAL HISTORY ==============
  if (view === "withdrawal-history") {
    const byMonth = new Map<string, { label: string; items: any[]; total: number; approved: number }>();
    withdrawals.forEach((w: any) => {
      const d = new Date(w.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("ar-EG", { year: "numeric", month: "long" });
      const g = byMonth.get(key) || { label, items: [], total: 0, approved: 0 };
      g.items.push(w); g.total += Number(w.amount);
      if (w.status === "approved") g.approved += Number(w.amount);
      byMonth.set(key, g);
    });
    const monthly = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    return (
      <TeacherSidebarLayout title="سجل السحب" teacherName={teacherName}>
        <div className="p-4 max-w-3xl mx-auto space-y-4">
          <BackButton onClick={() => setView("main")} label="رجوع" />
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="إجمالي الطلبات" value={withdrawals.length} color="text-foreground" />
            <MiniStat label="تم تحويل" value={`${fmtMoney(totalWithdrawn)} ج`} color="text-emerald-600" />
            <MiniStat label="معلقة" value={withdrawals.filter((w: any) => w.status === "pending").length} color="text-amber-600" />
          </div>
          {monthly.length === 0 ? (
            <Card className="border border-border/60 shadow-none"><CardContent className="p-8"><EmptyState icon={<History className="h-12 w-12" />} title="لا توجد طلبات سحب" subtitle="جميع طلبات السحب الخاصة بك ستظهر هنا" /></CardContent></Card>
          ) : monthly.map(([key, g]) => (
            <SectionCard key={key} icon={<Calendar className="h-4 w-4" />} title={g.label}
              action={<span className="text-[11px] font-normal text-muted-foreground">{g.items.length} طلب</span>}>
              <div className="flex justify-between text-[11px] mb-2 px-1">
                <span className="text-emerald-600 font-bold">تم تحويل: {fmtMoney(g.approved)} ج</span>
                <span className="text-muted-foreground">إجمالي: {fmtMoney(g.total)} ج</span>
              </div>
              <div className="space-y-2">
                {g.items.map((w: any) => (
                  <div key={w.id} className="p-3 rounded-2xl bg-muted/40 border border-border/60">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm">{fmtMoney(Number(w.amount))} جنيه</span>
                      {statusBadge(w.status)}
                    </div>
                    <div className="text-[11px] text-muted-foreground space-y-0.5">
                      <p>{methodLabels[w.payment_method] || w.payment_method} • <span className="font-mono" dir="ltr">{w.phone_number}</span></p>
                      <p>{new Date(w.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</p>
                      {w.admin_message && <p className="text-foreground bg-background/60 p-2 rounded-lg mt-1 border border-border/40">{w.admin_message}</p>}
                      {w.status === "pending" && <p className="text-amber-600 mt-1 flex items-center gap-1"><Clock className="h-3 w-3" /> يتم إلغاء الطلب تلقائياً بعد 3 أيام عمل</p>}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          ))}
        </div>
      </TeacherSidebarLayout>
    );
  }

  // ============== MAIN VIEW ==============
  const ratePct = Math.round((settings?.rate || 0.55) * 100);

  return (
    <TeacherSidebarLayout title="المحفظة" teacherName={teacherName}>
      <div className="p-4 max-w-4xl mx-auto space-y-4 pb-8">

        {/* HERO — Modern dark gradient with glow */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl overflow-hidden shadow-2xl"
          style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #4c1d95 35%, #6d28d9 70%, #4338ca 100%)" }}>
          {/* Decorative orbs */}
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full" style={{ background: "radial-gradient(circle, rgba(168,85,247,0.4) 0%, transparent 70%)" }} />
          <div className="absolute -bottom-20 -left-12 w-72 h-72 rounded-full" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 70%)" }} />
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E\")" }} />

          <div className="relative z-10 p-5">
            {/* Top row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center">
                  <Wallet className="h-4.5 w-4.5 text-white" />
                </div>
                <div>
                  <p className="text-[11px] text-white/70 leading-none">محفظة المعلم</p>
                  <p className="text-sm font-bold text-white mt-0.5">{teacherName || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setHideBalance(v => !v)} className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur flex items-center justify-center transition border border-white/15">
                  {hideBalance ? <EyeOff className="h-4 w-4 text-white" /> : <Eye className="h-4 w-4 text-white" />}
                </button>
                <Badge className="bg-white text-purple-700 border-0 text-[10px] font-bold hover:bg-white gap-1 px-2.5 h-7">
                  <Sparkles className="h-3 w-3" /> {ratePct}%
                </Badge>
              </div>
            </div>

            {/* Big balance */}
            <div className="mb-5">
              <p className="text-[11px] text-white/70 mb-1">الرصيد المتاح للسحب</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight" style={{ textShadow: "0 2px 20px rgba(168,85,247,0.5)" }}>
                  {hideBalance ? "•••••" : fmtMoney(balance)}
                </h1>
                <span className="text-base font-bold text-white/80">جنيه</span>
              </div>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-white/70">
                {isWithdrawalOpen ? (
                  <span className="flex items-center gap-1 text-emerald-300"><Zap className="h-3 w-3" /> السحب مفتوح الآن</span>
                ) : settings?.manual === "closed" ? (
                  <span className="flex items-center gap-1 text-rose-300"><Lock className="h-3 w-3" /> السحب موقوف من الإدارة</span>
                ) : (
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> يفتح بعد {daysUntilOpen} يوم</span>
                )}
              </div>
            </div>

            {/* Mini stats grid (4 cols) */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <GlassStat icon={<Snowflake className="h-3.5 w-3.5" />} label="مجمد" value={hideBalance ? "•••" : fmtMoney(frozen)} accent="text-cyan-200" />
              <GlassStat icon={<TrendingUp className="h-3.5 w-3.5" />} label="إجمالي" value={hideBalance ? "•••" : fmtMoney(totalEarned)} accent="text-emerald-200" />
              <GlassStat icon={<ArrowUpRight className="h-3.5 w-3.5" />} label="مسحوب" value={hideBalance ? "•••" : fmtMoney(totalWithdrawn)} accent="text-amber-200" />
            </div>

            {/* Action row */}
            <div className="flex gap-2">
              <button
                onClick={() => isWithdrawalOpen ? setShowWithdraw(true) : toast.error(settings?.notice || "السحب مغلق حالياً")}
                disabled={!isWithdrawalOpen || balance <= 0}
                className={`flex-[2] rounded-2xl py-3 px-4 text-sm font-bold flex items-center justify-center gap-2 transition shadow-lg active:scale-[0.98] ${
                  isWithdrawalOpen && balance > 0
                    ? "bg-white text-purple-700 hover:bg-white/95"
                    : "bg-white/15 text-white/60 cursor-not-allowed border border-white/20"
                }`}>
                {isWithdrawalOpen && balance > 0 ? <ArrowDownCircle className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                {isWithdrawalOpen && balance > 0 ? "سحب الأرباح" : isWithdrawalOpen ? "لا يوجد رصيد" : "السحب مغلق"}
              </button>
              <button onClick={() => setView("payment-methods")}
                className="flex-1 rounded-2xl py-3 px-3 text-xs font-bold flex items-center justify-center gap-1.5 bg-white/15 hover:bg-white/25 backdrop-blur text-white border border-white/25 transition active:scale-[0.98]">
                <CreditCard className="h-4 w-4" />
                طرق الدفع
                {paymentMethods.length > 0 && <span className="bg-white/95 text-purple-700 rounded-full text-[10px] px-1.5 font-black min-w-[18px]">{paymentMethods.length}</span>}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Status banners */}
        <AnimatePresence>
          {settings?.manual === "closed" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <Banner color="rose" icon={<Lock />} title="السحب موقوف مؤقتاً من الإدارة" subtitle={settings?.notice || "لا يمكن تقديم طلبات سحب حالياً. سيتم إعلامك عند فتح السحب."} />
            </motion.div>
          )}
          {!isWithdrawalOpen && settings?.manual !== "closed" && settings?.notice && (
            <Banner color="blue" icon={<Info />} title="تنبيه" subtitle={settings.notice} />
          )}
          {pendingWithdrawal && (
            <Banner color="amber" icon={<Clock />} title={`طلب سحب معلق: ${fmtMoney(Number((pendingWithdrawal as any).amount))} جنيه`} subtitle="بانتظار موافقة الإدارة — قد تستغرق العملية حتى 3 أيام عمل" />
          )}
          {frozen > 0 && (
            <Banner color="cyan" icon={<Snowflake />} title={`رصيد مجمد: ${fmtMoney(frozen)} جنيه`} subtitle={`ينتقل تلقائياً للرصيد المتاح يوم ${settings?.openDay || 25} من كل شهر`} />
          )}
        </AnimatePresence>

        {/* Quick actions — modern grid */}
        <div className="grid grid-cols-3 gap-2.5">
          <ActionCard onClick={() => setView("payment-methods")} icon={<CreditCard />} label="طرق الدفع" sub={`${paymentMethods.length} مسجلة`} gradient="from-blue-500 to-indigo-600" />
          <ActionCard onClick={() => setView("withdrawal-history")} icon={<History />} label="سجل السحب" sub={`${withdrawals.length} طلب`} gradient="from-amber-500 to-orange-600" />
          <ActionCard onClick={() => setView("archives")} icon={<Archive />} label="سجل المحفظة" sub={`${archives.length} شهر`} gradient="from-violet-500 to-purple-600" />
        </div>

        {/* Archives strip */}
        {archives.length > 0 && (
          <Card className="border border-border/60 shadow-none rounded-2xl overflow-hidden">
            <CardContent className="p-3.5">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-xs font-bold flex items-center gap-1.5"><Archive className="h-3.5 w-3.5 text-violet-600" /> سجلات الشهور</p>
                <button onClick={() => setView("archives")} className="text-[11px] text-violet-600 font-bold hover:underline">عرض الكل ←</button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                {archives.slice(0, 12).map((a: any) => (
                  <button key={a.id}
                    onClick={() => { setSelectedArchiveId(a.id); setView("archive-detail"); }}
                    className="shrink-0 min-w-[120px] rounded-2xl bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40 border border-violet-200/60 dark:border-violet-800/40 p-2.5 text-right hover:shadow-md hover:-translate-y-0.5 transition active:scale-95">
                    <p className="text-[10px] text-muted-foreground">{monthLabel(a.period_label)}</p>
                    <p className="text-sm font-black text-violet-700 dark:text-violet-300 mt-0.5">{fmtMoney(Number(a.total_earned))} ج</p>
                    <p className="text-[10px] text-muted-foreground">{a.total_subscribers} مشترك</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Open vs Frozen chart */}
        {(archives.length > 0 || frozen > 0) && (
          <SectionCard icon={<BarChart3 className="h-4 w-4" />} title="الرصيد المفتوح مقابل المجمد" subtitle={`يفك التجميد يوم ${settings?.openDay || 25} • العلامة الحمراء = آخر أرشفة`}>
            {(() => {
              const sorted = [...archives].sort((a: any, b: any) => String(a.period_label).localeCompare(String(b.period_label)));
              const data = sorted.slice(-6).map((a: any) => ({ name: monthLabel(a.period_label), مفتوح: Math.round(Number(a.total_earned) || 0), مجمد: 0 }));
              const currentLabel = monthLabel(wallet?.current_period || new Date().toISOString().slice(0, 7)) + " (الحالي)";
              data.push({ name: currentLabel, مفتوح: 0, مجمد: Math.round(frozen) });
              const lastArchive = sorted[sorted.length - 1] as any;
              return (
                <>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="openGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(142 76% 50%)" />
                            <stop offset="100%" stopColor="hsl(142 76% 35%)" />
                          </linearGradient>
                          <linearGradient id="frozenGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(199 89% 60%)" />
                            <stop offset="100%" stopColor="hsl(199 89% 45%)" />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip formatter={(v: number, n: string) => [`${Number(v).toLocaleString()} ج`, n]}
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {lastArchive && (
                          <ReferenceLine x={monthLabel(lastArchive.period_label)} stroke="hsl(var(--destructive))" strokeDasharray="4 4"
                            label={{ value: "آخر أرشفة", position: "top", fill: "hsl(var(--destructive))", fontSize: 10 }} />
                        )}
                        <Bar dataKey="مفتوح" stackId="a" fill="url(#openGrad)" />
                        <Bar dataKey="مجمد" stackId="a" fill="url(#frozenGrad)" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="flex items-center gap-1.5 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      <span>مفتوح: <b className="text-emerald-700 dark:text-emerald-400">{fmtMoney(balance)} ج</b></span>
                    </div>
                    <div className="flex items-center gap-1.5 p-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200/50">
                      <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
                      <span>مجمد: <b className="text-cyan-700 dark:text-cyan-400">{fmtMoney(frozen)} ج</b></span>
                    </div>
                  </div>
                </>
              );
            })()}
          </SectionCard>
        )}

        {/* Earnings by grade */}
        <SectionCard icon={<TrendingUp className="h-4 w-4" />} title="الأرباح حسب الصف" subtitle="الشهر الحالي">
          {gradeNodes.length === 0 ? (
            <EmptyState icon={<TrendingUp className="h-12 w-12" />} title="لا توجد أرباح هذا الشهر" subtitle="ستظهر أرباحك من اشتراكات الطلاب هنا" />
          ) : (
            <div className="space-y-2">
              {gradeNodes.map((ge, i) => (
                <motion.button key={ge.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                  className="w-full p-3 rounded-2xl bg-muted/40 border border-border/60 hover:border-primary/40 hover:bg-muted/70 transition text-right active:scale-[0.99]"
                  onClick={() => { setSelectedGradeKey(ge.key); setView("grade-detail"); }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-md">
                        <BookOpen className="h-4 w-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">الصف {formatGrade(ge.grade)} {formatStage(ge.stage)}</p>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {ge.subscriberCount}</span>
                          <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {ge.groupCount}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="font-black text-emerald-600 text-sm">{fmtMoney(ge.totalEarned)} ج</span>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Info footer */}
        <div className="rounded-2xl bg-gradient-to-br from-muted/40 to-muted/20 border border-border/40 p-3 flex items-start gap-2.5">
          <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            <p className="font-bold text-foreground mb-0.5">معلومات هامة</p>
            <p>• نسبتك الحالية من قيمة الاشتراكات: <b className="text-foreground">{ratePct}%</b></p>
            <p>• يفتح السحب يوم <b className="text-foreground">{settings?.openDay || 25}</b> من كل شهر تلقائياً</p>
            <p>• تُحوَّل الأموال خلال <b className="text-foreground">3 أيام عمل</b> من قبول الطلب</p>
          </div>
        </div>

        {/* Withdraw Dialog */}
        <Dialog open={showWithdraw} onOpenChange={setShowWithdraw}>
          <DialogContent className="max-w-md rounded-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ArrowDownCircle className="h-5 w-5 text-purple-600" />سحب الأرباح</DialogTitle>
              <DialogDescription>أدخل المبلغ واختر طريقة الاستلام</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-2xl p-4 text-center" style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
                <p className="text-[11px] text-white/90">الرصيد المتاح</p>
                <p className="text-3xl font-black text-white my-1">{fmtMoney(balance)} <span className="text-sm font-normal">ج</span></p>
                {frozen > 0 && <p className="text-[10px] text-white/80">+ {fmtMoney(frozen)} ج مجمد (يفتح يوم {settings?.openDay || 25})</p>}
              </div>
              <div>
                <Label className="text-xs">المبلغ المراد سحبه *</Label>
                <Input type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="00" min={1} max={balance} className="rounded-xl h-11 text-base font-bold mt-1" />
                <div className="flex gap-1 mt-2">
                  {[0.25, 0.5, 1].map(p => (
                    <button key={p} onClick={() => setWithdrawAmount(String(Math.floor(balance * p)))} className="flex-1 text-[11px] py-1.5 rounded-lg bg-muted hover:bg-muted/70 transition font-semibold">
                      {p === 1 ? "الكل" : `${p * 100}%`}
                    </button>
                  ))}
                </div>
              </div>
              {paymentMethods.length === 0 ? (
                <div className="p-4 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-center">
                  <p className="text-sm font-bold text-amber-700 mb-2">أضف طريقة دفع أولاً</p>
                  <Button size="sm" onClick={() => { setShowWithdraw(false); setShowAddMethod(true); }} className="gap-1 rounded-full"><Plus className="h-3 w-3" /> إضافة</Button>
                </div>
              ) : (
                <div>
                  <Label className="text-xs">طريقة الاستلام *</Label>
                  <Select value={selectedPaymentMethodId} onValueChange={setSelectedPaymentMethodId}>
                    <SelectTrigger className="rounded-xl h-11 mt-1"><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>{paymentMethods.map((pm: any) => <SelectItem key={pm.id} value={pm.id}>{methodLabels[pm.method_type] || pm.method_type} - {pm.phone_number}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60">
                <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> يُحوَّل المبلغ خلال 3 أيام عمل</p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowWithdraw(false)} className="rounded-xl">إلغاء</Button>
              <Button onClick={handleWithdraw} disabled={submitting || !withdrawAmount || !selectedPaymentMethodId || paymentMethods.length === 0}
                className="gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white border-0">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد السحب
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <MethodDialog open={showAddMethod} onOpenChange={v => { setShowAddMethod(v); if (!v) setEditingMethod(null); }} editing={editingMethod} methodType={newMethodType} setMethodType={setNewMethodType} phone={newMethodPhone} setPhone={setNewMethodPhone} onSubmit={handleAddMethod} submitting={submitting} />

        {/* Withdrawal Success */}
        <Dialog open={!!successInfo} onOpenChange={(v) => !v && setSuccessInfo(null)}>
          <DialogContent className="max-w-sm rounded-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-700">
                <CheckCircle className="h-6 w-6 text-emerald-600" /> تم تقديم الطلب بنجاح
              </DialogTitle>
              <DialogDescription>تم إرسال الطلب إلى الإدارة وسيتم تحويل المبلغ خلال 3 أيام عمل.</DialogDescription>
            </DialogHeader>
            {successInfo && (
              <div className="space-y-3">
                <div className="rounded-2xl p-4 text-center relative overflow-hidden" style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
                  <div className="absolute top-0 right-0 w-32 h-32 rounded-full -translate-y-1/2 translate-x-1/2" style={{ background: "rgba(255,255,255,0.15)" }} />
                  <p className="text-xs text-white/90 relative">المبلغ المطلوب</p>
                  <p className="text-3xl font-black text-white my-1 relative">{fmtMoney(successInfo.amount)} <span className="text-sm font-normal">جنيه</span></p>
                  <p className="text-[11px] text-white/90 font-mono relative">رقم المرجع: #{successInfo.refId}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-2xl bg-muted/40 border border-border/60">
                    <p className="text-[10px] text-muted-foreground">طريقة الدفع</p>
                    <p className="text-sm font-bold mt-0.5">{successInfo.method}</p>
                    <p className="text-[10px] font-mono text-muted-foreground" dir="ltr">{successInfo.phone}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60">
                    <p className="text-[10px] text-emerald-700">الرصيد المتبقي</p>
                    <p className="text-sm font-bold text-emerald-700 mt-0.5">{fmtMoney(successInfo.remaining)} ج</p>
                    <p className="text-[10px] text-emerald-600">تم خصم المبلغ</p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setSuccessInfo(null)} className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white">تم</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TeacherSidebarLayout>
  );
}

// ============== HELPER COMPONENTS ==============
function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button variant="ghost" onClick={onClick} className="gap-1 rounded-full -mr-2">
      <ChevronLeft className="h-4 w-4 rotate-180" /> {label}
    </Button>
  );
}

function SectionCard({ icon, title, subtitle, action, children }: { icon: React.ReactNode; title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="border border-border/60 shadow-none rounded-2xl">
      <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="text-primary">{icon}</span> {title}
          </CardTitle>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function HeroBanner({ gradient, icon, title, subtitle, stats }: { gradient: string; icon: React.ReactNode; title: string; subtitle: string; stats: { label: string; value: any }[] }) {
  return (
    <Card className={`border-0 shadow-lg rounded-3xl bg-gradient-to-br ${gradient} text-white overflow-hidden relative`}>
      <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-white/10" />
      <CardContent className="p-5 relative">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center border border-white/25">{icon}</div>
          <div>
            <p className="text-[11px] opacity-80">{subtitle}</p>
            <p className="text-xl font-black">{title}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          {stats.map((s, i) => (
            <div key={i} className="bg-white/20 backdrop-blur rounded-2xl p-2.5 text-center border border-white/25">
              <p className="text-[10px] opacity-90">{s.label}</p>
              <p className="font-black text-sm mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function GlassStat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl p-2.5 bg-white/10 hover:bg-white/15 transition backdrop-blur border border-white/20">
      <div className={`flex items-center gap-1 text-[10px] mb-0.5 ${accent}`}>
        {icon} <span>{label}</span>
      </div>
      <p className="font-black text-sm text-white">{value}</p>
    </div>
  );
}

function ActionCard({ onClick, icon, label, sub, gradient }: { onClick: () => void; icon: React.ReactNode; label: string; sub: string; gradient: string }) {
  return (
    <button onClick={onClick}
      className="rounded-2xl bg-card border border-border/60 p-3 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition active:scale-95 text-center">
      <div className={`h-10 w-10 mx-auto rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md mb-2`}>
        <span className="text-white [&>svg]:h-4.5 [&>svg]:w-4.5">{icon}</span>
      </div>
      <p className="text-xs font-bold">{label}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
    </button>
  );
}

function MiniStat({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <Card className="border border-border/60 shadow-none rounded-2xl">
      <CardContent className="p-3 text-center">
        <p className={`text-lg font-black ${color}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function Banner({ color, icon, title, subtitle }: { color: "rose" | "blue" | "amber" | "cyan"; icon: React.ReactNode; title: string; subtitle: string }) {
  const palette: Record<string, string> = {
    rose: "from-rose-50 to-red-50 dark:from-rose-950/30 dark:to-red-950/30 border-rose-200/70 dark:border-rose-800/50 text-rose-700 dark:text-rose-400",
    blue: "from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200/70 dark:border-blue-800/50 text-blue-700 dark:text-blue-400",
    amber: "from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200/70 dark:border-amber-800/50 text-amber-700 dark:text-amber-400",
    cyan: "from-cyan-50 to-sky-50 dark:from-cyan-950/30 dark:to-sky-950/30 border-cyan-200/70 dark:border-cyan-800/50 text-cyan-700 dark:text-cyan-400",
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-3.5 flex items-start gap-3 ${palette[color]}`}>
      <div className="h-9 w-9 rounded-xl bg-white/60 dark:bg-black/20 flex items-center justify-center shrink-0 [&>svg]:h-4.5 [&>svg]:w-4.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-[11px] opacity-80 mt-0.5 leading-relaxed">{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="text-muted-foreground/30 mb-2 inline-block">{icon}</div>
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="text-[11px] text-muted-foreground mt-1 max-w-xs mx-auto">{subtitle}</p>
    </div>
  );
}

function CalcRow({ students, price, pct, net }: { students: number; price: number; pct: number; net: number }) {
  return (
    <div className="mt-2 p-2 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 font-mono text-xs flex items-center justify-center gap-1.5 flex-wrap border border-emerald-200/50 dark:border-emerald-800/40">
      <Calculator className="h-3 w-3 text-emerald-600" />
      <span className="font-bold">{students}</span><span className="text-muted-foreground">×</span>
      <span className="font-bold">{Math.round(price)}</span><span className="text-muted-foreground">×</span>
      <span className="font-bold">{pct}%</span>
      <span className="text-muted-foreground">=</span>
      <span className="font-black text-emerald-600">{fmtMoney(net)} ج</span>
    </div>
  );
}

function MethodDialog({ open, onOpenChange, editing, methodType, setMethodType, phone, setPhone, onSubmit, submitting }: any) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-purple-600" />{editing ? "تعديل" : "إضافة"} طريقة دفع</DialogTitle>
          <DialogDescription>اختر النوع وأدخل الرقم</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">نوع المحفظة *</Label>
            <Select value={methodType} onValueChange={setMethodType}>
              <SelectTrigger className="rounded-xl h-11 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vodafone_cash">فودافون كاش</SelectItem>
                <SelectItem value="orange_cash">أورانج كاش</SelectItem>
                <SelectItem value="etisalat_cash">اتصالات كاش</SelectItem>
                <SelectItem value="instapay">InstaPay</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">الرقم *</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="01xxxxxxxxx" dir="ltr" className="rounded-xl h-11 mt-1 font-mono" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">إلغاء</Button>
          <Button onClick={onSubmit} disabled={submitting || !phone.trim()}
            className="gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white border-0">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "حفظ" : "إضافة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
