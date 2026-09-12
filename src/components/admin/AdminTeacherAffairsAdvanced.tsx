/**
 * AdminTeacherAffairsAdvanced
 * ---------------------------------------------------------------
 * Developer-only teacher hub. Mirrors the look & feel of
 * AdminStudentManagement (sm-* CSS classes from index.css):
 *   home → search results → CV detail with tabs.
 *
 * All write actions (edit profile, password reset, ban, wallet
 * adjustment) require admin role and are enforced server-side via
 * the `admin-manage-teacher` edge function and the
 * `admin_adjust_teacher_wallet` RPC. No client-side bypass possible.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import StoredImage from "@/components/common/StoredImage";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, Ban, BookOpen, ChevronRight, CheckCircle2, Clock3, CreditCard,
  Edit3, Eye, FileText, GraduationCap, Hash, Loader2, Lock, Mail, Phone,
  Search, Shield, User, Users, Video, Wallet, XCircle, Calendar, Plus, Minus,
  KeyRound, Trash2,
} from "lucide-react";

/* ---------- types ---------- */
interface TeacherProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  teacher_code: string | null;
  avatar_url: string | null;
  is_banned: boolean | null;
  created_at: string | null;
  bio?: string | null;
  assigned_category?: string | null;
}

interface WalletTx {
  id: string;
  amount: number;
  transaction_type: string;
  description: string | null;
  admin_message: string | null;
  balance_after: number;
  created_at: string;
}

interface ActivityLog {
  id: string;
  action: string;
  details: any;
  created_at: string;
}

const fadeInitial = { opacity: 0, y: 16 };
const fadeAnimate = { opacity: 1, y: 0, transition: { duration: 0.35 } };

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" }) : "-";
const fmtDateTime = (d: string | null) =>
  d ? new Date(d).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : "-";
const fmtMoney = (n: number) => `${(n || 0).toLocaleString("ar-EG")} ج`;

/* ═══════════════════════════════════════════════════════════ */
/*  ROOT                                                        */
/* ═══════════════════════════════════════════════════════════ */
type ViewMode = "home" | "detail";

