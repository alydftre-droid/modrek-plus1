/**
 * AdminTeacherFullDialog
 * --------------------------------------------------------------
 * نافذة المطور الموحدة لإدارة معلم واحد بالكامل.
 * تُفتح من زر العين (Eye) داخل قائمة المعلمين النشطين.
 *
 * تحتوي على تبويبات:
 *  - نظرة عامة (إحصائيات شاملة + معلومات أساسية)
 *  - تعديل البيانات (الاسم/الهاتف/البريد/كلمة السر/السيرة الذاتية - كله مكان واحد)
 *  - الكورسات (قائمة المحتوى + المشاهدات لكل فيديو + متوسط المشاهدة)
 *  - المحفظة (الأرباح، التفاصيل لكل كورس، نسب)
 *  - السحوبات (السجل الكامل بالتواريخ)
 *  - النشاط (سجل كل التحركات)
 *  - الأمان (حظر/فك حظر + حذف نهائي)
 *
 * كل العمليات الحساسة تمر عبر:
 *  - admin-manage-teacher Edge Function (email/password/ban/delete)
 *  - admin_adjust_teacher_wallet RPC
 * مع تحقق `has_role(admin)` على الخادم.
 */
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ArrowRight } from "lucide-react";
import TeacherCommissionCard from "./TeacherCommissionCard";
import {
  GraduationCap,
  Loader2,
  Save,
  Mail,
  Phone,
  Lock,
  User as UserIcon,
  Video,
  FileText,
  Users,
  Wallet,
  Banknote,
  Activity,
  Ban,
  Trash2,
  ShieldAlert,
  Eye,
  TrendingUp,
  Calendar,
  Clock,
  BookOpen,
} from "lucide-react";

interface Props {
  teacherId: string | null;
  onBack: () => void;
  onChanged?: () => void;
}

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_banned: boolean;
  teacher_code: string | null;
  created_at: string | null;
}

interface TeacherProfileRow {
  bio: string | null;
  photo_url: string | null;
  is_approved: boolean | null;
}

interface ContentRow {
  id: string;
  title: string;
  type: string;
  category: string | null;
  grade: string | null;
  stage: string | null;
  created_at: string | null;
  views_count?: number;
  avg_progress?: number;
}

interface WalletRow {
  balance: number;
  total_earned: number;
}

interface TxRow {
  id: string;
  amount: number;
  transaction_type: string;
  description: string | null;
  admin_message: string | null;
  balance_after: number | null;
  created_at: string;
}

interface WithdrawalRow {
  id: string;
  amount: number;
  payment_method: string;
  phone_number: string;
  status: string;
  admin_message: string | null;
  created_at: string;
  processed_at: string | null;
}

interface ActivityRow {
  id: string;
  action_type: string;
  action_label: string;
  page_path: string | null;
  created_at: string;
}

interface CourseEarning {
  group_id: string;
  group_name: string;
  subscribers: number;
  total_revenue: number;
  teacher_share: number;
  active_subscribers: number;
}

const COMMISSION_RATE = 0.7; // 70% للمعلم

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(n) + " ج.م";
const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "-";

