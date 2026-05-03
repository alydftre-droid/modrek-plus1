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
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";

const methodLabels: Record<string, string> = {
  vodafone_cash: "فودافون كاش", orange_cash: "أورانج كاش", etisalat_cash: "اتصالات كاش", instapay: "InstaPay",
};
const formatGrade = (g: string) => g === "first" ? "الأول" : g === "second" ? "الثاني" : g === "third" ? "الثالث" : g;
const formatStage = (s: string) => s === "secondary" ? "الثانوي" : s === "preparatory" ? "الإعدادي" : s;
const monthLabel = (period: string) => {
  const [y, m] = period.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("ar-EG", { year: "numeric", month: "long" });
};

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

  const teacherName = profile?.full_name || "";

  useEffect(() => {
    if (paymentMethods.length && !selectedPaymentMethodId) setSelectedPaymentMethodId(paymentMethods[0].id);
  }, [paymentMethods, selectedPaymentMethodId]);

  // Wallet (with frozen balance)
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

  // Withdrawal settings
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

  // Current-period earnings (active records, grouped by grade)
  const { data: currentRecords = [], isLoading: earningsLoading } = useQuery({
    queryKey: ["teacher-earnings-current", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("teacher_earning_records" as any)
        .select("*")
        .eq("teacher_id", user.id)
        .eq("is_archived", false)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user, staleTime: 30 * 1000,
  });

  // Subjects for current records
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

  // Group by grade
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
    return [...map.values()].map(g => ({
      ...g, subscriberCount: g.students.size, groupCount: g.groups.size,
    }));
  }, [currentRecords, meta]);

  // Archives list
  const { data: archives = [] } = useQuery({
    queryKey: ["teacher-archives", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("teacher_monthly_archives" as any)
        .select("*")
        .eq("teacher_id", user.id)
        .order("archived_at", { ascending: false });
      return data || [];
    },
    enabled: !!user, staleTime: 60 * 1000,
  });

  const balance = Number(wallet?.balance || 0);
  const frozen = Number(wallet?.frozen_balance || 0);
  const totalEarned = Number(wallet?.total_earned || 0);
  const totalWithdrawn = useMemo(() => withdrawals.filter((w: any) => w.status === "approved").reduce((s: number, w: any) => s + Number(w.amount), 0), [withdrawals]);
  const pendingWithdrawal = withdrawals.find((w: any) => w.status === "pending");

  // Withdrawal window calc
  const isWithdrawalOpen = useMemo(() => {
    if (!settings) return false;
    if (settings.manual === "open") return true;
    if (settings.manual === "closed") return false;
    return new Date().getDate() >= settings.openDay;
  }, [settings]);

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
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("teacher_request_withdrawal" as any, {
        _amount: amount,
        _payment_method: method.method_type,
        _phone_number: method.phone_number,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) { toast.error(result?.error || "خطأ"); return; }
      toast.success("تم تقديم طلب السحب");
      setShowWithdraw(false); setWithdrawAmount("");
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
    if (status === "pending") return <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]"><Clock className="h-3 w-3 ml-0.5" />معلق</Badge>;
    if (status === "approved") return <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]"><CheckCircle className="h-3 w-3 ml-0.5" />مكتمل</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-700 border-0 text-[10px]"><XCircle className="h-3 w-3 ml-0.5" />مرفوض</Badge>;
    return <Badge className="text-[10px]">{status}</Badge>;
  };

  if (loading) {
    return <TeacherSidebarLayout title="المحفظة" teacherName={teacherName}><div className="flex items-center justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div></TeacherSidebarLayout>;
  }

  // ============== ARCHIVE DETAIL VIEW ==============
  if (view === "archive-detail" && selectedArchiveId) {
    const archive = archives.find((a: any) => a.id === selectedArchiveId) as any;
    if (!archive) { setView("archives"); return null; }
    const breakdown = (archive.breakdown || []) as any[];
    return (
      <TeacherSidebarLayout title="سجل شهر" teacherName={teacherName}>
        <div className="p-4 max-w-3xl mx-auto space-y-4">
          <Button variant="ghost" onClick={() => { setView("archives"); setSelectedArchiveId(null); }} className="gap-1">
            <ChevronLeft className="h-4 w-4 rotate-180" /> رجوع للسجلات
          </Button>
          <Card className="border-0 shadow-md bg-gradient-to-br from-indigo-500 to-purple-600 text-white overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <Archive className="h-6 w-6" />
                <div>
                  <p className="text-xs opacity-80">سجل شهر</p>
                  <p className="text-xl font-bold">{monthLabel(archive.period_label)}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="bg-white/15 rounded-xl p-2 text-center"><p className="text-[10px] opacity-80">الأرباح</p><p className="font-bold">{Number(archive.total_earned).toLocaleString()}</p></div>
                <div className="bg-white/15 rounded-xl p-2 text-center"><p className="text-[10px] opacity-80">المشتركين</p><p className="font-bold">{archive.total_subscribers}</p></div>
                <div className="bg-white/15 rounded-xl p-2 text-center"><p className="text-[10px] opacity-80">المجموعات</p><p className="font-bold">{archive.total_groups}</p></div>
              </div>
            </CardContent>
          </Card>

          {breakdown.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /> تفاصيل المجموعات</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {breakdown.map((g: any, j: number) => (
                  <div key={j} className="p-3 rounded-xl bg-accent/40 border border-border/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="font-bold text-sm">{g.group_title || "مجموعة"}</p>
                      <span className="font-bold text-primary text-sm">{Math.round(Number(g.net)).toLocaleString()} ج</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {g.subject_name} - {formatGrade(g.grade)} {formatStage(g.stage)}
                    </p>
                    <div className="mt-2 p-2 rounded-lg bg-background/60 font-mono text-xs flex items-center justify-center gap-1.5 flex-wrap">
                      <Calculator className="h-3 w-3 text-emerald-600" />
                      <span>{g.students}</span><span className="text-muted-foreground">×</span>
                      <span>{Number(g.price).toFixed(0)}</span><span className="text-muted-foreground">×</span>
                      <span>{Math.round(Number(archive.commission_rate) * 100)}%</span>
                      <span className="text-muted-foreground">=</span>
                      <span className="font-bold text-emerald-600">{Math.round(Number(g.net)).toLocaleString()} ج</span>
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

  // ============== ARCHIVES LIST VIEW ==============
  if (view === "archives") {
    return (
      <TeacherSidebarLayout title="سجل المحفظة" teacherName={teacherName}>
        <div className="p-4 max-w-3xl mx-auto space-y-4">
          <Button variant="ghost" onClick={() => setView("main")} className="gap-1">
            <ChevronLeft className="h-4 w-4 rotate-180" /> رجوع للمحفظة
          </Button>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Archive className="h-5 w-5 text-primary" /> سجلات الأشهر السابقة</CardTitle></CardHeader>
            <CardContent>
              {archives.length === 0 ? (
                <div className="text-center py-10">
                  <Archive className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">لا توجد سجلات بعد</p>
                  <p className="text-[11px] text-muted-foreground mt-1">يتم إنشاء السجلات تلقائياً عند فتح موعد السحب لكل شهر</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {archives.map((a: any, i: number) => (
                    <motion.button key={a.id}
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      onClick={() => { setSelectedArchiveId(a.id); setView("archive-detail"); }}
                      className="w-full p-3 rounded-xl bg-accent/30 border border-border/50 hover:bg-accent/60 transition text-right flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                          <Calendar className="h-5 w-5 text-white" />
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm">سجل {monthLabel(a.period_label)}</p>
                          <p className="text-[11px] text-muted-foreground">{a.total_subscribers} مشترك • {a.total_groups} مجموعة</p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-primary">{Number(a.total_earned).toLocaleString()} ج</p>
                        <ChevronLeft className="h-4 w-4 text-muted-foreground inline" />
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </TeacherSidebarLayout>
    );
  }

  // ============== GRADE DETAIL VIEW ==============
  if (view === "grade-detail" && selectedGradeKey && meta) {
    const node = gradeNodes.find(g => g.key === selectedGradeKey);
    if (!node) { setView("main"); return null; }

    // Records for this grade
    const gradeRecords = currentRecords.filter((r: any) => {
      const subj = meta.subjects.get(r.subject_id) as any;
      return subj && `${subj.stage}__${subj.grade}__${subj.category}` === selectedGradeKey;
    });

    // Group by group_id
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

    // Monthly chart from this grade's archives + current
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
          <Button variant="ghost" onClick={() => { setView("main"); setSelectedGradeKey(null); }} className="gap-1">
            <ChevronLeft className="h-4 w-4 rotate-180" /> رجوع للمحفظة
          </Button>

          <Card className="border-0 shadow-md bg-gradient-to-br from-emerald-500 to-teal-600 text-white overflow-hidden">
            <CardContent className="p-5">
              <h2 className="text-lg font-bold">الصف {formatGrade(node.grade)} {formatStage(node.stage)}</h2>
              <p className="text-white/80 text-xs">{node.category}</p>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="bg-white/15 rounded-xl p-2 text-center"><p className="text-[10px] opacity-80">الأرباح</p><p className="font-bold">{node.totalEarned.toLocaleString()}</p></div>
                <div className="bg-white/15 rounded-xl p-2 text-center"><p className="text-[10px] opacity-80">المشتركين</p><p className="font-bold">{node.subscriberCount}</p></div>
                <div className="bg-white/15 rounded-xl p-2 text-center"><p className="text-[10px] opacity-80">المجموعات</p><p className="font-bold">{node.groupCount}</p></div>
              </div>
            </CardContent>
          </Card>

          {/* Groups with calculation */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" /> المجموعات ({groups.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {groups.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">لا توجد مجموعات بأرباح هذا الشهر</p>
              ) : groups.map((g) => (
                <motion.div key={g.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-accent/40 border border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm truncate">{g.title}</p>
                      <p className="text-[11px] text-muted-foreground">{g.count} مشترك • سعر الكورس {g.price.toLocaleString()} ج</p>
                    </div>
                    <span className="font-bold text-emerald-600 shrink-0 mr-2">{Math.round(g.net).toLocaleString()} ج</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 font-mono text-xs flex items-center justify-center gap-1.5 flex-wrap border border-emerald-200/50">
                    <Calculator className="h-3 w-3 text-emerald-600" />
                    <span className="font-bold">{g.count}</span><span className="text-muted-foreground">×</span>
                    <span className="font-bold">{g.price.toFixed(0)}</span><span className="text-muted-foreground">×</span>
                    <span className="font-bold">{ratePct}%</span>
                    <span className="text-muted-foreground">=</span>
                    <span className="font-bold text-emerald-600">{Math.round(g.net).toLocaleString()} ج</span>
                  </div>
                </motion.div>
              ))}
            </CardContent>
          </Card>

          {/* Chart */}
          {chartData.length > 1 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> الأرباح الشهرية</CardTitle></CardHeader>
              <CardContent>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => [`${v.toLocaleString()} ج`, "الأرباح"]} />
                      <Bar dataKey="earnings" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </TeacherSidebarLayout>
    );
  }

  // ============== PAYMENT METHODS VIEW ==============
  if (view === "payment-methods") {
    return (
      <TeacherSidebarLayout title="طرق الدفع" teacherName={teacherName}>
        <div className="p-4 max-w-3xl mx-auto space-y-4">
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
              <button onClick={() => { setEditingMethod(null); setNewMethodPhone(""); setShowAddMethod(true); }} className="w-full justify-center text-sm bg-gradient-to-r from-primary to-primary/80 text-primary-foreground rounded-xl p-3 flex items-center gap-2"><Plus className="h-4 w-4" /> إضافة طريقة دفع</button>
            </CardContent>
          </Card>
        </div>
        <MethodDialog open={showAddMethod} onOpenChange={v => { setShowAddMethod(v); if (!v) setEditingMethod(null); }} editing={editingMethod} methodType={newMethodType} setMethodType={setNewMethodType} phone={newMethodPhone} setPhone={setNewMethodPhone} onSubmit={handleAddMethod} submitting={submitting} />
      </TeacherSidebarLayout>
    );
  }

  // ============== WITHDRAWAL HISTORY VIEW ==============
  if (view === "withdrawal-history") {
    // group by month
    const byMonth = new Map<string, { label: string; items: any[]; total: number; approved: number }>();
    withdrawals.forEach((w: any) => {
      const d = new Date(w.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("ar-EG", { year: "numeric", month: "long" });
      const g = byMonth.get(key) || { label, items: [], total: 0, approved: 0 };
      g.items.push(w);
      g.total += Number(w.amount);
      if (w.status === "approved") g.approved += Number(w.amount);
      byMonth.set(key, g);
    });
    const monthly = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));

    return (
      <TeacherSidebarLayout title="سجل السحب" teacherName={teacherName}>
        <div className="p-4 max-w-3xl mx-auto space-y-4">
          <Button variant="ghost" onClick={() => setView("main")} className="gap-1"><ChevronLeft className="h-4 w-4 rotate-180" /> رجوع</Button>
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-lg font-bold">{withdrawals.length}</p><p className="text-[10px] text-muted-foreground">إجمالي الطلبات</p></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-emerald-600">{totalWithdrawn.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">تم تحويلها</p></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-amber-600">{withdrawals.filter((w: any) => w.status === "pending").length}</p><p className="text-[10px] text-muted-foreground">معلقة</p></CardContent></Card>
          </div>
          {monthly.length === 0 ? (
            <Card className="border-0 shadow-sm"><CardContent className="p-8 text-center text-muted-foreground">لا توجد طلبات</CardContent></Card>
          ) : monthly.map(([key, g]) => (
            <Card key={key} className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2"><Calendar className="h-4 w-4 text-indigo-600" /> {g.label}</span>
                  <span className="text-[11px] font-normal text-muted-foreground">{g.items.length} طلب</span>
                </CardTitle>
                <div className="flex justify-between text-[11px] mt-1">
                  <span className="text-emerald-600 font-bold">تم تحويل: {g.approved.toLocaleString()} ج</span>
                  <span className="text-muted-foreground">إجمالي: {g.total.toLocaleString()} ج</span>
                </div>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                {g.items.map((w: any) => (
                  <div key={w.id} className="p-3 rounded-xl bg-accent/30 border border-border/50">
                    <div className="flex items-center justify-between mb-1"><span className="font-bold text-sm">{Number(w.amount).toLocaleString()} جنيه</span>{statusBadge(w.status)}</div>
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
          ))}
        </div>
      </TeacherSidebarLayout>
    );
  }

  // ============== MAIN VIEW ==============
  return (
    <TeacherSidebarLayout title="المحفظة" teacherName={teacherName}>
      <div className="p-4 max-w-4xl mx-auto space-y-4">

        {/* Hero balance card */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: "linear-gradient(135deg, #5B3FD9 0%, #7C3AED 50%, #4338CA 100%)" }}
          className="rounded-3xl overflow-hidden text-white p-5 shadow-xl relative">
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full -translate-y-1/2 translate-x-1/2" style={{ background: "rgba(255,255,255,0.10)" }} />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-white"><Wallet className="h-5 w-5" /><span className="text-sm font-semibold">المحفظة</span></div>
              <Badge className="bg-white text-purple-700 border-0 text-[10px] font-bold hover:bg-white">نسبة {Math.round((settings?.rate || 0.55) * 100)}%</Badge>
            </div>
            <p className="text-xs text-white/90">الرصيد المتاح للسحب</p>
            <p className="text-4xl font-bold my-1 text-white">{balance.toLocaleString()} <span className="text-base font-normal text-white/90">جنيه</span></p>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div className="rounded-xl p-2 border border-white/40" style={{ background: "rgba(255,255,255,0.22)" }}>
                <p className="text-[10px] text-white/95">مجمد (الشهر)</p>
                <p className="font-bold text-sm text-white">{frozen.toLocaleString()}</p>
              </div>
              <div className="rounded-xl p-2 border border-white/40" style={{ background: "rgba(255,255,255,0.22)" }}>
                <p className="text-[10px] text-white/95">إجمالي الأرباح</p>
                <p className="font-bold text-sm text-white">{totalEarned.toLocaleString()}</p>
              </div>
              <div className="rounded-xl p-2 border border-white/40" style={{ background: "rgba(255,255,255,0.22)" }}>
                <p className="text-[10px] text-white/95">تم سحب</p>
                <p className="font-bold text-sm text-white">{totalWithdrawn.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => isWithdrawalOpen ? setShowWithdraw(true) : toast.error(settings?.notice || "السحب مغلق حالياً")}
                disabled={!isWithdrawalOpen}
                className={`flex-1 rounded-xl py-2.5 px-4 text-sm font-bold flex items-center justify-center gap-2 transition shadow-md ${isWithdrawalOpen ? "bg-white text-purple-700 hover:bg-white/95" : "bg-rose-500 text-white cursor-not-allowed"}`}>
                {isWithdrawalOpen ? <ArrowDownCircle className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                {isWithdrawalOpen ? "سحب" : "السحب مغلق"}
              </button>
              <button onClick={() => { setEditingMethod(null); setNewMethodPhone(""); setShowAddMethod(true); }}
                className="flex-1 rounded-xl py-2.5 px-4 text-sm font-bold flex items-center justify-center gap-2 bg-purple-900/40 hover:bg-purple-900/55 text-white border border-white/30 shadow-md">
                <Plus className="h-4 w-4" /> طريقة دفع
              </button>
            </div>
          </div>
        </motion.div>

        {/* Monthly archives strip — top of wallet */}
        {archives.length > 0 && (
          <Card className="border-0 shadow-sm bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold flex items-center gap-1.5"><Archive className="h-3.5 w-3.5 text-indigo-600" /> سجلات الشهور</p>
                <button onClick={() => setView("archives")} className="text-[11px] text-indigo-600 font-bold">عرض الكل</button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                {archives.slice(0, 12).map((a: any) => (
                  <button
                    key={a.id}
                    onClick={() => { setSelectedArchiveId(a.id); setView("archive-detail"); }}
                    className="shrink-0 min-w-[110px] rounded-xl bg-white dark:bg-background border border-indigo-200/60 p-2.5 text-right hover:shadow-md transition active:scale-95"
                  >
                    <p className="text-[10px] text-muted-foreground">{monthLabel(a.period_label)}</p>
                    <p className="text-sm font-bold text-indigo-700 dark:text-indigo-400 mt-0.5">{Number(a.total_earned).toLocaleString()} ج</p>
                    <p className="text-[10px] text-muted-foreground">{a.total_subscribers} مشترك</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Withdrawal info banner */}
        {!isWithdrawalOpen && settings?.notice && (
          <Card className="border-0 shadow-sm bg-blue-50 dark:bg-blue-950/20 border border-blue-200/50">
            <CardContent className="p-3 flex items-center gap-3">
              <Info className="h-5 w-5 text-blue-600 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">{settings.notice}</p>
            </CardContent>
          </Card>
        )}

        {/* Frozen explanation */}
        {frozen > 0 && (
          <Card className="border-0 shadow-sm bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50">
            <CardContent className="p-3 flex items-start gap-2">
              <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-700">رصيد مجمد: {frozen.toLocaleString()} جنيه</p>
                <p className="text-[11px] text-amber-700/80 mt-0.5">أرباح هذا الشهر مجمدة وتنتقل للرصيد المتاح يوم {settings?.openDay || 25} من كل شهر</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending withdrawal */}
        {pendingWithdrawal && (
          <Card className="border-0 shadow-sm bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="p-3 flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-700">طلب سحب معلق: {Number((pendingWithdrawal as any).amount).toLocaleString()} جنيه</p>
                <p className="text-[10px] text-amber-600">بانتظار الموافقة</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick actions: 3 columns */}
        <div className="grid grid-cols-3 gap-2">
          <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => setView("payment-methods")}>
            <CardContent className="p-3 flex flex-col items-center gap-1.5 text-center">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center"><Settings2 className="h-4 w-4 text-white" /></div>
              <p className="text-xs font-bold">طرق الدفع</p>
              <p className="text-[10px] text-muted-foreground">{paymentMethods.length} مسجلة</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => setView("withdrawal-history")}>
            <CardContent className="p-3 flex flex-col items-center gap-1.5 text-center">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center"><History className="h-4 w-4 text-white" /></div>
              <p className="text-xs font-bold">سجل السحب</p>
              <p className="text-[10px] text-muted-foreground">{withdrawals.length} طلب</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => setView("archives")}>
            <CardContent className="p-3 flex flex-col items-center gap-1.5 text-center">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"><Archive className="h-4 w-4 text-white" /></div>
              <p className="text-xs font-bold">سجل المحفظة</p>
              <p className="text-[10px] text-muted-foreground">{archives.length} شهر</p>
            </CardContent>
          </Card>
        </div>

        {/* Open vs Frozen monthly chart */}
        {(archives.length > 0 || frozen > 0) && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" /> الرصيد المفتوح مقابل المجمد
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                يفك التجميد تلقائياً يوم {settings?.openDay || 25} من كل شهر — العلامة الحمراء تشير لأحدث تاريخ أرشفة
              </p>
            </CardHeader>
            <CardContent>
              {(() => {
                const sorted = [...archives].sort((a: any, b: any) =>
                  String(a.period_label).localeCompare(String(b.period_label))
                );
                const data = sorted.slice(-6).map((a: any) => ({
                  name: monthLabel(a.period_label),
                  مفتوح: Math.round(Number(a.total_earned) || 0),
                  مجمد: 0,
                }));
                const currentLabel = monthLabel(wallet?.current_period || new Date().toISOString().slice(0, 7)) + " (الحالي)";
                data.push({ name: currentLabel, مفتوح: 0, مجمد: Math.round(frozen) });
                const lastArchive = sorted[sorted.length - 1] as any;
                return (
                  <>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: number, n: string) => [`${Number(v).toLocaleString()} ج`, n]} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          {lastArchive && (
                            <ReferenceLine
                              x={monthLabel(lastArchive.period_label)}
                              stroke="hsl(var(--destructive))"
                              strokeDasharray="4 4"
                              label={{ value: "آخر أرشفة", position: "top", fill: "hsl(var(--destructive))", fontSize: 10 }}
                            />
                          )}
                          <Bar dataKey="مفتوح" stackId="a" fill="hsl(142 76% 45%)" />
                          <Bar dataKey="مجمد" stackId="a" fill="hsl(38 92% 55%)" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        <span>مفتوح للسحب: <b>{balance.toLocaleString()} ج</b></span>
                      </div>
                      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                        <span>مجمد: <b>{frozen.toLocaleString()} ج</b></span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Earnings by grade */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> تفاصيل الأرباح حسب الصف</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {gradeNodes.length === 0 ? <p className="text-center text-muted-foreground py-6 text-sm">لا توجد أرباح هذا الشهر</p> : gradeNodes.map((ge, i) => (
              <motion.div key={ge.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                className="p-3 rounded-xl bg-accent/30 border border-border/50 cursor-pointer hover:bg-accent/60 transition-colors"
                onClick={() => { setSelectedGradeKey(ge.key); setView("grade-detail"); }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <BookOpen className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-bold text-sm truncate">الصف {formatGrade(ge.grade)} {formatStage(ge.stage)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-primary text-sm">{ge.totalEarned.toLocaleString()} ج</span>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {ge.subscriberCount} مشترك</span>
                  <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {ge.groupCount} مجموعة</span>
                </div>
              </motion.div>
            ))}
          </CardContent>
        </Card>

        {/* Withdraw Dialog */}
        <Dialog open={showWithdraw} onOpenChange={setShowWithdraw}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowDownCircle className="h-5 w-5" />سحب الأرباح</DialogTitle><DialogDescription>أدخل المبلغ واختر طريقة الاستلام</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-emerald-100 border border-emerald-300">
                <p className="text-xs text-emerald-800 font-semibold">الرصيد المتاح</p>
                <p className="text-2xl font-bold text-emerald-800">{balance.toLocaleString()} ج</p>
                {frozen > 0 && <p className="text-[11px] text-amber-700 mt-1">+ {frozen.toLocaleString()} ج مجمد (يفتح يوم {settings?.openDay || 25})</p>}
              </div>
              <div><Label>المبلغ *</Label><Input type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="المبلغ" min={1} max={balance} /></div>
              {paymentMethods.length === 0 ? (
                <div className="p-4 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 text-center">
                  <p className="text-sm font-bold text-amber-700 mb-2">أضف طريقة دفع أولاً</p>
                  <button onClick={() => { setShowWithdraw(false); setShowAddMethod(true); }} className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground rounded-lg px-3 py-1.5 text-xs flex items-center gap-1 mx-auto"><Plus className="h-3 w-3" /> إضافة</button>
                </div>
              ) : (
                <div><Label>طريقة الاستلام *</Label>
                  <Select value={selectedPaymentMethodId} onValueChange={setSelectedPaymentMethodId}>
                    <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>{paymentMethods.map((pm: any) => <SelectItem key={pm.id} value={pm.id}>{methodLabels[pm.method_type] || pm.method_type} - {pm.phone_number}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200"><p className="text-xs text-amber-700">⏳ يُحوَّل المبلغ خلال 3 أيام عمل</p></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowWithdraw(false)}>إلغاء</Button>
              <Button onClick={handleWithdraw} disabled={submitting || !withdrawAmount || !selectedPaymentMethodId || paymentMethods.length === 0} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white border-0">
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
          <Button onClick={onSubmit} disabled={submitting || !phone.trim()} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white border-0">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "حفظ" : "إضافة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