export default function AdminTeacherAffairsAdvanced() {
  const [view, setView] = useState<ViewMode>("home");
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);

  return (
    <div className="sm-root" dir="rtl">
      {view !== "home" && (
        <button onClick={() => setView("home")} className="sm-back-btn">
          <ChevronRight className="h-4 w-4" /> رجوع
        </button>
      )}
      <AnimatePresence mode="wait">
        {view === "home" && (
          <motion.div key="home" initial={fadeInitial} animate={fadeAnimate}>
            <HomeView onTeacher={(t) => { setTeacher(t); setView("detail"); }} />
          </motion.div>
        )}
        {view === "detail" && teacher && (
          <motion.div key="detail" initial={fadeInitial} animate={fadeAnimate}>
            <DetailView teacher={teacher} onUpdate={setTeacher} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  HOME — search + stats (mirrors StudentManagement HomeView)  */
/* ═══════════════════════════════════════════════════════════ */
const HomeView = ({ onTeacher }: { onTeacher: (t: TeacherProfile) => void }) => {
  const [search, setSearch] = useState("");
  const [allTeachers, setAllTeachers] = useState<TeacherProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, banned: 0, recent: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Get all teacher user_ids
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "teacher");
      const ids = (roles || []).map((r) => r.user_id);
      if (ids.length === 0) {
        setAllTeachers([]);
        setStats({ total: 0, active: 0, banned: 0, recent: 0 });
        setLoading(false);
        return;
      }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, teacher_code, avatar_url, is_banned, created_at")
        .in("id", ids)
        .order("created_at", { ascending: false });
      const list = (profiles || []) as TeacherProfile[];
      setAllTeachers(list);
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      setStats({
        total: list.length,
        active: list.filter((t) => !t.is_banned).length,
        banned: list.filter((t) => t.is_banned).length,
        recent: list.filter((t) => t.created_at && new Date(t.created_at).getTime() >= cutoff).length,
      });
    } catch (e) {
      console.error(e);
      toast.error("تعذر تحميل قائمة المعلمين");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allTeachers.slice(0, 20);
    return allTeachers.filter((t) =>
      (t.full_name || "").toLowerCase().includes(q) ||
      (t.email || "").toLowerCase().includes(q) ||
      (t.phone || "").includes(q) ||
      (t.teacher_code || "").toLowerCase().includes(q)
    );
  }, [search, allTeachers]);

  return (
    <div className="space-y-6">
      {/* Header banner — same shape as student banner */}
      <div className="sm-header-banner">
        <div className="sm-header-content">
          <h1 className="sm-header-title">شؤون المعلمين</h1>
          <p className="sm-header-subtitle">إدارة وتحليل بيانات المعلمين على المنصة</p>
        </div>
        <div className="sm-header-stats">
          <div className="sm-stat-pill sm-stat-pill--blue">
            <GraduationCap className="h-5 w-5" />
            <div><strong>{stats.total}</strong><span>إجمالي المعلمين</span></div>
          </div>
          <div className="sm-stat-pill sm-stat-pill--green">
            <CheckCircle2 className="h-5 w-5" />
            <div><strong>{stats.active}</strong><span>نشطون</span></div>
          </div>
          <div className="sm-stat-pill sm-stat-pill--purple">
            <Clock3 className="h-5 w-5" />
            <div><strong>{stats.recent}</strong><span>حديثو الانضمام</span></div>
          </div>
        </div>
      </div>

      {/* Search bar — identical style */}
      <div className="sm-search-bar">
        <Search className="sm-search-icon" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم، البريد، الهاتف، أو كود المعلم..."
          className="sm-search-input"
        />
      </div>

      <div className="space-y-3">
        <h2 className="sm-section-title">{search.trim() ? "نتائج البحث" : "قائمة المعلمين"}</h2>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : results.length === 0 ? (
          <div className="sm-empty">
            <Users className="h-10 w-10 mx-auto opacity-40" />
            <p className="font-bold mt-2">لا يوجد معلمون مطابقون</p>
            <p className="text-sm opacity-70">جرب البحث باسم آخر أو ببريد إلكتروني</p>
          </div>
        ) : (
          <div className="sm-results-grid">
            {results.map((t) => <TeacherCard key={t.id} teacher={t} onOpen={() => onTeacher(t)} />)}
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------- Card (student-style row) ---------- */
const TeacherCard = ({ teacher, onOpen }: { teacher: TeacherProfile; onOpen: () => void }) => (
  <button onClick={onOpen} className="sm-student-card">
    <div className="sm-student-avatar">
      {teacher.avatar_url ? (
        <StoredImage source={teacher.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <GraduationCap className="h-6 w-6 text-white" />
      )}
    </div>
    <div className="sm-student-info">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="sm-student-name">{teacher.full_name}</h3>
        {teacher.is_banned && <span className="sm-badge sm-badge--red">محظور</span>}
        {teacher.teacher_code && <span className="sm-badge sm-badge--blue">{teacher.teacher_code}</span>}
      </div>
      <p className="sm-student-email">{teacher.email}</p>
      <div className="sm-student-meta">
        <span><Calendar className="h-3 w-3 inline" /> {fmtDate(teacher.created_at)}</span>
      </div>
    </div>
    <div className="sm-student-arrow">
      <Eye className="h-5 w-5" />
    </div>
  </button>
);

/* ═══════════════════════════════════════════════════════════ */
/*  DETAIL — student-style CV with full teacher info            */
/* ═══════════════════════════════════════════════════════════ */
const DetailView = ({ teacher, onUpdate }: { teacher: TeacherProfile; onUpdate: (t: TeacherProfile) => void }) => {
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  // Data
  const [walletBalance, setWalletBalance] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [walletTxs, setWalletTxs] = useState<WalletTx[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [contentCount, setContentCount] = useState({ videos: 0, pdfs: 0 });
  const [groups, setGroups] = useState<any[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [activities, setActivities] = useState<ActivityLog[]>([]);

  // Dialogs
  const [editOpen, setEditOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [banLoading, setBanLoading] = useState(false);

  // Edit form
  const [editName, setEditName] = useState(teacher.full_name);
  const [editPhone, setEditPhone] = useState(teacher.phone || "");
  const [editLoading, setEditLoading] = useState(false);

  // Password
  const [newPw, setNewPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  // Email
  const [newEmail, setNewEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  // Wallet
  const [walletAmount, setWalletAmount] = useState("");
  const [walletType, setWalletType] = useState<"add" | "subtract" | "bonus">("add");
  const [walletNote, setWalletNote] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [walletRes, txsRes, wdRes, contentRes, groupsRes, studentsRes, actsRes] = await Promise.all([
        supabase.from("teacher_wallets").select("balance, total_earned").eq("teacher_id", teacher.id).maybeSingle(),
        supabase.from("teacher_wallet_transactions").select("*").eq("teacher_id", teacher.id).order("created_at", { ascending: false }).limit(100),
        supabase.from("teacher_withdrawal_requests").select("*").eq("teacher_id", teacher.id).order("created_at", { ascending: false }),
        supabase.from("content").select("type").eq("uploaded_by", teacher.id).eq("is_active", true),
        supabase.from("content_groups").select("id, title, price, is_active, created_at").eq("teacher_id", teacher.id).order("created_at", { ascending: false }),
        supabase.from("student_teacher_choices").select("student_id", { count: "exact", head: true }).eq("teacher_id", teacher.id),
        supabase.from("teacher_activity_logs" as any).select("*").eq("teacher_id", teacher.id).order("created_at", { ascending: false }).limit(50),
      ]);

      setWalletBalance(Number(walletRes.data?.balance || 0));
      setTotalEarned(Number(walletRes.data?.total_earned || 0));
      setWalletTxs((txsRes.data || []) as WalletTx[]);
      setWithdrawals(wdRes.data || []);
      const cs = contentRes.data || [];
      setContentCount({
        videos: cs.filter((c: any) => c.type === "video").length,
        pdfs: cs.filter((c: any) => c.type !== "video").length,
      });
      setGroups(groupsRes.data || []);
      setStudentCount((studentsRes as any).count || 0);
      setActivities(((actsRes.data as any) || []) as ActivityLog[]);
    } catch (e) {
      console.error(e);
      toast.error("تعذر تحميل ملف المعلم");
    } finally {
      setLoading(false);
    }
  }, [teacher.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ---------- Actions (admin-only via edge function / RPC) ---------- */
  const callEdge = async (action: string, payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("admin-manage-teacher", {
      body: { action, teacher_id: teacher.id, ...payload },
    });
    if (error) throw new Error(error.message || "خطأ في الخادم");
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  };

  const saveProfile = async () => {
    setEditLoading(true);
    try {
      await callEdge("update_profile", { full_name: editName, phone: editPhone });
      onUpdate({ ...teacher, full_name: editName, phone: editPhone });
      toast.success("تم حفظ التعديلات");
      setEditOpen(false);
    } catch (e) { toast.error((e as Error).message); } finally { setEditLoading(false); }
  };

  const resetPassword = async () => {
    if (newPw.length < 6) { toast.error("كلمة السر يجب أن تكون 6 أحرف على الأقل"); return; }
    setPwLoading(true);
    try {
      await callEdge("update_password", { new_password: newPw });
      toast.success("تم تغيير كلمة السر بنجاح");
      setNewPw(""); setPwOpen(false);
    } catch (e) { toast.error((e as Error).message); } finally { setPwLoading(false); }
  };

  const updateEmail = async () => {
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(newEmail)) { toast.error("بريد غير صالح"); return; }
    setEmailLoading(true);
    try {
      await callEdge("update_email", { new_email: newEmail });
      onUpdate({ ...teacher, email: newEmail });
      toast.success("تم تحديث البريد الإلكتروني");
      setNewEmail(""); setEmailOpen(false);
    } catch (e) { toast.error((e as Error).message); } finally { setEmailLoading(false); }
  };

  const toggleBan = async () => {
    setBanLoading(true);
    try {
      const action = teacher.is_banned ? "unban_teacher" : "ban_teacher";
      await callEdge(action, {});
      onUpdate({ ...teacher, is_banned: !teacher.is_banned });
      toast.success(teacher.is_banned ? "تم فك حظر المعلم" : "تم حظر المعلم");
    } catch (e) { toast.error((e as Error).message); } finally { setBanLoading(false); }
  };

  const adjustWallet = async () => {
    const amt = parseFloat(walletAmount);
    if (!amt || amt <= 0) { toast.error("ادخل مبلغ صحيح"); return; }
    setWalletLoading(true);
    try {
      const signed = walletType === "subtract" ? -amt : amt;
      const txType = walletType === "bonus" ? "admin_bonus" : walletType === "add" ? "admin_credit" : "admin_debit";
      const { data, error } = await supabase.rpc("admin_adjust_teacher_wallet", {
        _teacher_id: teacher.id,
        _amount: signed,
        _transaction_type: txType,
        _description: walletNote || null,
        _admin_message: walletNote || null,
      });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error((data as any)?.error || "فشل");
      toast.success("تمت العملية بنجاح");
      setWalletAmount(""); setWalletNote(""); setWalletOpen(false);
      loadAll();
    } catch (e) { toast.error((e as Error).message); } finally { setWalletLoading(false); }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-52 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* CV Header — same shape as student */}
      <div className="sm-cv-shell">
        <div className="sm-cv-banner" />
        <div className="sm-cv-body">
          <div className="sm-cv-avatar">
            {teacher.avatar_url ? (
              <StoredImage source={teacher.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              <GraduationCap className="h-10 w-10 text-white" />
            )}
          </div>
          <h2 className="sm-cv-name">{teacher.full_name}</h2>
          <p className="sm-cv-subtitle">معلم على المنصة</p>
          <div className="sm-cv-meta">
            <span className="sm-badge sm-badge--blue"><Hash className="h-3 w-3" /> {teacher.teacher_code || teacher.id.slice(0, 8)}</span>
            <span className={`sm-badge ${teacher.is_banned ? "sm-badge--red" : "sm-badge--green"}`}>{teacher.is_banned ? "محظور" : "نشط"}</span>
            <span className="sm-badge sm-badge--gray"><Calendar className="h-3 w-3" /> {fmtDate(teacher.created_at)}</span>
          </div>
          <div className="sm-cv-contact">
            <span><Mail className="h-3.5 w-3.5" /> {teacher.email}</span>
            {teacher.phone && <span><Phone className="h-3.5 w-3.5" /> {teacher.phone}</span>}
          </div>
          <div className="sm-cv-actions">
            <Button onClick={() => { setEditName(teacher.full_name); setEditPhone(teacher.phone || ""); setEditOpen(true); }} className="sm-action-btn sm-action-btn--blue">
              <Edit3 className="h-4 w-4" /> تعديل البيانات
            </Button>
            <Button onClick={() => setPwOpen(true)} className="sm-action-btn sm-action-btn--purple">
              <KeyRound className="h-4 w-4" /> تغيير كلمة السر
            </Button>
            <Button onClick={toggleBan} disabled={banLoading} className={`sm-action-btn ${teacher.is_banned ? "sm-action-btn--green" : "sm-action-btn--red"}`}>
              {banLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              {teacher.is_banned ? "فك الحظر" : "حظر المعلم"}
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs — same set of names as student */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="sm-tabs-list">
          <TabsTrigger value="overview" className="sm-tab">نظرة عامة</TabsTrigger>
          <TabsTrigger value="courses" className="sm-tab">الكورسات</TabsTrigger>
          <TabsTrigger value="wallet" className="sm-tab">المحفظة</TabsTrigger>
          <TabsTrigger value="withdrawals" className="sm-tab">السحوبات</TabsTrigger>
          <TabsTrigger value="security" className="sm-tab">الأمن</TabsTrigger>
          <TabsTrigger value="activity" className="sm-tab">السجلات</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="sm-tab-content">
          <div className="sm-overview-grid">
            <div className="sm-overview-card">
              <h3 className="sm-ov-title">المحفظة المالية</h3>
              <div className="sm-ov-wallet">
                <div><span className="sm-dot sm-dot--green" /> الرصيد الحالي: <strong className="sm-text-primary">{fmtMoney(walletBalance)}</strong></div>
                <div><span className="sm-dot sm-dot--blue" /> إجمالي الأرباح: <strong>{fmtMoney(totalEarned)}</strong></div>
              </div>
            </div>
            <div className="sm-overview-card">
              <h3 className="sm-ov-title">المحتوى المرفوع</h3>
              <div className="sm-ov-list">
                <div className="sm-ov-item"><Video className="h-4 w-4 sm-text-primary" /> فيديوهات: <strong>{contentCount.videos}</strong></div>
                <div className="sm-ov-item"><FileText className="h-4 w-4 sm-text-purple" /> ملفات: <strong>{contentCount.pdfs}</strong></div>
                <div className="sm-ov-item"><BookOpen className="h-4 w-4 sm-text-success" /> كورسات: <strong>{groups.length}</strong></div>
              </div>
            </div>
            <div className="sm-overview-card">
              <h3 className="sm-ov-title">الطلاب</h3>
              <div className="sm-ov-list">
                <div className="sm-ov-item"><Users className="h-4 w-4 sm-text-primary" /> الطلاب الذين اختاروا المعلم: <strong>{studentCount}</strong></div>
              </div>
            </div>
            <div className="sm-overview-card">
              <h3 className="sm-ov-title">السحوبات</h3>
              <div className="sm-ov-list">
                <div className="sm-ov-item"><CreditCard className="h-4 w-4 sm-text-success" /> طلبات: <strong>{withdrawals.length}</strong></div>
                <div className="sm-ov-item"><CheckCircle2 className="h-4 w-4 sm-text-success" /> منجزة: <strong>{withdrawals.filter((w) => w.status === "approved" || w.status === "completed").length}</strong></div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* COURSES */}
        <TabsContent value="courses" className="sm-tab-content">
          {groups.length === 0 ? (
            <div className="sm-empty"><BookOpen className="h-10 w-10 mx-auto opacity-40" /><p className="font-bold mt-2">لا توجد كورسات</p></div>
          ) : (
            <div className="space-y-2">
              {groups.map((g) => (
                <div key={g.id} className="sm-list-row">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold truncate">{g.title}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(g.created_at)}</p>
                  </div>
                  <span className="sm-badge sm-badge--blue">{fmtMoney(g.price || 0)}</span>
                  <span className={`sm-badge ${g.is_active ? "sm-badge--green" : "sm-badge--red"}`}>{g.is_active ? "نشط" : "موقوف"}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* WALLET */}
        <TabsContent value="wallet" className="sm-tab-content">
          <div className="sm-wallet-summary">
            <div>
              <p className="text-sm text-muted-foreground">الرصيد الحالي</p>
              <p className="text-3xl font-bold sm-text-primary">{fmtMoney(walletBalance)}</p>
            </div>
            <Button onClick={() => setWalletOpen(true)} className="sm-action-btn sm-action-btn--blue">
              <Edit3 className="h-4 w-4" /> تعديل الرصيد
            </Button>
          </div>
          <h3 className="sm-section-subtitle mt-4">سجل المعاملات</h3>
          {walletTxs.length === 0 ? (
            <div className="sm-empty"><Wallet className="h-10 w-10 mx-auto opacity-40" /><p className="font-bold mt-2">لا توجد معاملات</p></div>
          ) : (
            <div className="space-y-2">
              {walletTxs.map((tx) => (
                <div key={tx.id} className="sm-list-row">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{tx.transaction_type}</p>
                    {(tx.description || tx.admin_message) && (
                      <p className="text-xs text-muted-foreground truncate">{tx.admin_message || tx.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{fmtDateTime(tx.created_at)}</p>
                  </div>
                  <span className={`font-bold ${tx.amount >= 0 ? "sm-text-success" : "sm-text-danger"}`}>
                    {tx.amount >= 0 ? "+" : ""}{fmtMoney(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* WITHDRAWALS */}
        <TabsContent value="withdrawals" className="sm-tab-content">
          {withdrawals.length === 0 ? (
            <div className="sm-empty"><CreditCard className="h-10 w-10 mx-auto opacity-40" /><p className="font-bold mt-2">لا توجد طلبات سحب</p></div>
          ) : (
            <div className="space-y-2">
              {withdrawals.map((w) => (
                <div key={w.id} className="sm-list-row">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold">{fmtMoney(Number(w.amount || 0))}</p>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(w.created_at)}</p>
                  </div>
                  <span className={`sm-badge ${
                    w.status === "approved" || w.status === "completed" ? "sm-badge--green" :
                    w.status === "rejected" || w.status === "cancelled" ? "sm-badge--red" :
                    "sm-badge--blue"
                  }`}>{w.status}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* SECURITY */}
        <TabsContent value="security" className="sm-tab-content">
          <div className="grid gap-3">
            <div className="sm-overview-card">
              <h3 className="sm-ov-title flex items-center gap-2"><Mail className="h-4 w-4" /> البريد الإلكتروني</h3>
              <p className="text-sm text-muted-foreground mb-3">{teacher.email}</p>
              <Button onClick={() => { setNewEmail(""); setEmailOpen(true); }} variant="outline" size="sm" className="gap-1">
                <Edit3 className="h-3 w-3" /> تغيير البريد
              </Button>
            </div>
            <div className="sm-overview-card">
              <h3 className="sm-ov-title flex items-center gap-2"><KeyRound className="h-4 w-4" /> كلمة السر</h3>
              <p className="text-sm text-muted-foreground mb-3">يمكن للمطور تغيير كلمة سر المعلم بدون الحاجة لكلمة السر القديمة.</p>
              <Button onClick={() => setPwOpen(true)} variant="outline" size="sm" className="gap-1">
                <Lock className="h-3 w-3" /> تغيير كلمة السر
              </Button>
            </div>
            <div className="sm-overview-card border-destructive/30">
              <h3 className="sm-ov-title flex items-center gap-2 text-destructive"><Shield className="h-4 w-4" /> منطقة خطرة</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {teacher.is_banned ? "المعلم محظور حالياً ولا يستطيع تسجيل الدخول." : "حظر المعلم سيمنعه من الوصول إلى المنصة."}
              </p>
              <Button onClick={toggleBan} disabled={banLoading} variant={teacher.is_banned ? "outline" : "destructive"} size="sm" className="gap-1">
                {banLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                {teacher.is_banned ? "فك الحظر" : "حظر المعلم"}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ACTIVITY */}
        <TabsContent value="activity" className="sm-tab-content">
          {activities.length === 0 ? (
            <div className="sm-empty"><Activity className="h-10 w-10 mx-auto opacity-40" /><p className="font-bold mt-2">لا توجد سجلات نشاط</p><p className="text-sm opacity-70">عند تفعيل تتبع النشاط ستظهر سجلات تسجيل الدخول والإجراءات هنا</p></div>
          ) : (
            <div className="space-y-2">
              {activities.map((a) => (
                <div key={a.id} className="sm-list-row">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{a.action}</p>
                    {a.details && <p className="text-xs text-muted-foreground truncate">{JSON.stringify(a.details)}</p>}
                    <p className="text-xs text-muted-foreground">{fmtDateTime(a.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Edit dialog ─── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تعديل بيانات المعلم</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>الاسم الكامل</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div><Label>رقم الهاتف</Label><Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
            <Button onClick={saveProfile} disabled={editLoading}>{editLoading && <Loader2 className="h-4 w-4 animate-spin ml-2" />} حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Password dialog ─── */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تغيير كلمة سر المعلم</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>كلمة السر الجديدة (6 أحرف على الأقل)</Label><Input type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground">سيتم إرسال إشعار للمعلم بتغيير كلمة السر.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwOpen(false)}>إلغاء</Button>
            <Button onClick={resetPassword} disabled={pwLoading}>{pwLoading && <Loader2 className="h-4 w-4 animate-spin ml-2" />} تغيير</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Email dialog ─── */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تغيير البريد الإلكتروني</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>البريد الجديد</Label><Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)}>إلغاء</Button>
            <Button onClick={updateEmail} disabled={emailLoading}>{emailLoading && <Loader2 className="h-4 w-4 animate-spin ml-2" />} حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Wallet adjust dialog ─── */}
      <Dialog open={walletOpen} onOpenChange={setWalletOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تعديل رصيد المعلم</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Button type="button" variant={walletType === "add" ? "default" : "outline"} onClick={() => setWalletType("add")} size="sm" className="gap-1"><Plus className="h-3 w-3" />إضافة</Button>
              <Button type="button" variant={walletType === "subtract" ? "destructive" : "outline"} onClick={() => setWalletType("subtract")} size="sm" className="gap-1"><Minus className="h-3 w-3" />خصم</Button>
              <Button type="button" variant={walletType === "bonus" ? "default" : "outline"} onClick={() => setWalletType("bonus")} size="sm" className="gap-1">🎁 مكافأة</Button>
            </div>
            <div><Label>المبلغ (جنيه)</Label><Input type="number" min="0" value={walletAmount} onChange={(e) => setWalletAmount(e.target.value)} /></div>
            <div><Label>ملاحظة (تظهر للمعلم)</Label><Input value={walletNote} onChange={(e) => setWalletNote(e.target.value)} placeholder="اختياري" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWalletOpen(false)}>إلغاء</Button>
            <Button onClick={adjustWallet} disabled={walletLoading}>{walletLoading && <Loader2 className="h-4 w-4 animate-spin ml-2" />} تأكيد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
