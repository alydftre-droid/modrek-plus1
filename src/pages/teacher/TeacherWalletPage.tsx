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
  ChevronLeft, TrendingUp, History, BarChart3, Calendar, Lock, Archive, Calculator,
  Sparkles, Eye, EyeOff, Shield, Zap, Trash2, Pencil, ArrowUpRight, Snowflake, PieChart, ChevronDown, Download, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Area, AreaChart, LineChart, Line } from "recharts";

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
const fmtMoney = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

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
  const [focusedGradeKey, setFocusedGradeKey] = useState<string | null>(null);

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

  // Auto-focus first grade for the table section
  useEffect(() => {
    if (gradeNodes.length && !focusedGradeKey) setFocusedGradeKey(gradeNodes[0].key);
  }, [gradeNodes, focusedGradeKey]);

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
  const totalAll = balance + frozen;

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

  // Date when withdrawal opens (e.g. "25 مايو 2026")
  const openDateLabel = useMemo(() => {
    if (!settings) return "";
    const today = new Date();
    const d = new Date(today.getFullYear(), today.getMonth(), settings.openDay);
    if (today.getDate() >= settings.openDay) d.setMonth(d.getMonth() + 1);
    return d.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
  }, [settings]);

  // Growth trend across last 6 archives + current
  const growthData = useMemo(() => {
    const sorted = [...archives].sort((a: any, b: any) => String(a.period_label).localeCompare(String(b.period_label)));
    const arr = sorted.slice(-5).map((a: any) => ({ name: monthLabel(a.period_label).split(" ")[0], v: Math.round(Number(a.total_earned) || 0) }));
    arr.push({ name: monthLabel(wallet?.current_period || new Date().toISOString().slice(0, 7)).split(" ")[0], v: Math.round(totalAll) });
    return arr;
  }, [archives, wallet, totalAll]);

  // Real per-grade history from archives (for sparkline + delta)
  const gradeHistory = useMemo(() => {
    const hist = new Map<string, number[]>();
    const sorted = [...archives].sort((a: any, b: any) => String(a.period_label).localeCompare(String(b.period_label)));
    sorted.slice(-6).forEach((a: any) => {
      const breakdown = (a.breakdown || []) as any[];
      const perGrade = new Map<string, number>();
      breakdown.forEach((b: any) => {
        const key = `${b.stage}__${b.grade}__${b.category || ""}`;
        perGrade.set(key, (perGrade.get(key) || 0) + Number(b.net || 0));
      });
      perGrade.forEach((v, k) => {
        if (!hist.has(k)) hist.set(k, []);
        hist.get(k)!.push(v);
      });
    });
    return hist;
  }, [archives]);

  const lastMonthEarned = useMemo(() => {
    const sorted = [...archives].sort((a: any, b: any) => String(b.period_label).localeCompare(String(a.period_label)));
    return Number(sorted[0]?.total_earned || 0);
  }, [archives]);
  const monthDeltaPct = useMemo(() => {
    if (!lastMonthEarned) return totalAll > 0 ? 100 : 0;
    return Math.round(((totalAll - lastMonthEarned) / lastMonthEarned) * 100);
  }, [totalAll, lastMonthEarned]);

  const newStudentsCount = useMemo(() => {
    return new Set(currentRecords.map((r: any) => r.student_id)).size;
  }, [currentRecords]);
  const subsCount = useMemo(() => {
    return new Set(currentRecords.map((r: any) => `${r.student_id}-${r.group_id}`)).size;
  }, [currentRecords]);
  const totalRevenue = useMemo(() => {
    return currentRecords.reduce((s: number, r: any) => s + Number(r.gross_amount || 0), 0);
  }, [currentRecords]);

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
          <ArchiveHero label={monthLabel(archive.period_label)} earned={Number(archive.total_earned)} subs={archive.total_subscribers} groups={archive.total_groups} />
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

  // ============== GRADE DETAIL (full page) ==============
  if (view === "grade-detail" && selectedGradeKey && meta) {
    const node = gradeNodes.find(g => g.key === selectedGradeKey);
    if (!node) { setView("main"); return null; }
    const ratePct = Math.round((settings?.rate || 0.7) * 100);

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

    return (
      <TeacherSidebarLayout title="تفاصيل الأرباح" teacherName={teacherName}>
        <div className="p-4 max-w-3xl mx-auto space-y-4">
          <BackButton onClick={() => { setView("main"); setSelectedGradeKey(null); }} label="رجوع للمحفظة" />
          <Card className="border-0 rounded-3xl overflow-hidden text-white shadow-xl"
            style={{ background: "linear-gradient(135deg,#10b981,#0d9488,#06b6d4)" }}>
            <CardContent className="p-5">
              <p className="text-[11px] opacity-90">{node.category}</p>
              <h2 className="text-xl font-black mt-1">الصف {formatGrade(node.grade)} {formatStage(node.stage)}</h2>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="bg-white/20 rounded-2xl p-2.5 text-center border border-white/25">
                  <p className="text-[10px] opacity-90">الأرباح</p>
                  <p className="font-black text-sm mt-0.5">{fmtMoney(node.totalEarned)} ج</p>
                </div>
                <div className="bg-white/20 rounded-2xl p-2.5 text-center border border-white/25">
                  <p className="text-[10px] opacity-90">المشتركين</p>
                  <p className="font-black text-sm mt-0.5">{node.subscriberCount}</p>
                </div>
                <div className="bg-white/20 rounded-2xl p-2.5 text-center border border-white/25">
                  <p className="text-[10px] opacity-90">المجموعات</p>
                  <p className="font-black text-sm mt-0.5">{node.groupCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <SectionCard icon={<BookOpen className="h-4 w-4" />} title={`تفاصيل الأرباح - الصف ${formatGrade(node.grade)} ${formatStage(node.stage)}`}>
            <GradeEarningsTable groups={groups} pct={ratePct} />
          </SectionCard>
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
      <TeacherSidebarLayout title="سجل السحويات" teacherName={teacherName}>
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
  const ratePct = Math.round((settings?.rate || 0.7) * 100);
  const focusedNode = gradeNodes.find(g => g.key === focusedGradeKey) || gradeNodes[0];

  let focusedGroups: { id: string; title: string; price: number; net: number; count: number }[] = [];
  let focusedTotal = 0;
  let focusedStudents = 0;
  if (focusedNode && meta) {
    const gradeRecords = currentRecords.filter((r: any) => {
      const subj = meta.subjects.get(r.subject_id) as any;
      return subj && `${subj.stage}__${subj.grade}__${subj.category}` === focusedNode.key;
    });
    const map = new Map<string, { title: string; price: number; students: Set<string>; net: number }>();
    gradeRecords.forEach((r: any) => {
      const g = meta.groups.get(r.group_id) as any;
      const title = g?.title || "مجموعة";
      const price = Number(g?.price || r.gross_amount);
      const existing = map.get(r.group_id) || { title, price, students: new Set<string>(), net: 0 };
      existing.students.add(r.student_id);
      existing.net += Number(r.net_amount);
      map.set(r.group_id, existing);
    });
    focusedGroups = [...map.entries()].map(([id, v]) => ({ id, title: v.title, price: v.price, net: v.net, count: v.students.size }));
    focusedTotal = focusedGroups.reduce((s, g) => s + g.net, 0);
    focusedStudents = focusedGroups.reduce((s, g) => s + g.count, 0);
  }

  return (
    <TeacherSidebarLayout title="المحفظة" teacherName={teacherName}>
      <div className="p-3 sm:p-4 max-w-5xl mx-auto space-y-3 sm:space-y-4 pb-8">

        {/* ====================== HERO ====================== */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[28px] border border-white/10 shadow-2xl"
          style={{ background: "linear-gradient(90deg, #0f2f63 0%, #2c268d 40%, #6f2ee8 100%)" }}>
          <div className="absolute inset-y-0 left-[43%] w-px bg-white/15 hidden md:block" />
          <div className="absolute inset-x-6 bottom-[104px] h-px bg-white/12" />
          <div className="absolute -top-24 -right-10 h-60 w-60 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(168,85,247,0.38) 0%, transparent 68%)" }} />
          <div className="absolute -bottom-24 left-0 h-64 w-64 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(59,130,246,0.28) 0%, transparent 72%)" }} />

          <div className="relative z-10 p-4 sm:p-5">
            {/* Top row: status pill + total + wallet icon */}
            <div className="flex items-start justify-between gap-3">
              <div className="order-2 sm:order-1 rounded-[26px] bg-white/10 backdrop-blur-md border border-white/15 p-3 sm:p-4 min-w-[142px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="flex items-center gap-1.5 text-[12px] text-black/85 font-black">
                  <Zap className="h-3.5 w-3.5 fill-amber-300 text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
                  {settings?.manual === "closed" ? "السحب موقوف" : "مفتوح السحب"}
                </div>
                <p className="text-[42px] leading-none font-black text-white mt-3">
                  {settings?.manual === "closed" ? "لا" : isWithdrawalOpen ? "نعم" : "قريباً"}
                </p>
                <p className="text-[11px] text-white/72 mt-2 flex items-center gap-1 justify-start">
                  <Calendar className="h-3 w-3 text-white/70" /> حتى {openDateLabel}
                </p>
                <button
                  onClick={() => setView("withdrawal-history")}
                  className="mt-4 w-full text-[12px] font-black text-white bg-white/14 hover:bg-white/24 rounded-2xl py-2 px-2.5 flex items-center justify-center gap-1.5 border border-white/20 transition active:scale-95 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <Calendar className="h-3 w-3" /> تفاصيل السحب
                </button>
              </div>

              <div className="order-1 sm:order-2 flex-1 flex items-start justify-between gap-2 sm:gap-4">
                <div className="hidden sm:flex h-24 w-24 rounded-[24px] items-center justify-center shrink-0">
                  <div className="h-full w-full rounded-[24px] bg-white/8 border border-white/12 shadow-[0_12px_40px_rgba(22,8,84,0.35)] flex items-center justify-center">
                    <Wallet className="h-12 w-12 text-white drop-shadow-[0_8px_18px_rgba(0,0,0,0.3)]" />
                  </div>
                </div>
                <div className="text-right flex-1 pt-1 sm:pt-3">
                  <p className="text-[14px] text-white/82 font-semibold">الرصيد الإجمالي</p>
                  <div className="flex items-baseline gap-2 justify-end mt-2 flex-wrap">
                    <span className="text-sm font-bold text-white/85">جنيه</span>
                    <h1 className="text-[34px] sm:text-[54px] leading-none font-black text-white tracking-tight"
                      style={{ textShadow: "0 10px 30px rgba(18,12,72,0.35)" }}>
                      {hideBalance ? "•••••" : fmtMoney(totalAll)}
                    </h1>
                  </div>
                  <div className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-black text-emerald-200 bg-emerald-500/18 border border-emerald-300/20 rounded-full px-3 py-1.5">
                    <TrendingUp className="h-3 w-3" />
                    {monthDeltaPct >= 0 ? "+" : ""}{monthDeltaPct}% عن الشهر الماضي
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-5 rounded-[26px] bg-[#281b86]/55 backdrop-blur-md border border-white/12 p-3 sm:p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <HeroStat icon={<Lock className="h-3 w-3" />} label="الرصيد المجمد" value={hideBalance ? "•••" : fmtMoney(frozen)} />
              <HeroStat icon={<Wallet className="h-3 w-3" />} label="الرصيد المتاح للسحب" value={hideBalance ? "•••" : fmtMoney(balance)} highlight />
              <HeroStat icon={<PieChart className="h-3 w-3" />} label="نسبة أرباحك" value={`${ratePct}%`} sub="من كل اشتراك" />
            </div>

            {/* Toggle eye + action only when needed */}
            <div className="absolute top-3 left-3">
              <button onClick={() => setHideBalance(v => !v)} className="h-7 w-7 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center border border-white/20 transition">
                {hideBalance ? <EyeOff className="h-3.5 w-3.5 text-white" /> : <Eye className="h-3.5 w-3.5 text-white" />}
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
          {pendingWithdrawal && (
            <Banner color="amber" icon={<Clock />} title={`طلب سحب معلق: ${fmtMoney(Number((pendingWithdrawal as any).amount))} جنيه`} subtitle="بانتظار موافقة الإدارة — قد تستغرق العملية حتى 3 أيام عمل" />
          )}
        </AnimatePresence>

        {/* ====================== 4 ACTION CARDS ====================== */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <BigActionCard
            onClick={() => isWithdrawalOpen && balance > 0 ? setShowWithdraw(true) : toast.error(settings?.notice || "السحب غير متاح حالياً")}
            label="طلب سحب" sub="اسحب أرباحك"
            icon={<ArrowDownCircle className="h-5 w-5" />}
            iconBg="bg-emerald-500"
            disabled={!isWithdrawalOpen || balance <= 0}
          />
          <BigActionCard
            onClick={() => setView("withdrawal-history")}
            label="سجل السحويات" sub="عرض كل السحويات"
            icon={<History className="h-5 w-5" />}
            iconBg="bg-blue-500"
          />
          <BigActionCard
            onClick={() => setView("archives")}
            label="سجل المحفظة" sub="الأرباح الشهرية"
            icon={<BookOpen className="h-5 w-5" />}
            iconBg="bg-violet-500"
          />
          <BigActionCard
            onClick={() => setView("payment-methods")}
            label="طرق الدفع" sub="إدارة حساباتك"
            icon={<CreditCard className="h-5 w-5" />}
            iconBg="bg-orange-500"
          />
        </div>

        {/* ====================== EARNINGS BY GRADE ====================== */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="font-black text-base">الأرباح حسب الصفوف</h2>
            <button onClick={() => setView("archives")} className="text-[11px] text-violet-600 font-bold hover:underline">عرض الكل</button>
          </div>
          {gradeNodes.length === 0 ? (
            <Card className="border border-border/60 rounded-2xl shadow-none">
              <CardContent className="p-8">
                <EmptyState icon={<TrendingUp className="h-12 w-12" />} title="لا توجد أرباح هذا الشهر" subtitle="ستظهر أرباحك من اشتراكات الطلاب هنا" />
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {gradeNodes.slice(0, 3).map((ge, i) => {
                const hist = gradeHistory.get(ge.key) || [];
                const series = [...hist, ge.totalEarned].filter(v => v > 0);
                const prev = hist.length ? hist[hist.length - 1] : 0;
                const delta = prev > 0 ? Math.round(((ge.totalEarned - prev) / prev) * 100) : (ge.totalEarned > 0 ? 100 : 0);
                return (
                  <GradeMiniCard
                    key={ge.key}
                    node={ge}
                    active={ge.key === focusedGradeKey}
                    delta={delta}
                    series={series.length >= 2 ? series : [0, ge.totalEarned]}
                    color={["sky", "violet", "emerald"][i] || "sky"}
                    onClick={() => setFocusedGradeKey(ge.key)}
                    onOpen={() => { setSelectedGradeKey(ge.key); setView("grade-detail"); }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* ====================== EARNINGS TABLE ====================== */}
        {focusedNode && (
          <Card className="border border-border/60 rounded-2xl shadow-none overflow-hidden">
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-black">
                تفاصيل الأرباح - الصف {formatGrade(focusedNode.grade)} {formatStage(focusedNode.stage)}
              </CardTitle>
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 rounded-full">
                <Download className="h-3 w-3" /> تصدير
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <GradeEarningsTable groups={focusedGroups} pct={ratePct} />
              <div className="border-t border-border/50 px-3 py-2.5 flex items-center justify-between bg-muted/30">
                <span className="text-xs font-bold">إجمالي الصف</span>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground">{focusedStudents} طالب</span>
                  <span className="text-sm font-black text-emerald-600">{fmtMoney(focusedTotal)} جنيه</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ====================== GROWTH + SUMMARY ====================== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Growth chart */}
          <Card className="border border-border/60 rounded-2xl shadow-none overflow-hidden">
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-black">نمو الأرباح</CardTitle>
              <span className="text-[11px] text-muted-foreground bg-muted px-2 py-1 rounded-full">آخر {growthData.length} أشهر</span>
            </CardHeader>
            <CardContent className="pb-3">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={growthData}>
                    <defs>
                      <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(262 83% 58%)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(262 83% 58%)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      formatter={(v: number) => [`${v.toLocaleString()} ج`, "الأرباح"]}
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 11 }} />
                    <Area type="monotone" dataKey="v" stroke="hsl(262 83% 58%)" strokeWidth={2.5} fill="url(#growthGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Monthly summary */}
          <Card className="border border-border/60 rounded-2xl shadow-none overflow-hidden">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-black">ملخص هذا الشهر</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <SummaryStat label="الاشتراكات" value={fmtInt(subsCount)} sub="اشتراك" icon={<BookOpen className="h-4 w-4" />} color="bg-blue-100 text-blue-600" />
              <SummaryStat label="الطلاب الجدد" value={fmtInt(newStudentsCount)} sub="طالب" icon={<Users className="h-4 w-4" />} color="bg-emerald-100 text-emerald-600" />
              <SummaryStat label="إجمالي الإيرادات" value={fmtInt(totalRevenue)} sub="جنيه" icon={<Wallet className="h-4 w-4" />} color="bg-violet-100 text-violet-600" />
              <SummaryStat label={`أرباح (${ratePct}%)`} value={fmtInt(totalAll)} sub="جنيه" icon={<TrendingUp className="h-4 w-4" />} color="bg-emerald-100 text-emerald-600" />
            </CardContent>
          </Card>
        </div>

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

function HeroStat({ icon, label, value, sub, highlight }: { icon: React.ReactNode; label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className="text-center relative px-1 first:border-l first:border-white/10">
      <div className={`flex items-center justify-center gap-1.5 text-[11px] mb-2 ${highlight ? "text-white" : "text-white/80"}`}>
        <span className={`h-6 w-6 rounded-full flex items-center justify-center ${highlight ? "bg-white/14 text-white" : "bg-white/10 text-white/90"}`}>{icon}</span>
        <span className="font-black">{label}</span>
      </div>
      <p className={`font-black text-[18px] leading-none ${highlight ? "text-white" : "text-white"}`}>{value}</p>
      {sub ? <p className="text-[10px] text-white/65 mt-1">{sub}</p> : <p className="text-[10px] text-white/65 mt-1">جنيه</p>}
    </div>
  );
}

function BigActionCard({ onClick, label, sub, icon, iconBg, disabled }: { onClick: () => void; label: string; sub: string; icon: React.ReactNode; iconBg: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`relative rounded-[24px] bg-card border border-border/60 p-3.5 shadow-[0_8px_24px_hsl(var(--foreground)/0.06)] hover:shadow-md hover:-translate-y-0.5 transition active:scale-95 text-right flex items-center justify-between gap-2 min-h-[92px] ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      <div className="min-w-0">
        <p className="text-[15px] font-black text-foreground leading-none">{label}</p>
        <p className="text-[12px] text-muted-foreground mt-2">{sub}</p>
      </div>
      <div className={`h-12 w-12 rounded-2xl ${iconBg} flex items-center justify-center text-white shadow-md shrink-0`}>
        {icon}
      </div>
    </button>
  );
}

function GradeMiniCard({ node, active, delta, color, onClick, onOpen, series }: { node: GradeNode; active: boolean; delta: number; color: string; onClick: () => void; onOpen: () => void; series: number[] }) {
  const palette: Record<string, { stroke: string; iconBg: string; iconText: string; deltaText: string }> = {
    sky: { stroke: "hsl(199 89% 55%)", iconBg: "bg-sky-100", iconText: "text-sky-600", deltaText: "text-sky-600" },
    violet: { stroke: "hsl(262 83% 58%)", iconBg: "bg-violet-100", iconText: "text-violet-600", deltaText: "text-violet-600" },
    emerald: { stroke: "hsl(142 76% 45%)", iconBg: "bg-emerald-100", iconText: "text-emerald-600", deltaText: "text-emerald-600" },
  };
  const p = palette[color] || palette.sky;
  const rid = `g-${node.key.replace(/[^a-z0-9]/gi, "")}`;
  const sample = useMemo(() => (series.length ? series : [0, 0]).map(v => ({ v })), [series]);

  return (
    <button onClick={onClick} onDoubleClick={onOpen}
      className={`relative rounded-2xl bg-card border p-3 text-right transition active:scale-[0.98] hover:shadow-md ${active ? `border-primary/60 ring-2 ring-primary/30 shadow-md` : "border-border/60"}`}>
      <div className="flex items-center justify-between mb-2">
        <button onClick={(e) => { e.stopPropagation(); onOpen(); }} className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center hover:bg-muted transition">
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-1.5">
          <p className="font-black text-sm">الصف {formatGrade(node.grade)} {formatStage(node.stage)}</p>
          <div className={`h-7 w-7 rounded-lg ${p.iconBg} ${p.iconText} flex items-center justify-center shadow-sm`}>
            <Wallet className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
      {/* Sparkline */}
      <div className="h-12 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sample}>
            <defs>
              <linearGradient id={rid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={p.stroke} stopOpacity={0.4} />
                <stop offset="100%" stopColor={p.stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area dataKey="v" type="monotone" stroke={p.stroke} strokeWidth={2.5} fill={`url(#${rid})`} dot={{ r: 2, fill: p.stroke }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-end justify-between mt-1">
        <div className={`flex items-center gap-0.5 text-[11px] font-bold ${delta >= 0 ? p.deltaText : "text-rose-600"}`}>
          <TrendingUp className={`h-3 w-3 ${delta < 0 ? "rotate-180" : ""}`} />
          {delta >= 0 ? "+" : ""}{delta}%
        </div>
        <div className="text-left">
          <p className="font-black text-sm text-foreground">{fmtMoney(node.totalEarned)}</p>
          <p className="text-[10px] text-muted-foreground">{node.subscriberCount} طالب</p>
        </div>
      </div>
    </button>
  );
}

function GradeEarningsTable({ groups, pct }: { groups: { id: string; title: string; price: number; net: number; count: number }[]; pct: number }) {
  if (groups.length === 0) {
    return <p className="text-center text-muted-foreground py-6 text-sm">لا توجد مجموعات بأرباح هذا الشهر</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-right text-xs">
        <thead className="bg-muted/40 border-b border-border/50">
          <tr>
            <th className="px-3 py-2 font-bold text-[11px] text-muted-foreground">المجموعة</th>
            <th className="px-2 py-2 font-bold text-[11px] text-muted-foreground">السعر</th>
            <th className="px-2 py-2 font-bold text-[11px] text-muted-foreground">المشتركين</th>
            <th className="px-2 py-2 font-bold text-[11px] text-muted-foreground">الأرباح ({pct}%)</th>
            <th className="px-3 py-2 font-bold text-[11px] text-muted-foreground">الحساب</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <tr key={g.id} className={`${i % 2 ? "bg-muted/20" : ""} border-b border-border/30 last:border-0`}>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2 justify-end">
                  <span className="font-bold text-[12px]">{g.title}</span>
                  <span className="h-7 w-7 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
                    <Users className="h-3.5 w-3.5" />
                  </span>
                </div>
              </td>
              <td className="px-2 py-2.5">
                <div>
                  <p className="font-bold">{fmtInt(g.price)}</p>
                  <p className="text-[9px] text-muted-foreground">جنيه</p>
                </div>
              </td>
              <td className="px-2 py-2.5">
                <div>
                  <p className="font-bold">{g.count}</p>
                  <p className="text-[9px] text-muted-foreground">طالب</p>
                </div>
              </td>
              <td className="px-2 py-2.5">
                <div>
                  <p className="font-black text-emerald-600">{fmtInt(g.net)}</p>
                  <p className="text-[9px] text-muted-foreground">جنيه</p>
                </div>
              </td>
              <td className="px-3 py-2.5 font-mono text-[10px] text-muted-foreground">
                {g.count} × {fmtInt(g.price)} × {pct}%<br />= {fmtInt(g.net)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryStat({ label, value, sub, icon, color }: { label: string; value: string; sub: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-[22px] bg-card border border-border/60 p-3.5 shadow-[0_8px_24px_hsl(var(--foreground)/0.05)] min-h-[128px]">
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-[12px] text-muted-foreground font-semibold leading-relaxed">{label}</p>
        <div className={`h-10 w-10 rounded-2xl ${color} flex items-center justify-center shadow-sm shrink-0`}>{icon}</div>
      </div>
      <p className="text-[18px] font-black text-foreground leading-none">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-2">{sub}</p>
    </div>
  );
}

function ArchiveHero({ label, earned, subs, groups }: { label: string; earned: number; subs: number; groups: number }) {
  return (
    <Card className="border-0 shadow-lg rounded-3xl text-white overflow-hidden relative"
      style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6,#d946ef)" }}>
      <CardContent className="p-5 relative">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center border border-white/25">
            <Archive className="h-7 w-7" />
          </div>
          <div>
            <p className="text-[11px] opacity-80">سجل شهر مؤرشف</p>
            <p className="text-xl font-black">{label}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-white/20 rounded-2xl p-2.5 text-center border border-white/25">
            <p className="text-[10px] opacity-90">الأرباح</p>
            <p className="font-black text-sm mt-0.5">{fmtMoney(earned)} ج</p>
          </div>
          <div className="bg-white/20 rounded-2xl p-2.5 text-center border border-white/25">
            <p className="text-[10px] opacity-90">المشتركين</p>
            <p className="font-black text-sm mt-0.5">{subs}</p>
          </div>
          <div className="bg-white/20 rounded-2xl p-2.5 text-center border border-white/25">
            <p className="text-[10px] opacity-90">المجموعات</p>
            <p className="font-black text-sm mt-0.5">{groups}</p>
          </div>
        </div>
      </CardContent>
    </Card>
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