export default function AdminTeacherFullDialog({ teacherId, onBack, onChanged }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const storageKey = teacherId ? `admin-teacher-tab-${teacherId}` : "admin-teacher-tab";
  const initialTab =
    searchParams.get("tab") ||
    (typeof window !== "undefined" ? sessionStorage.getItem(storageKey) : null) ||
    "overview";
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    try {
      sessionStorage.setItem(storageKey, val);
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
    const next = new URLSearchParams(searchParams);
    next.set("tab", val);
    setSearchParams(next, { replace: true });
  };

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Core data
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfileRow | null>(null);
  const [wallet, setWallet] = useState<WalletRow | null>(null);

  // Stats
  const [contents, setContents] = useState<ContentRow[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [activeSubsCount, setActiveSubsCount] = useState(0);
  const [totalViews, setTotalViews] = useState(0);
  const [courseEarnings, setCourseEarnings] = useState<CourseEarning[]>([]);

  // History
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);

  // Form state for unified edit
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Wallet adjustment form
  const [adjAmount, setAdjAmount] = useState("");
  const [adjType, setAdjType] = useState<"admin_credit" | "admin_debit" | "admin_bonus">("admin_credit");
  const [adjMessage, setAdjMessage] = useState("");

  // Confirmations
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmBan, setConfirmBan] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!teacherId) return;
    setLoading(true);
    try {
      const [
        profileRes,
        tpRes,
        walletRes,
        contentRes,
        choicesRes,
        groupsRes,
        purchasesRes,
        txRes,
        wdRes,
        actRes,
      ] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, phone, is_banned, teacher_code, created_at").eq("id", teacherId).maybeSingle(),
        supabase.from("teacher_profiles").select("bio, photo_url, is_approved").eq("teacher_id", teacherId).maybeSingle(),
        supabase.from("teacher_wallets").select("balance, total_earned").eq("teacher_id", teacherId).maybeSingle(),
        supabase.from("content").select("id, title, type, category, grade, stage, created_at").eq("uploaded_by", teacherId).eq("is_active", true).order("created_at", { ascending: false }),
        supabase.from("student_teacher_choices").select("student_id").eq("teacher_id", teacherId),
        supabase.from("content_groups").select("id, title, price").eq("teacher_id", teacherId),
        supabase.from("student_group_purchases").select("group_id, amount_paid, created_at").order("created_at", { ascending: false }),
        supabase.from("teacher_wallet_transactions").select("*").eq("teacher_id", teacherId).order("created_at", { ascending: false }).limit(100),
        supabase.from("teacher_withdrawal_requests").select("*").eq("teacher_id", teacherId).order("created_at", { ascending: false }).limit(50),
        supabase.from("teacher_activity_logs").select("id, action_type, action_label, page_path, created_at").eq("teacher_id", teacherId).order("created_at", { ascending: false }).limit(100),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data as ProfileRow);
        setFullName(profileRes.data.full_name || "");
        setPhone(profileRes.data.phone || "");
        setEmail(profileRes.data.email || "");
      }
      setTeacherProfile((tpRes.data as TeacherProfileRow) || null);
      setBio(tpRes.data?.bio || "");
      setWallet((walletRes.data as WalletRow) || { balance: 0, total_earned: 0 });

      const contentList = (contentRes.data || []) as ContentRow[];
      setStudentCount(choicesRes.data?.length || 0);

      // Compute video views via video_progress
      const videoIds = contentList.filter((c) => c.type === "video").map((c) => c.id);
      const viewsMap = new Map<string, { count: number; avgPct: number }>();
      let totalViewsCount = 0;
      if (videoIds.length > 0) {
        const { data: vp } = await supabase
          .from("video_progress")
          .select("content_id, progress_seconds, duration_seconds")
          .in("content_id", videoIds);
        if (vp) {
          const grouped = new Map<string, { count: number; sumPct: number }>();
          vp.forEach((row) => {
            const dur = Number(row.duration_seconds) || 0;
            const prog = Number(row.progress_seconds) || 0;
            const pct = dur > 0 ? Math.min(100, (prog / dur) * 100) : 0;
            const cur = grouped.get(row.content_id) || { count: 0, sumPct: 0 };
            cur.count++;
            cur.sumPct += pct;
            grouped.set(row.content_id, cur);
          });
          grouped.forEach((v, k) => {
            viewsMap.set(k, { count: v.count, avgPct: v.count > 0 ? v.sumPct / v.count : 0 });
            totalViewsCount += v.count;
          });
        }
      }

      const enrichedContents = contentList.map((c) => {
        const v = viewsMap.get(c.id);
        return { ...c, views_count: v?.count || 0, avg_progress: v?.avgPct || 0 };
      });
      setContents(enrichedContents);
      setTotalViews(totalViewsCount);

      // Course earnings per content_group
      const groups = groupsRes.data || [];
      const allPurchases = purchasesRes.data || [];
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const earnings: CourseEarning[] = groups.map((g) => {
        const groupPurchases = allPurchases.filter((p) => p.group_id === g.id);
        const totalRevenue = groupPurchases.reduce((s, p) => s + Number(p.amount_paid || 0), 0);
        const activeSubs = groupPurchases.filter((p) => new Date(p.created_at) >= ninetyDaysAgo).length;
        return {
          group_id: g.id,
            group_name: g.title,
          subscribers: groupPurchases.length,
          total_revenue: totalRevenue,
          teacher_share: totalRevenue * COMMISSION_RATE,
          active_subscribers: activeSubs,
        };
      });
      setCourseEarnings(earnings);
      setActiveSubsCount(earnings.reduce((s, e) => s + e.active_subscribers, 0));

      setTransactions((txRes.data as TxRow[]) || []);
      setWithdrawals((wdRes.data as WithdrawalRow[]) || []);
      setActivities((actRes.data as ActivityRow[]) || []);
    } catch (e) {
      console.error("Error loading teacher full data:", e);
      toast.error("خطأ في تحميل بيانات المعلم");
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    if (teacherId) {
      fetchAll();
    } else {
      setNewPassword("");
      setAdjAmount("");
      setAdjMessage("");
    }
  }, [teacherId, fetchAll]);

  // ---- Unified save (name/phone/email/password/bio in one click) ----
  const handleSaveAll = async () => {
    if (!teacherId || !profile) return;
    setSaving(true);
    try {
      const tasks: Promise<unknown>[] = [];

      // 1. Profile (full_name, phone) via edge function so audit is consistent
      if (fullName.trim() !== profile.full_name || (phone || "") !== (profile.phone || "")) {
        tasks.push(
          supabase.functions.invoke("admin-manage-teacher", {
            body: {
              action: "update_profile",
              teacher_id: teacherId,
              full_name: fullName.trim(),
              phone: phone.trim() || null,
            },
          })
        );
      }

      // 2. Email
      if (email.trim().toLowerCase() !== (profile.email || "").toLowerCase() && email.trim()) {
        tasks.push(
          supabase.functions.invoke("admin-manage-teacher", {
            body: { action: "update_email", teacher_id: teacherId, new_email: email.trim() },
          })
        );
      }

      // 3. Password
      if (newPassword) {
        if (newPassword.length < 6) {
          toast.error("كلمة السر يجب أن تكون 6 أحرف على الأقل");
          setSaving(false);
          return;
        }
        tasks.push(
          supabase.functions.invoke("admin-manage-teacher", {
            body: { action: "update_password", teacher_id: teacherId, new_password: newPassword },
          })
        );
      }

      // 4. Bio (teacher_profiles)
      if ((bio || "") !== (teacherProfile?.bio || "")) {
        tasks.push(
          Promise.resolve(
            supabase
              .from("teacher_profiles")
              .upsert({ teacher_id: teacherId, bio: bio || null }, { onConflict: "teacher_id" })
          )
        );
      }

      if (tasks.length === 0) {
        toast.info("لا توجد تغييرات للحفظ");
        setSaving(false);
        return;
      }

      const results = await Promise.all(tasks);
      const firstErr = results.find((r: any) => r?.error);
      if (firstErr) {
        const msg = (firstErr as any).error?.message || "خطأ غير متوقع";
        throw new Error(msg);
      }

      toast.success("تم حفظ جميع التعديلات بنجاح");
      setNewPassword("");
      onChanged?.();
      await fetchAll();
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message || "خطأ في الحفظ");
    } finally {
      setSaving(false);
    }
  };

  // ---- Wallet adjustment ----
  const handleWalletAdjust = async () => {
    if (!teacherId) return;
    const amt = parseFloat(adjAmount);
    if (!amt || amt <= 0) {
      toast.error("أدخل مبلغاً صحيحاً");
      return;
    }
    setSaving(true);
    try {
      const signedAmount = adjType === "admin_debit" ? -Math.abs(amt) : Math.abs(amt);
      const { data, error } = await supabase.rpc("admin_adjust_teacher_wallet", {
        _teacher_id: teacherId,
        _amount: signedAmount,
        _transaction_type: adjType,
        _description:
          adjType === "admin_bonus"
            ? "مكافأة من الإدارة"
            : adjType === "admin_credit"
            ? "إضافة رصيد من الإدارة"
            : "خصم من الإدارة",
        _admin_message: adjMessage || null,
      });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string };
      if (!res?.success) throw new Error(res?.error || "فشلت العملية");
      toast.success("تم تعديل المحفظة");
      setAdjAmount("");
      setAdjMessage("");
      onChanged?.();
      await fetchAll();
    } catch (e) {
      toast.error((e as Error).message || "خطأ في تعديل المحفظة");
    } finally {
      setSaving(false);
    }
  };

  // ---- Ban / Unban ----
  const handleToggleBan = async () => {
    if (!teacherId || !profile) return;
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("admin-manage-teacher", {
        body: { action: profile.is_banned ? "unban_teacher" : "ban_teacher", teacher_id: teacherId },
      });
      if (error) throw error;
      toast.success(profile.is_banned ? "تم فك الحظر" : "تم حظر المعلم");
      setConfirmBan(false);
      onChanged?.();
      await fetchAll();
    } catch (e) {
      toast.error((e as Error).message || "خطأ");
    } finally {
      setSaving(false);
    }
  };

  // ---- Delete teacher permanently ----
  const handleDelete = async () => {
    if (!teacherId) return;
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("admin-manage-teacher", {
        body: { action: "delete_teacher", teacher_id: teacherId },
      });
      if (error) throw error;
      toast.success("تم حذف المعلم نهائياً");
      setConfirmDelete(false);
      onChanged?.();
      onBack();
    } catch (e) {
      toast.error((e as Error).message || "خطأ في الحذف");
    } finally {
      setSaving(false);
    }
  };

  if (!teacherId) return null;

  return (
    <>
      <div className="tm-root min-h-screen pb-12" dir="rtl">
        <div className="tm-container pt-4">
          <button onClick={onBack} className="tm-back-btn">
            <ArrowRight className="h-4 w-4" /> رجوع
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : !profile ? (
          <div className="p-8 text-center text-muted-foreground">لم يتم العثور على المعلم</div>
        ) : (
          <div className="tm-container py-4 space-y-5">
            {/* CV Header — same shape as student page */}
            <div className="tm-profile-shell">
              <div className="tm-profile-banner" />
              <div className="tm-profile-body">
                <div className="tm-profile-avatar">
                  {teacherProfile?.photo_url ? (
                    <img src={teacherProfile.photo_url} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <GraduationCap className="h-10 w-10" />
                  )}
                </div>
                <h2 className="tm-profile-name">{profile.full_name}</h2>
                <p className="tm-profile-subtitle">معلم في المنصة</p>
                <div className="tm-profile-meta">
                  {profile.teacher_code && (
                    <span className="tm-chip tm-chip--blue"># {profile.teacher_code}</span>
                  )}
                  <span className={`tm-chip ${profile.is_banned ? "tm-chip--red" : "tm-chip--green"}`}>
                    {profile.is_banned ? "محظور" : "نشط"}
                  </span>
                  <span className="tm-chip tm-chip--mint">
                    <Calendar className="h-3 w-3" /> منذ {formatDate(profile.created_at).split("،")[0]}
                  </span>
                </div>
                <div className="tm-profile-contact">
                  <span><Mail className="h-3.5 w-3.5" /> {profile.email}</span>
                  {profile.phone && <span><Phone className="h-3.5 w-3.5" /> {profile.phone}</span>}
                </div>
                <div className="tm-profile-actions">
                  <button onClick={() => handleTabChange("edit")} className="tm-action-btn tm-action-btn--blue">
                    <UserIcon className="h-4 w-4" /> تعديل البيانات
                  </button>
                  <button onClick={() => handleTabChange("courses")} className="tm-action-btn tm-action-btn--purple">
                    <BookOpen className="h-4 w-4" /> الكورسات
                  </button>
                  <button
                    onClick={() => setConfirmBan(true)}
                    disabled={saving}
                    className={`tm-action-btn tm-action-btn--center ${profile.is_banned ? "tm-action-btn--green" : "tm-action-btn--red"}`}
                  >
                    <Ban className="h-4 w-4" /> {profile.is_banned ? "فك الحظر" : "حظر المعلم"}
                  </button>
                </div>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full" dir="rtl">
              <TabsList className="tm-tabs-list">
                <TabsTrigger value="overview" className="tm-tab">نظرة عامة</TabsTrigger>
                <TabsTrigger value="edit" className="tm-tab">تعديل البيانات</TabsTrigger>
                <TabsTrigger value="courses" className="tm-tab">الكورسات</TabsTrigger>
                <TabsTrigger value="wallet" className="tm-tab">المحفظة</TabsTrigger>
                <TabsTrigger value="withdrawals" className="tm-tab">السحوبات</TabsTrigger>
                <TabsTrigger value="activity" className="tm-tab">السجلات</TabsTrigger>
                <TabsTrigger value="danger" className="tm-tab">الأمان</TabsTrigger>
              </TabsList>

                  {/* ============ OVERVIEW ============ */}
                  <TabsContent value="overview" className="space-y-3 mt-4">
                    <div className="tm-stats-grid">
                      <StatCard icon={<Users className="h-4 w-4" />} label="إجمالي الطلاب" value={studentCount.toString()} color="blue" />
                      <StatCard icon={<TrendingUp className="h-4 w-4" />} label="مشتركين فعّالين" value={activeSubsCount.toString()} color="green" />
                      <StatCard icon={<Video className="h-4 w-4" />} label="إجمالي المشاهدات" value={totalViews.toString()} color="red" />
                      <StatCard icon={<FileText className="h-4 w-4" />} label="عدد الكورسات" value={courseEarnings.length.toString()} color="amber" />
                    </div>
                    <div className="tm-stats-grid">
                      <StatCard icon={<Video className="h-4 w-4" />} label="فيديوهات" value={contents.filter((c) => c.type === "video").length.toString()} color="purple" />
                      <StatCard icon={<FileText className="h-4 w-4" />} label="ملفات PDF" value={contents.filter((c) => c.type !== "video").length.toString()} color="orange" />
                    </div>

                    <Card className="tm-panel">
                      <CardContent className="tm-panel-content">
                        <h4 className="tm-section-title">
                          <Wallet className="h-4 w-4" /> ملخص المحفظة
                        </h4>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="tm-wallet-mini tm-wallet-mini--green">
                            <p>الرصيد الحالي</p>
                            <strong>{formatCurrency(wallet?.balance || 0)}</strong>
                          </div>
                          <div className="tm-wallet-mini tm-wallet-mini--blue">
                            <p>إجمالي الأرباح</p>
                            <strong>{formatCurrency(wallet?.total_earned || 0)}</strong>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    
                  </TabsContent>

                  {/* ============ UNIFIED EDIT ============ */}
                  <TabsContent value="edit" className="space-y-4 mt-4">
                    <Card className="tm-panel">
                      <CardContent className="tm-panel-content tm-form-panel">
                        <h4 className="tm-section-title">
                          <UserIcon className="h-4 w-4" /> البيانات الأساسية
                        </h4>
                        <div className="space-y-3">
                          <div>
                            <Label className="tm-label">الاسم الكامل</Label>
                            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="tm-input mt-1" />
                          </div>
                          <div>
                            <Label className="tm-label flex items-center gap-1"><Phone className="h-3 w-3" /> الهاتف</Label>
                            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="tm-input mt-1" dir="ltr" />
                          </div>
                          <div>
                            <Label className="tm-label flex items-center gap-1"><Mail className="h-3 w-3" /> البريد الإلكتروني</Label>
                            <Input value={email} onChange={(e) => setEmail(e.target.value)} className="tm-input mt-1" dir="ltr" type="email" />
                          </div>
                        </div>

                        <Separator />

                        <h4 className="tm-section-title">
                          <Lock className="h-4 w-4" /> كلمة السر
                        </h4>
                        <div>
                          <Label className="tm-label">كلمة سر جديدة (اتركها فارغة لعدم التغيير)</Label>
                          <Input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="••••••••"
                            className="tm-input mt-1"
                            dir="ltr"
                          />
                        </div>

                        <Separator />

                        <h4 className="tm-section-title">
                          <FileText className="h-4 w-4" /> السيرة الذاتية
                        </h4>
                        <Textarea
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          rows={4}
                          placeholder="نبذة عن المعلم تظهر للطلاب..."
                          className="tm-textarea"
                        />

                        <Button onClick={handleSaveAll} disabled={saving} className="tm-submit-btn w-full gap-2">
                          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                          <Save className="h-4 w-4" />
                          حفظ جميع التغييرات
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ============ COURSES ============ */}
                  <TabsContent value="courses" className="space-y-3 mt-4">
                    {courseEarnings.length > 0 && (
                      <Card className="tm-panel">
                        <CardContent className="tm-panel-content">
                          <h4 className="tm-section-title">المجموعات الدراسية</h4>
                          <div className="space-y-2">
                            {courseEarnings.map((c) => (
                              <div key={c.group_id} className="tm-list-box space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-semibold text-sm">{c.group_name}</p>
                                  <Badge variant="secondary">{c.subscribers} مشترك</Badge>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                  <div>
                                    <span className="text-muted-foreground">الإيرادات:</span>{" "}
                                    <span className="font-semibold">{formatCurrency(c.total_revenue)}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">حصة المعلم (70%):</span>{" "}
                                    <span className="font-semibold text-green-600">{formatCurrency(c.teacher_share)}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">نشط:</span>{" "}
                                    <span className="font-semibold">{c.active_subscribers}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <Card className="tm-panel">
                      <CardContent className="tm-panel-content">
                        <h4 className="tm-section-title">المحتوى ({contents.length})</h4>
                        {contents.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">لا يوجد محتوى</p>
                        ) : (
                          <div className="space-y-2">
                            {contents.map((c) => (
                              <div key={c.id} className="tm-list-box flex items-center gap-3">
                                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${c.type === "video" ? "bg-red-500/10" : "bg-orange-500/10"}`}>
                                  {c.type === "video" ? (
                                    <Video className="h-5 w-5 text-red-600" />
                                  ) : (
                                    <FileText className="h-5 w-5 text-orange-600" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{c.title}</p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                    {c.grade && <span>{c.grade}</span>}
                                    {c.category && <span>• {c.category}</span>}
                                  </div>
                                </div>
                                {c.type === "video" && (
                                  <div className="text-left text-xs shrink-0">
                                    <div className="flex items-center gap-1 text-muted-foreground">
                                      <Eye className="h-3 w-3" />
                                      <span className="font-semibold">{c.views_count || 0}</span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                      متوسط {(c.avg_progress || 0).toFixed(0)}%
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ============ WALLET ============ */}
                  <TabsContent value="wallet" className="space-y-3 mt-4">
                    <div className="grid grid-cols-2 gap-3">
                      <Card className="tm-balance-card"><CardContent className="p-4">
                        <p>الرصيد</p>
                        <strong className="tm-money-green">{formatCurrency(wallet?.balance || 0)}</strong>
                      </CardContent></Card>
                      <Card className="tm-balance-card"><CardContent className="p-4">
                        <p>إجمالي الأرباح</p>
                        <strong className="tm-money-blue">{formatCurrency(wallet?.total_earned || 0)}</strong>
                      </CardContent></Card>
                    </div>

                    {teacherId && <TeacherCommissionCard teacherId={teacherId} />}

                    <Card className="tm-panel">
                      <CardContent className="tm-panel-content space-y-3">
                        <h4 className="tm-section-title">تعديل الرصيد</h4>
                        <div className="tm-wallet-actions">
                          <Button type="button" size="sm" onClick={() => setAdjType("admin_credit")} className={adjType === "admin_credit" ? "tm-segment tm-segment--active" : "tm-segment"}>إضافة</Button>
                          <Button type="button" size="sm" onClick={() => setAdjType("admin_debit")} className={adjType === "admin_debit" ? "tm-segment tm-segment--active" : "tm-segment"}>خصم</Button>
                          <Button type="button" size="sm" onClick={() => setAdjType("admin_bonus")} className={adjType === "admin_bonus" ? "tm-segment tm-segment--active" : "tm-segment"}>مكافأة</Button>
                        </div>
                        <Input
                          type="number"
                          placeholder="المبلغ"
                          value={adjAmount}
                          onChange={(e) => setAdjAmount(e.target.value)}
                          className="tm-input"
                        />
                        <Textarea
                          placeholder="رسالة للمعلم (اختياري)"
                          value={adjMessage}
                          onChange={(e) => setAdjMessage(e.target.value)}
                          rows={2}
                          className="tm-textarea"
                        />
                        <Button onClick={handleWalletAdjust} disabled={saving} className="tm-submit-btn w-full gap-2">
                          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                          تنفيذ
                        </Button>
                      </CardContent>
                    </Card>

                    <Card className="tm-panel">
                      <CardContent className="tm-panel-content">
                        <h4 className="tm-section-title">سجل المعاملات</h4>
                        {transactions.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">لا توجد معاملات</p>
                        ) : (
                          <div className="space-y-2">
                            {transactions.map((tx) => (
                              <div key={tx.id} className="tm-list-box text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold">
                                    {tx.description || tx.transaction_type}
                                  </span>
                                  <span className={`font-bold ${tx.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                                    {tx.amount >= 0 ? "+" : ""}{formatCurrency(tx.amount)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between mt-1 text-muted-foreground">
                                  <span>{formatDate(tx.created_at)}</span>
                                  {tx.balance_after !== null && (
                                    <span>الرصيد: {formatCurrency(tx.balance_after)}</span>
                                  )}
                                </div>
                                {tx.admin_message && (
                                  <p className="mt-1 text-[10px] italic">{tx.admin_message}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ============ WITHDRAWALS ============ */}
                  <TabsContent value="withdrawals" className="space-y-2 mt-4">
                    <Card className="tm-panel">
                      <CardContent className="tm-panel-content">
                        <h4 className="tm-section-title">سجل السحوبات</h4>
                        {withdrawals.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">لا توجد سحوبات</p>
                        ) : (
                          <div className="space-y-2">
                            {withdrawals.map((w) => (
                              <div key={w.id} className="tm-withdrawal-card text-xs space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-sm">{formatCurrency(w.amount)}</span>
                                  <Badge variant={w.status === "approved" ? "default" : w.status === "rejected" ? "destructive" : "secondary"}>
                                    {w.status === "approved" ? "موافق عليها" : w.status === "rejected" ? "مرفوضة" : w.status === "pending" ? "قيد الانتظار" : w.status}
                                  </Badge>
                                </div>
                                <div className="text-muted-foreground space-y-0.5">
                                  <p>{w.payment_method} — {w.phone_number}</p>
                                  <p>طُلبت: {formatDate(w.created_at)}</p>
                                  {w.processed_at && <p>تمت المعالجة: {formatDate(w.processed_at)}</p>}
                                  {w.admin_message && <p className="italic">{w.admin_message}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ============ ACTIVITY LOG ============ */}
                  <TabsContent value="activity" className="space-y-2 mt-4">
                    <Card className="tm-panel">
                      <CardContent className="tm-panel-content">
                        <h4 className="tm-section-title">سجل نشاط المعلم</h4>
                        {activities.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">لا يوجد نشاط مسجل بعد</p>
                        ) : (
                          <div className="space-y-1.5">
                            {activities.map((a) => (
                              <div key={a.id} className="tm-activity-row flex items-start gap-2 pr-3 py-1">
                                <Clock className="h-3 w-3 text-muted-foreground mt-1 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium">{a.action_label}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {formatDate(a.created_at)} {a.page_path ? `• ${a.page_path}` : ""}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ============ DANGER ZONE ============ */}
                  <TabsContent value="danger" className="space-y-3 mt-4">
                    <Card className="tm-danger-panel">
                      <CardContent className="tm-panel-content space-y-3">
                        <h4 className="tm-danger-title">
                          <ShieldAlert className="h-4 w-4" /> منطقة الإجراءات الخطرة
                        </h4>

                        <div className="tm-danger-box space-y-2">
                          <div>
                            <p className="font-semibold text-sm">{profile.is_banned ? "فك حظر المعلم" : "حظر المعلم"}</p>
                            <p className="text-xs text-muted-foreground">
                              {profile.is_banned
                                ? "سيتمكن المعلم من تسجيل الدخول واستخدام المنصة مجدداً"
                                : "سيتم منع المعلم من تسجيل الدخول واستخدام المنصة"}
                            </p>
                          </div>
                          <Button
                            variant={profile.is_banned ? "outline" : "destructive"}
                            size="sm"
                            className="tm-danger-btn w-full gap-2"
                            onClick={() => setConfirmBan(true)}
                          >
                            <Ban className="h-4 w-4" />
                            {profile.is_banned ? "فك الحظر" : "حظر المعلم"}
                          </Button>
                        </div>

                        <div className="tm-danger-box tm-danger-box--soft space-y-2">
                          <div>
                            <p className="font-semibold text-sm text-destructive">حذف المعلم نهائياً</p>
                            <p className="text-xs text-muted-foreground">
                              سيتم حذف الحساب وكل المحتوى المرفوع والمحفظة والسجلات. هذا الإجراء لا يمكن التراجع عنه.
                            </p>
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="tm-danger-btn w-full gap-2"
                            onClick={() => setConfirmDelete(true)}
                          >
                            <Trash2 className="h-4 w-4" />
                            حذف المعلم نهائياً
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
          )}
      </div>

      {/* Confirm Ban */}
      <AlertDialog open={confirmBan} onOpenChange={setConfirmBan}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{profile?.is_banned ? "تأكيد فك الحظر" : "تأكيد حظر المعلم"}</AlertDialogTitle>
            <AlertDialogDescription>
              {profile?.is_banned
                ? "سيتمكن المعلم من الدخول والاستخدام مرة أخرى."
                : "لن يتمكن المعلم من الدخول للمنصة بعد التأكيد."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleBan} disabled={saving}>تأكيد</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Delete */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">تأكيد الحذف النهائي</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف حساب المعلم وجميع المحتوى والمحفظة والسجلات. هذا الإجراء نهائي ولا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={saving} className="bg-destructive hover:bg-destructive/90">
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <Card className="tm-stat-card" data-tone={color}>
      <CardContent className="tm-stat-content">
        <div className="tm-stat-icon">
          {icon}
        </div>
        <p className="tm-stat-label">{label}</p>
        <p className="tm-stat-value">{value}</p>
      </CardContent>
    </Card>
  );
}
