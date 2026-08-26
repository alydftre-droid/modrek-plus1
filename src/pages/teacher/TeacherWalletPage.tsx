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
  Sparkles, Shield, Trash2, Pencil, ArrowUpRight, Snowflake, PieChart, ChevronDown, Download, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Area, AreaChart, LineChart, Line } from "recharts";
import wallet3D from "@/assets/wallet-3d-clean.png";
import { reportTeacherScopedStudentIds } from "@/lib/testStudentLeakGuard";

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

const normalizeCommissionRate = (value?: number | string | null) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0.7;
  return numeric > 1 ? numeric / 100 : numeric;
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
      const [{ data: data }, { data: profileRate }, { data: effectiveRate }] = await Promise.all([
        supabase.from("platform_settings").select("key, value")
          .in("key", ["withdrawal_open_day", "withdrawal_manual_state", "withdrawal_notice_message", "teacher_commission_rate", "withdrawal_requests_state", "withdrawal_requests_open_at"]),
        user ? supabase.from("profiles").select("commission_rate, pending_commission_rate, pending_effective_date").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
        user ? supabase.rpc("get_effective_teacher_commission", { _teacher_id: user.id }) : Promise.resolve({ data: null }),
      ]);

      const m = new Map((data || []).map((r: any) => [r.key, r.value]));
      const resolvedRate = normalizeCommissionRate(
        effectiveRate ?? profileRate?.commission_rate ?? m.get("teacher_commission_rate") ?? 0.7,
      );

      return {
        openDay: parseInt(m.get("withdrawal_open_day") || "25"),
        manual: m.get("withdrawal_manual_state") || "auto",
        requestsState: m.get("withdrawal_requests_state") || "auto",
        requestsOpenAt: m.get("withdrawal_requests_open_at") || "",
        notice: m.get("withdrawal_notice_message") || "",
        rate: resolvedRate,
        pendingRate: profileRate?.pending_commission_rate ?? null,
        pendingEffectiveDate: profileRate?.pending_effective_date ?? null,
      };
    },
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 15000,
  });

  const { data: currentRecords = [], isLoading: earningsLoading } = useQuery({
    queryKey: ["teacher-earnings-current", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("teacher_earning_records" as any).select("*")
        .eq("teacher_id", user.id).eq("is_archived", false).order("created_at", { ascending: false });
      reportTeacherScopedStudentIds("teacher_earning_records", (data || []).map((record: any) => record.student_id), {
        page: "TeacherWalletPage.currentRecords",
      });
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
      const subjects: Record<string, any> = {};
      (subRes.data || []).forEach((s: any) => { if (s?.id) subjects[s.id] = s; });
      const groups: Record<string, any> = {};
      (grpRes.data || []).forEach((g: any) => { if (g?.id) groups[g.id] = g; });
      return { subjects, groups };
    },
    enabled: subjectIds.length > 0 || groupIds.length > 0,
  });

  const gradeNodes: GradeNode[] = useMemo(() => {
    if (!meta) return [];
    const map = new Map<string, GradeNode & { students: Set<string>; groups: Set<string> }>();
    currentRecords.forEach((r: any) => {
      const subj = meta.subjects[r.subject_id] as any;
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

  const { data: walletTransactions = [] } = useQuery({
    queryKey: ["teacher-wallet-transactions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("teacher_wallet_transactions" as any)
        .select("id, amount, transaction_type, description, balance_after, metadata, created_at")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false })
        .limit(120);
      return data || [];
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  const balance = Number(wallet?.balance || 0);
  const frozen = Number(wallet?.frozen_balance || 0);
  const totalEarned = Number(wallet?.total_earned || 0);
  const totalWithdrawn = useMemo(() => withdrawals.filter((w: any) => w.status === "approved").reduce((s: number, w: any) => s + Number(w.amount), 0), [withdrawals]);
  const pendingWithdrawal = withdrawals.find((w: any) => w.status === "pending");
  const totalAll = balance + frozen;

  // Cairo "now" so the developer-defined open time is timezone-accurate.
  const cairoNow = useMemo(
    () => new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" })),
    [settings],
  );

  // Developer-defined scheduled open moment (local Cairo wall clock).
  const scheduledOpenAt = useMemo(() => {
    const raw = String(settings?.requestsOpenAt || "").trim();
    if (!raw) return null;
    const [datePart, timePart = "00:00"] = raw.split(" ");
    const [y, mo, d] = datePart.split("-").map(Number);
    const [h, mi] = timePart.split(":").map(Number);
    if (!y || !mo || !d) return null;
    return new Date(y, mo - 1, d, h || 0, mi || 0, 0);
  }, [settings?.requestsOpenAt]);

  const isWithdrawalOpen = useMemo(() => {
    if (!settings) return false;
    if (settings.requestsState === "open") return true;
    if (settings.requestsState === "closed") return false;
    if (settings.requestsState === "scheduled") {
      return !!scheduledOpenAt && cairoNow.getTime() >= scheduledOpenAt.getTime();
    }
    if (settings.manual === "open") return true;
    if (settings.manual === "closed") return false;
    return cairoNow.getDate() >= settings.openDay;
  }, [settings, scheduledOpenAt, cairoNow]);

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
    if (settings.requestsState === "scheduled" && scheduledOpenAt) {
      return scheduledOpenAt.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
    }
    const today = new Date();
    const d = new Date(today.getFullYear(), today.getMonth(), settings.openDay);
    if (today.getDate() >= settings.openDay) d.setMonth(d.getMonth() + 1);
    return d.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
  }, [settings, scheduledOpenAt]);

  const openTimeLabel = useMemo(() => {
    if (settings?.requestsState === "scheduled" && scheduledOpenAt) {
      return scheduledOpenAt.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
    }
    return "12:00 ص";
  }, [settings?.requestsState, scheduledOpenAt]);

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

  const currentMonthProfit = useMemo(
    () => currentRecords.reduce((sum: number, record: any) => sum + Number(record.net_amount || 0), 0),
    [currentRecords],
  );

  const loading = walletLoading || earningsLoading;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["teacher-wallet-v2"] });
    qc.invalidateQueries({ queryKey: ["teacher-payment-methods"] });
    qc.invalidateQueries({ queryKey: ["teacher-withdrawals"] });
    qc.invalidateQueries({ queryKey: ["teacher-earnings-current"] });
    qc.invalidateQueries({ queryKey: ["teacher-archives"] });
    qc.invalidateQueries({ queryKey: ["teacher-wallet-transactions"] });
    qc.invalidateQueries({ queryKey: ["withdrawal-settings"] });
    qc.invalidateQueries({ queryKey: ["teacher-profile"] });
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

  // ============== ARCHIVE DETAIL (FULL SNAPSHOT REPLICA) ==============
  if (view === "archive-detail" && selectedArchiveId) {
    const archive = archives.find((a: any) => a.id === selectedArchiveId) as any;
    if (!archive) { setView("archives"); return null; }
    return (
      <TeacherSidebarLayout title="سجل شهر" teacherName={teacherName}>
        <div className="max-w-[440px] mx-auto px-3 py-4 space-y-4 pb-24">
          <BackButton onClick={() => { setView("archives"); setSelectedArchiveId(null); }} label="رجوع للسجلات" />
          <ArchiveWalletReplica archive={archive} />
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
          <SectionCard icon={<History className="h-5 w-5" />} title="آخر حركات المحفظة">
            {walletTransactions.length === 0 ? (
              <EmptyState icon={<History className="h-10 w-10" />} title="لا توجد حركات بعد" subtitle="عند الإقفال الشهري ستظهر حركة نقل الرصيد هنا" />
            ) : (
              <div className="space-y-2">
                {walletTransactions.slice(0, 12).map((tx: any) => (
                  <div key={tx.id} className="p-3 rounded-2xl bg-card border border-border/60 flex items-start justify-between gap-3">
                    <div className="min-w-0 text-right">
                      <p className="text-sm font-black text-foreground">{walletTransactionLabel(tx.transaction_type)}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{tx.description || "حركة مالية"}</p>
                      <p className="text-[10px] text-muted-foreground mt-1" dir="ltr">{new Date(tx.created_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</p>
                    </div>
                    <div className="text-left shrink-0">
                      <p className={Number(tx.amount) >= 0 ? "font-black text-emerald-600" : "font-black text-rose-600"}>
                        {Number(tx.amount) >= 0 ? "+" : ""}{fmtMoney(Number(tx.amount))} ج
                      </p>
                      {tx.balance_after != null && <p className="text-[10px] text-muted-foreground">بعدها {fmtMoney(Number(tx.balance_after))}</p>}
                    </div>
                  </div>
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
      const subj = meta.subjects[r.subject_id] as any;
      return subj && `${subj.stage}__${subj.grade}__${subj.category}` === selectedGradeKey;
    });
    const groupBreakdown = new Map<string, { title: string; price: number; students: Set<string>; net: number }>();
    gradeRecords.forEach((r: any) => {
      const g = meta.groups[r.group_id] as any;
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
  const ratePct = Math.round(normalizeCommissionRate(settings?.rate || 0.7) * 100);
  const focusedNode = gradeNodes.find(g => g.key === focusedGradeKey) || gradeNodes[0];

  let focusedGroups: { id: string; title: string; price: number; net: number; count: number }[] = [];
  let focusedTotal = 0;
  let focusedStudents = 0;
  if (focusedNode && meta) {
    const gradeRecords = currentRecords.filter((r: any) => {
      const subj = meta.subjects[r.subject_id] as any;
      return subj && `${subj.stage}__${subj.grade}__${subj.category}` === focusedNode.key;
    });
    const map = new Map<string, { title: string; price: number; students: Set<string>; net: number }>();
    gradeRecords.forEach((r: any) => {
      const g = meta.groups[r.group_id] as any;
      const title = g?.title || "مجموعة";
      const price = Number(g?.price || r.gross_amount);
      const existing = map.get(r.group_id) || { title, price, students: new Set<string>(), net: 0 };
      existing.students.add(r.student_id);
      existing.net += Number(r.net_amount);
      map.set(r.group_id, existing);
    });
    focusedGroups = [...map.entries()]
      .map(([id, v]) => ({ id, title: v.title, price: v.price, net: v.net, count: v.students.size }))
      .sort((a, b) => b.net - a.net);
    focusedTotal = focusedGroups.reduce((s, g) => s + g.net, 0);
    focusedStudents = focusedGroups.reduce((s, g) => s + g.count, 0);
  }

  const exportFocusedGrade = () => {
    if (!focusedNode || !focusedGroups.length || typeof window === "undefined") {
      toast.error("لا توجد بيانات قابلة للتصدير");
      return;
    }

    const csvRows = [
      ["المجموعة", "السعر", "المشتركين", `الأرباح (${ratePct}%)`, "الحساب"],
      ...focusedGroups.map((group) => [
        group.title,
        fmtMoney(group.price),
        String(group.count),
        fmtMoney(group.net),
        `${group.count} × ${fmtInt(group.price)} × ${ratePct}% = ${fmtMoney(group.net)}`,
      ]),
      ["إجمالي الصف", "", String(focusedStudents), fmtMoney(focusedTotal), ""],
    ];

    const csv = "\uFEFF" + csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wallet-${focusedNode.stage}-${focusedNode.grade}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <TeacherSidebarLayout title="المحفظة" teacherName={teacherName}>
      <div className="max-w-[440px] mx-auto px-3 py-4 space-y-4 pb-24">

        {/* ============== HERO (pixel-perfect spec) ============== */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          dir="rtl"
          className="relative w-full mx-auto overflow-hidden text-white"
          style={{
            maxWidth: 390,
            height: 200,
            borderRadius: 22,
            padding: 14,
            background: "linear-gradient(135deg, #162B75 0%, #4F2DFF 55%, #7B61FF 100%)",
            boxShadow: "0 16px 34px rgba(22,43,117,0.32)",
          }}
        >
          {/* Wallet image — absolute top-right, no container */}
          <img
            src={wallet3D}
            alt="محفظة"
            width={78}
            height={78}
            className="absolute object-contain pointer-events-none"
            style={{
              top: 8,
              right: 10,
              width: 78,
              height: 78,
              filter: "drop-shadow(0 10px 25px rgba(0,0,0,0.25))",
            }}
          />

          {/* Top row: LEFT = status (40%), RIGHT = balance (60%) */}
          <div className="relative flex items-start justify-between" style={{ height: 110 }}>
            {/* LEFT — status block (visually left in RTL = order-2) */}
            <div className="flex flex-col items-start text-left order-2" style={{ width: "40%" }} dir="ltr">
              <p className="flex items-center gap-1 font-semibold" style={{ fontSize: 12, color: "#34D399" }}>
                <span>⚡</span>
                <span dir="rtl">مفتوح السحب</span>
              </p>
              <p className="text-white" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, marginTop: 4 }} dir="rtl">
                {isWithdrawalOpen ? "نعم" : "لا"}
              </p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }} dir="rtl">
                حتى {openDateLabel}
              </p>
              <button
                onClick={() => setView("withdrawal-history")}
                className="inline-flex items-center gap-1 text-white"
                style={{
                  marginTop: 8,
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.15)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
                dir="rtl"
              >
                <Calendar className="h-3 w-3" />
                تفاصيل السحب
              </button>
            </div>

            {/* RIGHT — balance block (visually right in RTL = order-1) */}
            <div className="flex flex-col items-end text-right order-1 self-start" style={{ width: "60%", paddingRight: 84, paddingTop: 2 }} dir="rtl">
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1 }}>
                الرصيد الإجمالي
              </p>
              <div dir="ltr" className="flex items-end gap-1.5 whitespace-nowrap" style={{ marginTop: 14 }}>
                <h1 className="text-white" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.3px" }}>
                  {fmtMoney(totalAll)}
                </h1>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontWeight: 700, marginBottom: 3 }}>
                  جنيه
                </span>
              </div>
            </div>
          </div>

          {/* Growth badge — single line, fixed 12px gap under the balance amount */}
          <div
            className="absolute inline-flex items-center gap-1 whitespace-nowrap"
            style={{
              top: 101,
              right: 20,
              height: 24,
              padding: "0 10px",
              borderRadius: 12,
              background: "rgba(16,185,129,0.2)",
              color: "#34D399",
              fontSize: 11,
              fontWeight: 700,
              maxWidth: "calc(60% - 24px)",
            }}
            dir="rtl"
          >
            <TrendingUp className="h-3 w-3 shrink-0" />
            <span className="truncate">{monthDeltaPct >= 0 ? "+" : ""}{monthDeltaPct}% عن الشهر الماضي</span>
          </div>


          {/* BOTTOM STRIP — absolute, small, attached to bottom */}
          <div
            className="absolute grid grid-cols-3"
            style={{
              left: 10,
              right: 10,
              bottom: 10,
              height: 52,
              padding: "6px 8px",
              borderRadius: 16,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
            dir="rtl"
          >
            {/* RTL order: 1) نسبة أرباحك (right), 2) الرصيد المتاح (mid), 3) الرصيد المجمد (left) */}
            <HeroStripCell label="نسبة أرباحك" value={`${ratePct}%`} highlight />
            <HeroStripCell label="الرصيد المتاح" value={fmtMoney(balance)} divider />
            <HeroStripCell label="الرصيد المجمد" value={fmtMoney(frozen)} divider />
          </div>
        </motion.div>

        {/* Banners */}
        <AnimatePresence>
          {(settings?.requestsState === "closed" || (settings?.requestsState !== "open" && settings?.requestsState !== "scheduled" && settings?.manual === "closed")) && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <Banner color="rose" icon={<Lock />} title="السحب موقوف مؤقتاً من الإدارة" subtitle={settings?.notice || "لا يمكن تقديم طلبات سحب حالياً"} />
            </motion.div>
          )}
          {pendingWithdrawal && (
            <Banner color="amber" icon={<Clock />} title={`طلب سحب معلق: ${fmtMoney(Number((pendingWithdrawal as any).amount))} جنيه`} subtitle="بانتظار موافقة الإدارة — حتى 3 أيام عمل" />
          )}
        </AnimatePresence>

        {/* ============== 4 ACTION CARDS (2x2 mobile) ============== */}
        <div className="grid grid-cols-2 gap-2.5">
          <ActionRow onClick={() => isWithdrawalOpen && balance > 0 ? setShowWithdraw(true) : toast.error(settings?.notice || "السحب غير متاح حالياً")}
            disabled={!isWithdrawalOpen || balance <= 0}
            label="طلب سحب" sub="اسحب أرباحك"
            icon={<ArrowDownCircle className="h-5 w-5" />}
            iconBg="linear-gradient(135deg,#22c55e,#16a34a)" />
          <ActionRow onClick={() => setView("withdrawal-history")}
            label="سجل السحوبات" sub="عرض كل السحوبات"
            icon={<History className="h-5 w-5" />}
            iconBg="linear-gradient(135deg,#3b82f6,#2563eb)" />
          <ActionRow onClick={() => setView("archives")}
            label="سجل المحفظة" sub="الأرباح الشهرية"
            icon={<BookOpen className="h-5 w-5" />}
            iconBg="linear-gradient(135deg,#a855f7,#7c3aed)" />
          <ActionRow onClick={() => setView("payment-methods")}
            label="طرق الدفع" sub="إدارة حساباتك"
            icon={<CreditCard className="h-5 w-5" />}
            iconBg="linear-gradient(135deg,#fb923c,#f97316)" />
        </div>

        {/* ============== EARNINGS BY GRADE ============== */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="font-black text-sm">الأرباح حسب الصفوف</h2>
            <button onClick={() => setView("archives")} className="text-[11px] text-violet-600 font-bold hover:underline">عرض الكل</button>
          </div>
          {gradeNodes.length === 0 ? (
            <Card className="border border-border/60 rounded-2xl shadow-none">
              <CardContent className="p-6">
                <EmptyState icon={<TrendingUp className="h-10 w-10" />} title="لا توجد أرباح هذا الشهر" subtitle="ستظهر أرباحك من اشتراكات الطلاب هنا" />
              </CardContent>
            </Card>
          ) : (
            gradeNodes.length <= 3 ? (
              <div className={`grid gap-2 ${gradeNodes.length === 1 ? "grid-cols-1" : gradeNodes.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                {gradeNodes.map((ge, i) => {
                  const hist = gradeHistory.get(ge.key) || [];
                  const series = [...hist, ge.totalEarned].filter(v => v > 0);
                  const prev = hist.length ? hist[hist.length - 1] : 0;
                  const delta = prev > 0 ? Math.round(((ge.totalEarned - prev) / prev) * 100) : (ge.totalEarned > 0 ? 100 : 0);
                  return (
                    <GradeMiniCard
                      key={ge.key} node={ge} active={ge.key === focusedGradeKey}
                      delta={delta}
                      series={series.length >= 2 ? series : [0, ge.totalEarned]}
                      color={["sky", "violet", "emerald"][i] || "sky"}
                      onClick={() => setFocusedGradeKey(ge.key)}
                      onOpen={() => { setSelectedGradeKey(ge.key); setView("grade-detail"); }}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="-mx-1 overflow-x-auto scrollbar-none snap-x snap-mandatory" style={{ WebkitOverflowScrolling: "touch" }}>
                <div className="flex gap-2 px-1 pb-1">
                  {gradeNodes.map((ge, i) => {
                    const hist = gradeHistory.get(ge.key) || [];
                    const series = [...hist, ge.totalEarned].filter(v => v > 0);
                    const prev = hist.length ? hist[hist.length - 1] : 0;
                    const delta = prev > 0 ? Math.round(((ge.totalEarned - prev) / prev) * 100) : (ge.totalEarned > 0 ? 100 : 0);
                    const palette = ["sky", "violet", "emerald", "amber", "rose", "indigo"];
                    return (
                      <div key={ge.key} className="shrink-0 snap-start" style={{ width: "calc((100% - 1rem) / 3)", minWidth: "112px" }}>
                        <GradeMiniCard
                          node={ge} active={ge.key === focusedGradeKey}
                          delta={delta}
                          series={series.length >= 2 ? series : [0, ge.totalEarned]}
                          color={palette[i % palette.length]}
                          onClick={() => setFocusedGradeKey(ge.key)}
                          onOpen={() => { setSelectedGradeKey(ge.key); setView("grade-detail"); }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}
        </div>

        {/* ============== EARNINGS TABLE ============== */}
        {focusedNode && (
          <Card className="border border-border/60 rounded-2xl shadow-none overflow-hidden">
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0 gap-2 px-3 pt-3">
              <CardTitle className="text-[13px] font-black truncate">
                تفاصيل - الصف {formatGrade(focusedNode.grade)} {formatStage(focusedNode.stage)}
              </CardTitle>
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 rounded-full shrink-0" onClick={exportFocusedGrade}>
                <Download className="h-3 w-3" /> تصدير
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <GradeEarningsTable groups={focusedGroups} pct={ratePct} />
              <div className="border-t border-border/50 px-3 py-2.5 flex items-center justify-between bg-emerald-50/50 dark:bg-emerald-950/10">
                <span className="text-xs font-bold">إجمالي الصف</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{focusedStudents} طالب</span>
                  <span className="text-sm font-black text-emerald-600">{fmtMoney(focusedTotal)} ج</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ============== GROWTH CHART ============== */}
        <Card className="border border-border/60 rounded-2xl shadow-none overflow-hidden">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0 px-3 pt-3">
            <CardTitle className="text-sm font-black">نمو الأرباح</CardTitle>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded-full inline-flex items-center gap-1">
              <ChevronDown className="h-3 w-3" /> آخر {growthData.length} أشهر
            </span>
          </CardHeader>
          <CardContent className="pb-3 px-2">
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={growthData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip
                    cursor={{ stroke: "hsl(262 83% 58%)", strokeWidth: 1, strokeDasharray: "3 3" }}
                    formatter={(v: number) => [`${v.toLocaleString()} جنيه`, ""]}
                    contentStyle={{ background: "hsl(222 47% 11%)", border: "none", borderRadius: 8, fontSize: 11, color: "#fff", padding: "6px 10px" }}
                    labelStyle={{ display: "none" }}
                    itemStyle={{ color: "#fff", fontWeight: 700 }}
                  />
                  <Line type="monotone" dataKey="v" stroke="hsl(262 83% 58%)" strokeWidth={2.5}
                    dot={{ r: 3.5, fill: "hsl(262 83% 58%)", stroke: "#fff", strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: "hsl(262 83% 58%)", stroke: "#fff", strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* ============== MONTHLY SUMMARY ============== */}
        <Card className="border border-border/60 rounded-2xl shadow-none overflow-hidden">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0 px-3 pt-3">
            <CardTitle className="text-sm font-black flex items-center gap-2">
              <span className="h-7 w-7 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center"><BarChart3 className="h-4 w-4" /></span>
              ملخص هذا الشهر
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 px-3 pb-3 pt-0">
            <SummaryStat label="الاشتراكات" value={fmtInt(subsCount)} sub="اشتراك" icon={<BookOpen className="h-4 w-4" />} iconTone="violet" />
            <SummaryStat label="الطلاب الجدد" value={fmtInt(newStudentsCount)} sub="طالب" icon={<Users className="h-4 w-4" />} iconTone="emerald" />
            <SummaryStat label="إجمالي الإيرادات" value={fmtInt(totalRevenue)} sub="جنيه" icon={<FileText className="h-4 w-4" />} iconTone="indigo" />
            <SummaryStat label={`أرباح (${ratePct}%)`} value={fmtInt(currentMonthProfit)} sub="جنيه" icon={<TrendingUp className="h-4 w-4" />} iconTone="profit" highlight />
          </CardContent>
        </Card>

        {/* ============== INFO PILLS ============== */}
        <div className="grid grid-cols-1 gap-2">
          <InfoPill
            iconBg="bg-emerald-500"
            icon={<CheckCircle className="h-5 w-5 text-white" />}
            title={isWithdrawalOpen ? "السحب مفتوح الآن" : "السحب موقوف حالياً"}
            subtitle={isWithdrawalOpen ? "يمكنك سحب أرباحك في أي وقت" : (settings?.notice || `سيُفتح ${openDateLabel} - ${openTimeLabel}`)}
          />
          <InfoPill
            iconBg="bg-blue-500"
            icon={<Calendar className="h-5 w-5 text-white" />}
            title="موعد السحب القادم"
            subtitle={settings?.requestsState === "open" ? "مفتوح الآن" : `${openDateLabel} - ${openTimeLabel}`}
          />
          <InfoPill
            iconBg="bg-violet-500"
            icon={<PieChart className="h-5 w-5 text-white" />}
            title="نسبة العمولة الحالية"
            subtitle={`${ratePct}% من قيمة الاشتراكات`}
          />
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

function StatTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  const tones: Record<string, string> = {
    sky: "bg-sky-50 border-sky-200 text-sky-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    rose: "bg-rose-50 border-rose-200 text-rose-800",
    violet: "bg-violet-50 border-violet-200 text-violet-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-800",
    teal: "bg-teal-50 border-teal-200 text-teal-800",
    fuchsia: "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-800",
  };
  return (
    <div className={`rounded-2xl border p-3 ${tones[tone] || tones.sky}`}>
      <p className="text-[10px] font-bold opacity-80">{label}</p>
      <p className="text-sm font-black mt-1 tabular-nums">{value}</p>
    </div>
  );
}

function walletTransactionLabel(type: string) {
  const labels: Record<string, string> = {
    frozen_release: "تحويل الرصيد المجمّد للمتاح",
    monthly_release: "إقفال شهري",
    admin_credit: "إضافة رصيد إدارية",
    admin_debit: "خصم إداري",
    admin_bonus: "مكافأة إدارية",
    admin_penalty: "غرامة إدارية",
    admin_freeze: "تجميد رصيد",
    admin_unfreeze: "إفراج عن رصيد",
    withdrawal: "طلب سحب",
    commission: "عمولة اشتراك",
  };
  return labels[type] || type || "حركة محفظة";
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
    <div className="relative min-w-0 rounded-[18px] border border-white/10 bg-black/5 px-2 py-2 text-center" dir="rtl">
      <div className="mb-1 flex min-h-[22px] items-center justify-center gap-1 text-white/80">
        <span className="shrink-0 text-[12px]">{icon}</span>
        <span className="text-[9px] font-semibold leading-tight whitespace-normal">{label}</span>
      </div>
      <p className={`text-[13px] font-black leading-none tracking-normal sm:text-[14px] ${highlight ? "text-white" : "text-white"}`}>{value}</p>
      <p className="mt-1 text-[8px] font-semibold leading-none text-white/70">{sub || "جنيه"}</p>
    </div>
  );
}

function HeroStatCell({ icon, label, value, sub, divider, highlight }: { icon: React.ReactNode; label: string; value: string; sub?: string; divider?: boolean; highlight?: boolean }) {
  return (
    <div
      className="relative flex flex-col items-center justify-center px-1.5 py-1 text-center"
      style={divider ? { borderRight: "1px solid rgba(255,255,255,0.15)" } : undefined}
      dir="rtl"
    >
      <div className="mb-1 flex items-center justify-center gap-1" style={{ color: "rgba(255,255,255,0.7)" }}>
        <span className="shrink-0">{icon}</span>
        <span className="text-[11px] font-semibold leading-tight">{label}</span>
      </div>
      <p className={`text-[16px] font-bold leading-none ${highlight ? "text-emerald-300" : "text-white"}`}>{value}</p>
      <p className="mt-1 text-[10px] leading-none" style={{ color: "rgba(255,255,255,0.6)" }}>{sub}</p>
    </div>
  );
}

function HeroStripCell({ label, value, divider, highlight }: { label: string; value: string; divider?: boolean; highlight?: boolean }) {
  return (
    <div
      className="relative flex flex-col items-center justify-center text-center"
      style={divider ? { borderRight: "1px solid rgba(255,255,255,0.2)" } : undefined}
      dir="rtl"
    >
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", lineHeight: 1.1 }}>{label}</p>
      <p
        className={highlight ? "text-emerald-300" : "text-white"}
        style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.1, marginTop: 4 }}
      >
        {value}
      </p>
    </div>
  );
}

function ActionRow({ onClick, label, sub, icon, iconBg, disabled }: { onClick: () => void; label: string; sub: string; icon: React.ReactNode; iconBg: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} type="button"
      className={`relative rounded-[18px] bg-card border border-border/60 px-3 py-2.5 shadow-[0_6px_18px_hsl(var(--foreground)/0.06)] hover:shadow-md transition active:scale-95 flex items-center gap-2.5 min-h-[64px] ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      <div className="h-10 w-10 rounded-[12px] flex items-center justify-center text-white shadow-md shrink-0" style={{ background: iconBg }}>
        {icon}
      </div>
      <div className="min-w-0 text-right flex-1">
        <p className="text-[12px] font-black text-foreground leading-tight truncate">{label}</p>
        <p className="text-[10px] text-muted-foreground leading-tight truncate mt-0.5">{sub}</p>
      </div>
    </button>
  );
}

function BigActionCard({ onClick, label, sub, icon, iconStyle, disabled }: { onClick: () => void; label: string; sub: string; icon: React.ReactNode; iconStyle: { background: string }; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} type="button"
      className={`relative rounded-[18px] bg-card border border-border/60 px-2.5 py-2.5 shadow-[0_6px_18px_hsl(var(--foreground)/0.06)] hover:shadow-md hover:-translate-y-0.5 transition active:scale-95 flex items-center justify-between gap-2 min-h-[64px] ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      <div className="h-10 w-10 rounded-[12px] flex items-center justify-center text-white shadow-[0_8px_16px_rgba(0,0,0,0.14)] shrink-0" style={iconStyle}>
        {icon}
      </div>
      <div className="min-w-0 text-right flex-1">
        <p className="text-[12px] sm:text-[13px] font-black text-foreground leading-tight truncate">{label}</p>
        <p className="text-[10px] text-muted-foreground leading-tight truncate mt-0.5">{sub}</p>
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
      className={`relative rounded-2xl bg-card border p-2.5 sm:p-3 text-right transition active:scale-[0.98] hover:shadow-md ${active ? `border-primary/60 ring-2 ring-primary/30 shadow-md` : "border-border/60"}`}>
      <div className="flex items-center justify-between mb-2">
        <button onClick={(e) => { e.stopPropagation(); onOpen(); }} className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center hover:bg-muted transition">
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-1.5">
          <p className="font-black text-[12px] sm:text-sm leading-none">الصف {formatGrade(node.grade)} {formatStage(node.stage)}</p>
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
      <div className="flex items-end justify-between mt-1 gap-2">
        <div className={`flex items-center gap-0.5 text-[11px] font-bold ${delta >= 0 ? p.deltaText : "text-rose-600"}`}>
          <TrendingUp className={`h-3 w-3 ${delta < 0 ? "rotate-180" : ""}`} />
          {delta >= 0 ? "+" : ""}{delta}%
        </div>
        <div className="text-left">
          <p className="font-black text-[13px] sm:text-sm text-foreground">{fmtMoney(node.totalEarned)}</p>
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

function SummaryStat({ label, value, sub, icon, iconTone, highlight }: { label: string; value: string; sub: string; icon: React.ReactNode; iconTone: "violet" | "emerald" | "indigo" | "profit"; highlight?: boolean }) {
  const toneMap = {
    violet:  { bg: "#EEF2FF", color: "#6366F1", value: "text-foreground" },   // الاشتراكات - أزرق بنفسجي فاتح
    emerald: { bg: "#ECFDF5", color: "#10B981", value: "text-foreground" },   // الطلاب الجدد - أخضر فاتح
    indigo:  { bg: "#F5F3FF", color: "#8B5CF6", value: "text-foreground" },   // إجمالي الإيرادات - بنفسجي فاتح
    profit:  { bg: "#ECFDF5", color: "#10B981", value: "text-foreground" },   // الأرباح - أخضر فاتح
  } as const;
  const tone = toneMap[iconTone];

  return (
    <div className={`relative rounded-[20px] p-3 min-h-[112px] border ${highlight ? "border-emerald-200/80 bg-gradient-to-br from-white to-emerald-50/70" : "bg-card border-border/60"} shadow-[0_8px_24px_hsl(var(--foreground)/0.05)]`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div
          className="h-11 w-11 rounded-[16px] flex items-center justify-center shrink-0"
          style={{ background: tone.bg, color: tone.color }}
        >
          {icon}
        </div>
        <p className="text-[12px] text-muted-foreground font-semibold leading-relaxed text-right">{label}</p>
      </div>
      <p className={`text-[18px] sm:text-[20px] font-black leading-none ${tone.value}`}>{value}</p>
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

function InfoPill({ icon, iconBg, title, subtitle }: { icon: React.ReactNode; iconBg: string; title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border/60 p-3 flex items-center gap-3 shadow-[0_6px_18px_hsl(var(--foreground)/0.04)]">
      <div className={`h-10 w-10 rounded-2xl ${iconBg} flex items-center justify-center shadow-md shrink-0`}>{icon}</div>
      <div className="min-w-0 text-right flex-1">
        <p className="text-[13px] font-black text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
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

// ============================================================
// ArchiveWalletReplica — TRUE Pixel-Perfect frozen copy of the
// teacher's wallet exactly as it appeared at closing time.
// Renders the SAME section order and SAME components as the live
// main view. All data comes from archive.snapshot only. Interactive
// controls are visually preserved but disabled (read-only mode).
// Every grade is rendered with its OWN full details table (no
// truncation) so the archive stands alone as a complete document.
// ============================================================
function ArchiveWalletReplica({ archive }: { archive: any }) {
  const snap = (archive.snapshot && typeof archive.snapshot === "object" && Object.keys(archive.snapshot).length > 0)
    ? archive.snapshot as any
    : null;

  // ---- Derive replica fields (with graceful fallback for v2 snapshots) ----
  const stats = snap?.stats || {
    total_earned: Number(archive.total_earned) || 0,
    total_gross: 0,
    commission_rate: Number(archive.commission_rate) || 0.7,
    subscribers: Number(archive.total_subscribers) || 0,
    groups: Number(archive.total_groups) || 0,
    subjects: 0,
  };
  const walletBefore = snap?.wallet_before || {
    balance: Number(archive.total_earned) || 0,
    frozen_balance: 0,
    total_earned: Number(archive.total_earned) || 0,
  };
  const ratePct = Number(snap?.hero?.ratePct ?? Math.round(Number(stats.commission_rate || 0.7) * 100));
  const balance = Number(snap?.hero?.balance ?? walletBefore.balance ?? 0);
  const frozen = Number(snap?.hero?.frozen ?? walletBefore.frozen_balance ?? 0);
  const totalAll = Number(snap?.hero?.totalAll ?? (balance + frozen));
  const monthDeltaPct = Number(snap?.hero?.monthDeltaPct ?? 0);
  const openDateLabel = String(snap?.hero?.openDateLabel ?? "");
  const teacherName = String(snap?.teacher?.name ?? snap?.hero?.teacherName ?? "");

  const grades: any[] = Array.isArray(snap?.grades) ? snap.grades : [];
  const gradeHistory: Record<string, number[]> = (snap?.grade_history && typeof snap.grade_history === "object") ? snap.grade_history : {};
  const gradeDetails: Record<string, any[]> = (snap?.grade_details && typeof snap.grade_details === "object") ? snap.grade_details : {};
  const growthSeries: any[] = Array.isArray(snap?.growth_series) ? snap.growth_series : [];
  const summary = snap?.summary || {
    subsCount: Number(stats.subscribers || 0),
    newStudentsCount: Number(stats.new_students || 0),
    totalRevenue: Number(stats.total_gross || 0),
    currentMonthProfit: Number(stats.total_earned || 0),
  };

  const groupsList: any[] = Array.isArray(snap?.groups) ? snap.groups : (archive.breakdown || []);
  const snapTxns: any[] = Array.isArray(snap?.transactions) ? snap.transactions : [];
  const snapWithdrawals: any[] = Array.isArray(snap?.withdrawals) ? snap.withdrawals : [];
  const paymentMethodsSnap: any[] = Array.isArray(snap?.payment_methods) ? snap.payment_methods : [];

  const gradeNodes: GradeNode[] = grades.map((g) => ({
    key: g.key,
    stage: g.stage || "",
    grade: g.grade || "",
    category: g.category || "",
    totalEarned: Number(g.totalEarned || 0),
    subscriberCount: Number(g.subscriberCount || 0),
    groupCount: Number(g.groupCount || 0),
  }));

  const withdrawalStatusLabel = (s: string) => ({
    pending: "قيد المراجعة", approved: "قيد التنفيذ", paid: "تمت", rejected: "مرفوضة", cancelled: "ملغاة",
  } as Record<string, string>)[s] || s;

  const noop = () => {};
  const palette = ["sky", "violet", "emerald", "amber", "rose", "indigo"];

  return (
    <div className="space-y-4">
      {/* Frozen archive banner */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 font-bold flex items-center gap-2">
        <Archive className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          نسخة أرشيفية مثبتة — للقراءة فقط • {monthLabel(archive.period_label)}
          {snap?.captured_at && ` — ${new Date(snap.captured_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}`}
        </span>
      </div>

      {/* ============== HERO (identical to live wallet, frozen variant) ============== */}
      <div
        dir="rtl"
        className="relative w-full mx-auto overflow-hidden text-white"
        style={{
          maxWidth: 390, height: 200, borderRadius: 22, padding: 14,
          background: "linear-gradient(135deg, #162B75 0%, #4F2DFF 55%, #7B61FF 100%)",
          boxShadow: "0 16px 34px rgba(22,43,117,0.32)",
        }}
      >
        <img src={wallet3D} alt="محفظة" width={78} height={78}
          className="absolute object-contain pointer-events-none"
          style={{ top: 8, right: 10, width: 78, height: 78, filter: "drop-shadow(0 10px 25px rgba(0,0,0,0.25))" }} />

        <div className="relative flex items-start justify-between" style={{ height: 110 }}>
          <div className="flex flex-col items-start text-left order-2" style={{ width: "40%" }} dir="ltr">
            <p className="flex items-center gap-1 font-semibold" style={{ fontSize: 12, color: "#FBBF24" }}>
              <span>🔒</span><span dir="rtl">شهر مغلق</span>
            </p>
            <p className="text-white" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, marginTop: 4 }} dir="rtl">
              {monthLabel(archive.period_label)}
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }} dir="rtl">
              {openDateLabel ? `سُحبت لحظة ${openDateLabel}` : "أرشيف دائم"}
            </p>
          </div>
          <div className="flex flex-col items-end text-right order-1 self-start" style={{ width: "60%", paddingRight: 84, paddingTop: 2 }} dir="rtl">
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1 }}>الرصيد الإجمالي</p>
            <div dir="ltr" className="flex items-end gap-1.5 whitespace-nowrap" style={{ marginTop: 14 }}>
              <h1 className="text-white" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.3px" }}>{fmtMoney(totalAll)}</h1>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontWeight: 700, marginBottom: 3 }}>جنيه</span>
            </div>
          </div>
        </div>

        <div className="absolute inline-flex items-center gap-1 whitespace-nowrap"
          style={{ top: 101, right: 20, height: 24, padding: "0 10px", borderRadius: 12,
            background: "rgba(16,185,129,0.2)", color: "#34D399", fontSize: 11, fontWeight: 700, maxWidth: "calc(60% - 24px)" }} dir="rtl">
          <TrendingUp className="h-3 w-3 shrink-0" />
          <span className="truncate">{monthDeltaPct >= 0 ? "+" : ""}{monthDeltaPct}% عن الشهر الماضي</span>
        </div>

        <div className="absolute grid grid-cols-3"
          style={{ left: 10, right: 10, bottom: 10, height: 52, padding: "6px 8px", borderRadius: 16,
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }} dir="rtl">
          <HeroStripCell label="نسبة أرباحك" value={`${ratePct}%`} highlight />
          <HeroStripCell label="الرصيد المتاح" value={fmtMoney(balance)} divider />
          <HeroStripCell label="الرصيد المجمد" value={fmtMoney(frozen)} divider />
        </div>
      </div>

      {teacherName && (
        <div className="rounded-2xl border border-border/60 bg-card px-3 py-2 text-[12px] font-bold text-foreground text-right">
          المعلم: <span className="text-primary">{teacherName}</span>
        </div>
      )}

      {/* ============== 4 ACTION CARDS (2x2, read-only) ============== */}
      <div className="grid grid-cols-2 gap-2.5">
        <ActionRow onClick={noop} disabled label="طلب سحب" sub="غير متاح في الأرشيف"
          icon={<ArrowDownCircle className="h-5 w-5" />} iconBg="linear-gradient(135deg,#22c55e,#16a34a)" />
        <ActionRow onClick={noop} disabled label="سجل السحوبات" sub={`${snapWithdrawals.length} طلب هذا الشهر`}
          icon={<History className="h-5 w-5" />} iconBg="linear-gradient(135deg,#3b82f6,#2563eb)" />
        <ActionRow onClick={noop} disabled label="سجل المحفظة" sub="أرشيف الشهر"
          icon={<BookOpen className="h-5 w-5" />} iconBg="linear-gradient(135deg,#a855f7,#7c3aed)" />
        <ActionRow onClick={noop} disabled label="طرق الدفع" sub={`${paymentMethodsSnap.length} طريقة مسجلة`}
          icon={<CreditCard className="h-5 w-5" />} iconBg="linear-gradient(135deg,#fb923c,#f97316)" />
      </div>

      {/* ============== EARNINGS BY GRADE (ALL grades, wrapping grid — no truncation) ============== */}
      {gradeNodes.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="font-black text-sm">الأرباح حسب الصفوف</h2>
            <span className="text-[11px] text-muted-foreground">{gradeNodes.length} صفوف</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {gradeNodes.map((ge, i) => {
              const hist = gradeHistory[ge.key] || [];
              const series = hist.length ? hist : [0, ge.totalEarned];
              const prev = hist.length > 1 ? hist[hist.length - 2] : 0;
              const delta = prev > 0 ? Math.round(((ge.totalEarned - prev) / prev) * 100) : (ge.totalEarned > 0 ? 100 : 0);
              return (
                <GradeMiniCard key={ge.key} node={ge} active={false}
                  delta={delta} series={series.length >= 2 ? series : [0, ge.totalEarned]}
                  color={palette[i % palette.length]}
                  onClick={noop} onOpen={noop} />
              );
            })}
          </div>
        </div>
      )}

      {/* ============== FULL DETAILS TABLE — one per grade (no truncation) ============== */}
      {gradeNodes.map((node) => {
        const gGroups = (gradeDetails[node.key] || []) as any[];
        if (gGroups.length === 0) return null;
        const gTotal = gGroups.reduce((s, g) => s + Number(g.net || 0), 0);
        const gStudents = gGroups.reduce((s, g) => s + Number(g.count || 0), 0);
        return (
          <Card key={`gd-${node.key}`} className="border border-border/60 rounded-2xl shadow-none overflow-hidden">
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0 gap-2 px-3 pt-3">
              <CardTitle className="text-[13px] font-black truncate">
                تفاصيل - الصف {formatGrade(node.grade)} {formatStage(node.stage)}
              </CardTitle>
              <span className="text-[10px] text-muted-foreground shrink-0">{node.category}</span>
            </CardHeader>
            <CardContent className="p-0">
              <GradeEarningsTable groups={gGroups as any} pct={ratePct} />
              <div className="border-t border-border/50 px-3 py-2.5 flex items-center justify-between bg-emerald-50/50">
                <span className="text-xs font-bold">إجمالي الصف</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{gStudents} طالب</span>
                  <span className="text-sm font-black text-emerald-600">{fmtMoney(gTotal)} ج</span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* ============== GROWTH CHART ============== */}
      {growthSeries.length > 0 && (
        <Card className="border border-border/60 rounded-2xl shadow-none overflow-hidden">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0 px-3 pt-3">
            <CardTitle className="text-sm font-black">نمو الأرباح</CardTitle>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded-full">{growthSeries.length} أشهر</span>
          </CardHeader>
          <CardContent className="pb-3 px-2">
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={growthSeries} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip
                    formatter={(v: number) => [`${v.toLocaleString()} جنيه`, ""]}
                    contentStyle={{ background: "hsl(222 47% 11%)", border: "none", borderRadius: 8, fontSize: 11, color: "#fff", padding: "6px 10px" }}
                    labelStyle={{ display: "none" }} itemStyle={{ color: "#fff", fontWeight: 700 }} />
                  <Line type="monotone" dataKey="v" stroke="hsl(262 83% 58%)" strokeWidth={2.5}
                    dot={{ r: 3.5, fill: "hsl(262 83% 58%)", stroke: "#fff", strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============== MONTHLY SUMMARY ============== */}
      <Card className="border border-border/60 rounded-2xl shadow-none overflow-hidden">
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0 px-3 pt-3">
          <CardTitle className="text-sm font-black flex items-center gap-2">
            <span className="h-7 w-7 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center"><BarChart3 className="h-4 w-4" /></span>
            ملخص هذا الشهر
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 px-3 pb-3 pt-0">
          <SummaryStat label="الاشتراكات" value={fmtInt(Number(summary.subsCount || 0))} sub="اشتراك" icon={<BookOpen className="h-4 w-4" />} iconTone="violet" />
          <SummaryStat label="الطلاب الجدد" value={fmtInt(Number(summary.newStudentsCount || 0))} sub="طالب" icon={<Users className="h-4 w-4" />} iconTone="emerald" />
          <SummaryStat label="إجمالي الإيرادات" value={fmtInt(Number(summary.totalRevenue || 0))} sub="جنيه" icon={<FileText className="h-4 w-4" />} iconTone="indigo" />
          <SummaryStat label={`أرباح (${ratePct}%)`} value={fmtInt(Number(summary.currentMonthProfit || 0))} sub="جنيه" icon={<TrendingUp className="h-4 w-4" />} iconTone="profit" highlight />
        </CardContent>
      </Card>

      {/* ============== INFO PILLS (frozen values) ============== */}
      <div className="grid grid-cols-1 gap-2">
        <InfoPill iconBg="bg-amber-500" icon={<Lock className="h-5 w-5 text-white" />}
          title="السحب أُقفل عن هذا الشهر" subtitle={openDateLabel ? `أُقفل بتاريخ ${openDateLabel}` : "شهر مغلق ونسخة أرشيفية"} />
        <InfoPill iconBg="bg-blue-500" icon={<Calendar className="h-5 w-5 text-white" />}
          title="الشهر المؤرشف" subtitle={monthLabel(archive.period_label)} />
        <InfoPill iconBg="bg-violet-500" icon={<PieChart className="h-5 w-5 text-white" />}
          title="نسبة العمولة وقت الإقفال" subtitle={`${ratePct}% من قيمة الاشتراكات`} />
      </div>

      {/* ============== GROUPS + STUDENT DETAILS ============== */}
      {groupsList.length > 0 && (
        <SectionCard icon={<BookOpen className="h-4 w-4" />} title="تفاصيل المجموعات والطلاب">
          <div className="space-y-2">
            {groupsList.map((g: any, j: number) => (
              <div key={j} className="p-3 rounded-2xl bg-muted/40 border border-border/50">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="font-bold text-sm">{g.group_title || "مجموعة"}</p>
                  <span className="font-bold text-emerald-600 text-sm">{fmtMoney(Number(g.net))} ج</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{g.subject_name} - {formatGrade(g.grade)} {formatStage(g.stage)}</p>
                <CalcRow students={g.students} price={Number(g.price)}
                  pct={Math.round(Number(g.commission_rate ?? archive.commission_rate ?? 0.7) * 100)} net={Number(g.net)} />
                {Array.isArray(g.student_details) && g.student_details.length > 0 && (
                  <div className="mt-3 rounded-xl border border-border/50 bg-background/70 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
                      <p className="text-[11px] font-black flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-primary" /> تفاصيل الطلاب
                      </p>
                      <span className="text-[10px] text-muted-foreground">{g.student_details.length} طالب</span>
                    </div>
                    <div className="divide-y divide-border/40">
                      {g.student_details.map((student: any, idx: number) => (
                        <div key={`${student.student_id || idx}`} className="px-3 py-2 flex items-start justify-between gap-3">
                          <div className="min-w-0 text-right">
                            <p className="text-[11px] font-bold truncate">{student.student_name || "طالب"}</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {student.student_code ? `كود: ${student.student_code}` : "بدون كود"}
                              {student.student_grade ? ` • ${formatGrade(student.student_grade)}` : ""}
                              {student.student_stage ? ` ${formatStage(student.student_stage)}` : ""}
                            </p>
                          </div>
                          <div className="text-left shrink-0">
                            <p className="text-[11px] font-black text-emerald-600">{fmtMoney(Number(student.net))} ج</p>
                            <p className="text-[10px] text-muted-foreground">{student.subscriptions || 1} اشتراك</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ============== WITHDRAWALS ============== */}
      <SectionCard icon={<ArrowDownCircle className="h-4 w-4" />} title="طلبات السحب خلال الشهر">
        {snapWithdrawals.length === 0 ? (
          <EmptyState icon={<ArrowDownCircle className="h-10 w-10" />} title="لا توجد طلبات سحب لهذا الشهر" subtitle="لم يتقدم المعلم بأي طلب سحب في هذا الشهر" />
        ) : (
          <div className="space-y-2">
            {snapWithdrawals.map((w: any) => (
              <div key={w.id} className="p-3 rounded-2xl bg-background border border-border/60 flex items-start justify-between gap-3">
                <div className="min-w-0 text-right">
                  <p className="text-sm font-black">{fmtMoney(Number(w.amount))} ج</p>
                  <p className="text-[11px] text-muted-foreground truncate">{methodLabels[w.payment_method] || w.payment_method} • <span dir="ltr">{w.phone_number}</span></p>
                  {w.admin_message && <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{w.admin_message}</p>}
                  <p className="text-[10px] text-slate-500 mt-1" dir="ltr">{new Date(w.created_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full border bg-muted/60 shrink-0">{withdrawalStatusLabel(w.status)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ============== PAYMENT METHODS ============== */}
      {paymentMethodsSnap.length > 0 && (
        <SectionCard icon={<CreditCard className="h-4 w-4" />} title="طرق الدفع المسجّلة وقت الإقفال">
          <div className="grid grid-cols-1 gap-2">
            {paymentMethodsSnap.map((pm: any) => (
              <div key={pm.id} className="p-3 rounded-2xl bg-muted/40 border border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-2xl bg-gradient-to-br ${methodColors[pm.method_type] || "from-primary to-primary/70"} flex items-center justify-center shadow-md`}>
                    <CreditCard className="h-4 w-4 text-white" />
                  </div>
                  <p className="text-sm font-bold">{methodLabels[pm.method_type] || pm.method_type}</p>
                </div>
                <p className="text-xs text-muted-foreground font-mono" dir="ltr">{pm.phone_number}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ============== TRANSACTIONS ============== */}
      <SectionCard icon={<History className="h-4 w-4" />} title="حركات المحفظة لهذا الشهر">
        {snapTxns.length === 0 ? (
          <EmptyState icon={<History className="h-10 w-10" />} title="لا توجد حركات مرتبطة بهذا الشهر" subtitle="ستظهر حركة نقل الرصيد بعد كل إقفال شهري" />
        ) : (
          <div className="space-y-2">
            {snapTxns.map((tx: any) => {
              const amt = Number(tx.amount);
              const positive = amt >= 0;
              return (
                <div key={tx.id} className={`p-3 rounded-2xl border flex items-start justify-between gap-3 ${positive ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}>
                  <div className="text-right min-w-0">
                    <p className={`font-black text-sm ${positive ? "text-emerald-800" : "text-rose-800"}`}>{walletTransactionLabel(tx.transaction_type)}</p>
                    <p className={`text-[11px] mt-0.5 line-clamp-2 ${positive ? "text-emerald-700" : "text-rose-700"}`}>{tx.description || "حركة مالية"}</p>
                    <p className="text-[10px] text-slate-500 mt-1" dir="ltr">{new Date(tx.created_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</p>
                  </div>
                  <div className="text-left shrink-0">
                    <p className={`font-black ${positive ? "text-emerald-700" : "text-rose-700"}`}>{positive ? "+" : ""}{fmtMoney(amt)} ج</p>
                    {tx.balance_after != null && <p className="text-[10px] text-slate-500">الرصيد: {fmtMoney(Number(tx.balance_after))}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
