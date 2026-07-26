import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import NotificationsPage from "@/pages/admin/NotificationsPage";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import "@/styles/admin-ds-overrides.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  Users,
  Clock,
  TrendingUp,
  GraduationCap,
  Upload,
  BookOpen,
  Bell,
  Settings,
  LogOut,
  MessageSquare,
  User,
  Search,
  Ban,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  Edit,
  Video,
  FileText,
  ClipboardList,
  Send,
  RefreshCw,
  Eye,
  EyeOff,
  Shield,
  Loader2,
  AlertTriangle,
  Save,
  Mail,
  Phone,
  Globe,
  Wrench,
  UserCog,
  Lock,
  Info,
  CreditCard,
  Wallet,
  Library,
  MonitorPlay,
  Smartphone,
} from "lucide-react";
import AdminDepositManagement from "@/components/admin/AdminDepositManagement";
import AdminTeacherAffairs from "@/components/admin/AdminTeacherAffairs";

import PaymentMethodsManagement from "@/components/admin/PaymentMethodsManagement";
import AdminStudentManagement from "@/components/admin/AdminStudentManagement";
import AdminTeacherWithdrawalsPage from "@/components/admin/AdminTeacherWithdrawalsPage";
import SettingsPage from "@/pages/admin/SettingsPage";
import AdminSupportPage from "@/pages/admin/SupportPage";
import AppVersionsPage from "@/pages/admin/AppVersionsPage";

// Types
interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  student_code: string | null;
  stage: string | null;
  grade: string | null;
  section: string | null;
  is_banned: boolean | null;
  created_at: string | null;
}

interface TeacherRequest {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  school_name: string | null;
  employee_id: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string | null;
}

interface Subject {
  id: string;
  name: string;
  stage: string;
  grade: string;
  section: string | null;
  category: string;
  description: string | null;
  is_active: boolean | null;
}

interface Content {
  id: string;
  title: string;
  type: string;
  file_url: string;
  subject_id: string | null;
  description: string | null;
  created_at: string | null;
  is_active: boolean | null;
}

interface SupportMessage {
  id: string;
  user_id: string;
  message: string;
  is_from_admin: boolean | null;
  is_read: boolean | null;
  created_at: string | null;
}

interface ChatConversation {
  user_id: string;
  user_name: string;
  user_email: string;
  unread_count: number;
  last_message: string;
  last_message_time: string | null;
}

interface PlatformSettings {
  [key: string]: string;
}

// Stage/Grade data
const stages = [
  { value: "ابتدائي", label: "ابتدائي" },
  { value: "اعدادي", label: "إعدادي" },
  { value: "ثانوي", label: "ثانوي" },
];

const gradesByStage: { [key: string]: { value: string; label: string }[] } = {
  ابتدائي: [
    { value: "الصف الأول", label: "الصف الأول" },
    { value: "الصف الثاني", label: "الصف الثاني" },
    { value: "الصف الثالث", label: "الصف الثالث" },
    { value: "الصف الرابع", label: "الصف الرابع" },
    { value: "الصف الخامس", label: "الصف الخامس" },
    { value: "الصف السادس", label: "الصف السادس" },
  ],
  اعدادي: [
    { value: "الصف الأول", label: "الصف الأول" },
    { value: "الصف الثاني", label: "الصف الثاني" },
    { value: "الصف الثالث", label: "الصف الثالث" },
  ],
  ثانوي: [
    { value: "الصف الأول", label: "الصف الأول" },
    { value: "الصف الثاني", label: "الصف الثاني" },
    { value: "الصف الثالث", label: "الصف الثالث" },
  ],
};

const sections = [
  { value: "علمي", label: "علمي" },
  { value: "أدبي", label: "أدبي" },
  { value: "both", label: "القسمين معًا" },
];

const contentCategories = [
  { value: "دروس", label: "دروس" },
  { value: "امتحانات", label: "امتحانات" },
  { value: "ملخصات", label: "ملخصات" },
  { value: "مراجعات", label: "مراجعات" },
];

const contentTypes = [
  { value: "video", label: "فيديو", icon: Video },
  { value: "pdf", label: "PDF", icon: FileText },
  { value: "exam", label: "امتحان", icon: ClipboardList },
  { value: "summary", label: "ملخص", icon: FileText },
];

// Sidebar Menu Items
const menuItems = [
  { id: "overview", label: "نظرة عامة", icon: BarChart3 },
  { id: "students", label: "إدارة الطلاب", icon: Users },
  { id: "student-settings", label: "إعدادات الطالب", icon: MonitorPlay, route: "/admin/ads" },
  { id: "deposits", label: "طلبات الإيداع", icon: Wallet },
  { id: "teacher-affairs", label: "شؤون المعلمين", icon: UserCog },
  { id: "teacher-withdrawals", label: "سحب المعلمين", icon: Wallet },
  { id: "subscriptions", label: "الاشتراكات", icon: CreditCard, route: "/admin/subscriptions" },
  { id: "payment-methods", label: "طرق الدفع", icon: CreditCard },
  { id: "content", label: "المحتوى", icon: Upload },
  { id: "subjects", label: "المواد", icon: BookOpen },
  { id: "notifications", label: "الإشعارات", icon: Bell },
  { id: "support", label: "الدعم الفني", icon: MessageSquare },
  { id: "app-versions", label: "إصدارات التطبيق", icon: Smartphone },
  { id: "settings", label: "الإعدادات", icon: Settings },
];

// DS palette — one solid color per item (icon accent). Active row uses DS Primary.
const menuAccent: Record<string, string> = {
  overview: "#2563EB",
  students: "#059669",
  "student-settings": "#0EA5E9",
  deposits: "#EA580C",
  "teacher-affairs": "#7C3AED",
  "teacher-withdrawals": "#059669",
  subscriptions: "#2563EB",
  "payment-methods": "#0891B2",
  content: "#DC2626",
  subjects: "#2563EB",
  notifications: "#7C3AED",
  support: "#059669",
  "app-versions": "#EA580C",
  settings: "#334155",
};


// ============================================
// ADMIN DASHBOARD COMPONENT
// ============================================
const AdminDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarBadges, setSidebarBadges] = useState<Record<string, number>>({});

  useEffect(() => {
    if (activeTab === "subscriptions") {
      navigate("/admin/subscriptions");
      return;
    }
    if (activeTab === "student-settings") {
      navigate("/admin/ads");
    }
  }, [activeTab, navigate]);

  // Fetch sidebar badge counts
  const fetchBadgeCounts = useCallback(async () => {
    try {
      const [
        { count: pendingDeposits },
        { count: pendingTeachers },
        { count: pendingPriceChanges },
        { count: unreadSupport },
      ] = await Promise.all([
        supabase.from("deposit_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("teacher_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("price_change_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("support_messages").select("*", { count: "exact", head: true }).eq("is_from_admin", false).eq("is_read", false),
      ]);
      const { count: pendingWithdrawals } = await supabase
        .from("teacher_withdrawal_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      setSidebarBadges({
        deposits: pendingDeposits || 0,
        "teacher-affairs": (pendingTeachers || 0) + (pendingPriceChanges || 0),
        "teacher-withdrawals": pendingWithdrawals || 0,
        support: unreadSupport || 0,
      });
    } catch (e) {
      console.error("Badge fetch error:", e);
    }
  }, []);

  // Check admin role
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .single();

      if (!roleData) {
        toast.error("ليس لديك صلاحية الوصول");
        navigate("/dashboard");
        return;
      }

      setIsAdmin(true);
      setLoading(false);
    };

    checkAdmin();
  }, [user, navigate]);

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      // Two-tone chime
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      // Audio not supported
    }
  }, []);

  // Realtime handler with toast
  const handleRealtimeEvent = useCallback((table: string, eventType: string) => {
    if (eventType !== "INSERT") return;
    fetchBadgeCounts();
    playNotificationSound();
    const messages: Record<string, string> = {
      deposit_requests: "📥 طلب إيداع جديد",
      teacher_requests: "👨‍🏫 طلب تسجيل معلم جديد",
      teacher_withdrawal_requests: "💸 طلب سحب معلم جديد",
      price_change_requests: "💰 طلب تغيير سعر جديد",
      support_messages: "💬 رسالة دعم جديدة",
    };
    toast.info(messages[table] || "إشعار جديد", { duration: 5000 });
  }, [fetchBadgeCounts, playNotificationSound]);

  // Fetch badges & subscribe to realtime
  useEffect(() => {
    if (!isAdmin) return;
    fetchBadgeCounts();

    const channel = supabase
      .channel("admin-sidebar-badges")
      // deposit_requests & teacher_requests removed from Realtime publication for security (contain PII).
      // Badge counts refresh on mount and whenever other tracked tables change.
      .on("postgres_changes", { event: "*", schema: "public", table: "price_change_requests" }, (p) => { fetchBadgeCounts(); if (p.eventType === "INSERT") handleRealtimeEvent("price_change_requests", "INSERT"); })
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, (p) => { fetchBadgeCounts(); if (p.eventType === "INSERT" && !(p.new as any)?.is_from_admin) handleRealtimeEvent("support_messages", "INSERT"); })
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_withdrawal_requests" }, (p) => { fetchBadgeCounts(); if (p.eventType === "INSERT") handleRealtimeEvent("teacher_withdrawal_requests", "INSERT"); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isAdmin, fetchBadgeCounts, handleRealtimeEvent]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 right-0 left-0 z-50 bg-card border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <BookOpen className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-foreground text-sm">مدرك Plus</span>
        </div>
        <Button
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="h-9 w-9 rounded-[10px] bg-[#2563EB] text-white hover:bg-[#1D4ED8] shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
        >
          {sidebarOpen ? <XCircle className="h-5 w-5" /> : <BarChart3 className="h-5 w-5" />}
        </Button>

      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed right-0 top-0 h-screen w-64 bg-card border-l border-border flex flex-col z-50 transition-transform duration-300",
        "lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )}>
        {/* Logo */}
        <div className="p-4 lg:p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 lg:h-10 lg:w-10 items-center justify-center rounded-lg bg-primary">
              <BookOpen className="h-4 w-4 lg:h-5 lg:w-5 text-primary-foreground" />
            </div>
            <div>
              <span className="font-bold text-foreground text-sm lg:text-base">مدرك Plus</span>
              <p className="text-xs text-muted-foreground hidden lg:block">لوحة التحكم</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 lg:p-4 space-y-1 overflow-y-auto" style={{ fontFamily: 'Cairo, system-ui, sans-serif' }}>
          {/* زر رفع المحتوى */}
          <button
            onClick={() => { navigate("/admin/upload"); setSidebarOpen(false); }}
            className="w-full flex items-center gap-3 px-4 h-11 rounded-[10px] text-[13px] font-semibold transition-colors duration-150 bg-[#2563EB] text-white hover:bg-[#1D4ED8] mb-2 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
          >
            <Upload className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">رفع المحتوى</span>
          </button>


          {/* زر الباقات المجمعة */}
          <button
            onClick={() => { navigate("/admin/bundled-packages"); setSidebarOpen(false); }}
            className="w-full flex items-center gap-3 px-4 h-11 rounded-[10px] text-[13px] font-semibold transition-colors duration-150 bg-white text-[#2563EB] border border-[#2563EB] hover:bg-[#EFF6FF] mb-2"
          >
            <CreditCard className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">الباقات المجمعة</span>
          </button>

          {/* زر مكتبة الطلاب */}
          <button
            onClick={() => { navigate("/admin/library"); setSidebarOpen(false); }}
            className="w-full flex items-center gap-3 px-4 h-11 rounded-[10px] text-[13px] font-semibold transition-colors duration-150 bg-white text-[#059669] border border-[#059669] hover:bg-[#ECFDF5] mb-2"
          >
            <BookOpen className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">مكتبة الطلاب</span>
          </button>

          {/* زر حسابات الطلاب التجريبية */}
          <button
            onClick={() => { navigate("/admin/test-students"); setSidebarOpen(false); }}
            className="w-full flex items-center gap-3 px-4 h-11 rounded-[10px] text-[13px] font-semibold transition-colors duration-150 bg-white text-[#7C3AED] border border-[#7C3AED] hover:bg-[#F5F3FF] mb-3"
          >
            <GraduationCap className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">حسابات الطلاب التجريبية</span>
          </button>

          <Separator className="my-2 lg:my-3" />

          {menuItems.map((item) => {
            const badgeCount = sidebarBadges[item.id] || 0;
            const accent = menuAccent[item.id] || "#2563EB";
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if ((item as any).route) { navigate((item as any).route); setSidebarOpen(false); return; }
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 lg:px-4 h-11 rounded-[10px] text-[13px] font-semibold transition-colors duration-150 relative border",
                  isActive
                    ? "bg-[#2563EB] text-white border-[#2563EB] shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                    : "bg-white text-[#0F172A] border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1]"
                )}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-[8px] flex-shrink-0"
                  style={{
                    backgroundColor: isActive ? "rgba(255,255,255,0.16)" : `${accent}14`,
                    color: isActive ? "#FFFFFF" : accent,
                  }}
                >
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="truncate">{item.label}</span>
                {badgeCount > 0 && (
                  <span className={cn(
                    "mr-auto flex h-5 min-w-5 items-center justify-center rounded-full text-[10px] font-bold px-1.5 tabular-nums",
                    isActive ? "bg-white text-[#2563EB]" : "bg-[#DC2626] text-white"
                  )}>
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Admin Info */}
        <div className="p-3 lg:p-4 border-t border-[#E2E8F0]">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] bg-[#F8FAFC] border border-[#E2E8F0] mb-3">
            <div className="h-9 w-9 rounded-full bg-[#2563EB] flex items-center justify-center flex-shrink-0">
              <User className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#0F172A] truncate">المدير</p>
              <p className="text-[11px] text-[#64748B] truncate hidden lg:block">مدير النظام</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[10px] text-[13px] font-semibold bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors duration-150"
          >
            <LogOut className="h-4 w-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>


      {/* Main Content */}
      <main className="admin-main-mobile flex-1 lg:mr-64 p-4 lg:p-8 pt-20 lg:pt-8 w-full max-w-full overflow-x-hidden">
        {activeTab === "overview" && <OverviewTab onNavigate={setActiveTab} />}
        {activeTab === "students" && <AdminStudentManagement />}
        {activeTab === "student-settings" && <StudentSettingsTab />}
        {activeTab === "deposits" && <AdminDepositManagement />}
        {activeTab === "teacher-affairs" && <TeacherAffairsFullTab />}
        {activeTab === "teacher-withdrawals" && <AdminTeacherWithdrawalsPage />}
        {activeTab === "subscriptions" && null}
        {activeTab === "payment-methods" && <PaymentMethodsManagement />}
        {activeTab === "content" && <ContentTab />}
        {activeTab === "subjects" && <SubjectsTab />}
        {activeTab === "notifications" && <NotificationsPage />}
        {activeTab === "support" && <AdminSupportPage />}
        {activeTab === "app-versions" && <AppVersionsPage />}
        {activeTab === "settings" && <SettingsPage />}
      </main>
    </div>
  );
};

// ============================================
// OVERVIEW TAB
// ============================================
const OverviewTab = ({ onNavigate }: { onNavigate: (tab: string) => void }) => {
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    pendingTeachers: 0,
    subscribedStudents: 0,
    unreadSupport: 0,
    pendingDeposits: 0,
    pendingPriceChanges: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [
          { count: studentsCount },
          { count: teachersCount },
          { count: pendingCount },
          { count: unreadCount },
          { count: depositsCount },
          { count: priceChangesCount },
        ] = await Promise.all([
          supabase.from("profiles").select("*", { count: "exact", head: true }),
          supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "teacher"),
          supabase.from("teacher_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("support_messages").select("*", { count: "exact", head: true }).eq("is_from_admin", false).eq("is_read", false),
          supabase.from("deposit_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("price_change_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
        ]);

        const now = new Date();
        const { data: activeSubs } = await supabase
          .from("subscriptions")
          .select("student_id")
          .eq("is_active", true)
          .gt("end_date", now.toISOString());
        const subscribedStudents = new Set(activeSubs?.map(s => s.student_id) || []).size;

        setStats({
          totalStudents: studentsCount || 0,
          totalTeachers: teachersCount || 0,
          pendingTeachers: pendingCount || 0,
          subscribedStudents,
          unreadSupport: unreadCount || 0,
          pendingDeposits: depositsCount || 0,
          pendingPriceChanges: priceChangesCount || 0,
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
        toast.error("خطأ في تحميل الإحصائيات");
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const statCards = [
    {
      title: "إجمالي الطلاب",
      value: stats.totalStudents,
      icon: Users,
      gradient: "linear-gradient(135deg,#3b82f6,#2563eb)",
      tab: "students",
      badge: 0,
    },
    {
      title: "إجمالي المعلمين",
      value: stats.totalTeachers,
      icon: GraduationCap,
      gradient: "linear-gradient(135deg,#10b981,#059669)",
      tab: "teacher-affairs",
      badge: 0,
    },
    {
      title: "طلبات المعلمين المعلقة",
      value: stats.pendingTeachers,
      icon: Clock,
      gradient: "linear-gradient(135deg,#f59e0b,#d97706)",
      tab: "teacher-affairs",
      badge: stats.pendingTeachers,
    },
    {
      title: "الطلاب المشتركين",
      value: stats.subscribedStudents,
      icon: CreditCard,
      gradient: "linear-gradient(135deg,#8b5cf6,#7c3aed)",
      tab: "subscriptions",
      badge: 0,
    },
    {
      title: "رسائل الدعم غير المقروءة",
      value: stats.unreadSupport,
      icon: MessageSquare,
      gradient: "linear-gradient(135deg,#ec4899,#db2777)",
      tab: "support",
      badge: stats.unreadSupport,
    },
    {
      title: "طلبات الإيداع",
      value: stats.pendingDeposits,
      icon: Wallet,
      gradient: "linear-gradient(135deg,#06b6d4,#0891b2)",
      tab: "deposits",
      badge: stats.pendingDeposits,
    },
    {
      title: "شؤون المعلمين",
      value: stats.pendingPriceChanges,
      icon: UserCog,
      gradient: "linear-gradient(135deg,#f97316,#ea580c)",
      tab: "teacher-affairs",
      badge: stats.pendingPriceChanges,
      subtitle: "طلبات معلقة",
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4 lg:space-y-6 w-full max-w-full">
        <h2 className="text-xl lg:text-2xl font-bold">نظرة عامة</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-28 lg:h-36 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-8 w-full max-w-full">
      <div className="bg-gradient-to-l from-primary/90 to-primary rounded-2xl p-6 lg:p-8 text-primary-foreground">
        <h1 className="text-xl lg:text-3xl font-bold mb-1">مرحباً بك في لوحة التحكم</h1>
        <p className="text-primary-foreground/70 text-sm lg:text-base">إدارة منصة مدرك Plus التعليمية</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 lg:gap-4">
        {statCards.map((stat, index) => (
          <Card
            key={index}
            className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 border-0 shadow-sm relative overflow-hidden group"
            onClick={() => onNavigate(stat.tab)}
          >
            {stat.badge > 0 && (
              <div className="absolute top-2 left-2 z-10">
                <span className="flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] sm:text-xs font-bold animate-pulse">
                  {stat.badge}
                </span>
              </div>
            )}
            <CardContent className="p-3 sm:p-4 lg:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] sm:text-xs lg:text-sm text-muted-foreground leading-tight line-clamp-2 break-words">{stat.title}</p>
                  <p className="text-xl sm:text-2xl lg:text-4xl font-bold mt-1.5">{stat.value}</p>
                  {stat.subtitle && (
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 truncate">{stat.subtitle}</p>
                  )}
                </div>
                <div className="p-2 sm:p-2.5 lg:p-3 rounded-xl group-hover:scale-110 transition-transform shadow-md shrink-0" style={{ background: stat.gradient }}>
                  <stat.icon className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};




// ============================================
// STUDENTS TAB
// ============================================
const StudentsTab = () => {
  const [students, setStudents] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchStudents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setStudents(data || []);
    } catch (error) {
      console.error("Error fetching students:", error);
      toast.error("خطأ في تحميل الطلاب");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const toggleBan = async (student: Profile) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_banned: !student.is_banned })
        .eq("id", student.id);

      if (error) throw error;

      toast.success(student.is_banned ? "تم فك حظر الطالب" : "تم حظر الطالب");
      fetchStudents();
    } catch (error) {
      console.error("Error toggling ban:", error);
      toast.error("خطأ في تحديث حالة الطالب");
    }
  };

  const filteredStudents = students.filter(
    (student) =>
      student.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.student_code?.includes(searchTerm)
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">إدارة الطلاب</h2>
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          إدارة الطلاب
        </h2>
        <Badge variant="secondary">{students.length} طالب</Badge>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="بحث بالاسم أو البريد أو كود الطالب..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pr-10"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">البريد الإلكتروني</TableHead>
                <TableHead className="text-right">كود الطالب</TableHead>
                <TableHead className="text-right">المرحلة</TableHead>
                <TableHead className="text-right">الصف</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    لا يوجد طلاب
                  </TableCell>
                </TableRow>
              ) : (
                filteredStudents.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">{student.full_name}</TableCell>
                    <TableCell>{student.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{student.student_code || "-"}</Badge>
                    </TableCell>
                    <TableCell>{student.stage || "-"}</TableCell>
                    <TableCell>{student.grade || "-"}</TableCell>
                    <TableCell>
                      {student.is_banned ? (
                        <Badge variant="destructive">محظور</Badge>
                      ) : (
                        <Badge variant="default" className="bg-green-500">نشط</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant={student.is_banned ? "outline" : "destructive"}
                        size="sm"
                        onClick={() => toggleBan(student)}
                      >
                        {student.is_banned ? (
                          <>
                            <CheckCircle className="h-4 w-4 ml-1" />
                            فك الحظر
                          </>
                        ) : (
                          <>
                            <Ban className="h-4 w-4 ml-1" />
                            حظر
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

// ============================================
// TEACHER AFFAIRS FULL TAB (merged teacher management + affairs)
// ============================================
const TeacherAffairsFullTab = () => {
  const [TeacherMgmt, setTeacherMgmt] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    import("@/components/admin/AdminTeacherManagement").then(mod => {
      setTeacherMgmt(() => mod.default);
    });
  }, []);

  return (
    <div className="space-y-8">
      {/* Unified teacher management — all admin controls live here */}
      {TeacherMgmt ? <TeacherMgmt /> : (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
};

// ============================================
// CONTENT TAB
// ============================================
const ContentTab = () => {
  const [contents, setContents] = useState<Content[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedStage, setSelectedStage] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("");

  // Upload form state
  const [uploadForm, setUploadForm] = useState({
    title: "",
    type: "",
    subject_id: "",
    description: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const [contentsRes, subjectsRes] = await Promise.all([
        supabase.from("content").select("*").order("created_at", { ascending: false }),
        supabase.from("subjects").select("*").eq("is_active", true),
      ]);

      if (contentsRes.error) throw contentsRes.error;
      if (subjectsRes.error) throw subjectsRes.error;

      setContents(contentsRes.data || []);
      setSubjects(subjectsRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Get the appropriate bucket based on content type
  const getBucketName = (type: string): string => {
    switch (type) {
      case "video":
        return "videos";
      case "pdf":
      case "summary":
        return "books";
      case "exam":
        return "exams";
      default:
        return "books";
    }
  };

  // Get accepted file types based on content type
  const getAcceptedFileTypes = (type: string): string => {
    switch (type) {
      case "video":
        return "video/*";
      case "pdf":
      case "summary":
      case "exam":
        return ".pdf";
      default:
        return "*/*";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 50MB)
      const maxSize = 50 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error("حجم الملف كبير جداً (الحد الأقصى 50MB)");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!uploadForm.title || !uploadForm.type || !selectedFile || !uploadForm.subject_id) {
      toast.error("يرجى ملء جميع الحقول المطلوبة واختيار ملف");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Generate unique file name
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const bucketName = getBucketName(uploadForm.type);
      const filePath = `${uploadForm.subject_id}/${fileName}`;

      // Upload file to Supabase Storage
      setUploadProgress(20);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, selectedFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      setUploadProgress(70);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

      const fileUrl = urlData.publicUrl;

      // Save content to database
      const { error: dbError } = await supabase.from("content").insert({
        title: uploadForm.title,
        type: uploadForm.type,
        file_url: fileUrl,
        subject_id: uploadForm.subject_id,
        description: uploadForm.description,
      });

      if (dbError) throw dbError;

      setUploadProgress(100);
      toast.success("تم رفع المحتوى بنجاح");
      setShowUploadDialog(false);
      setUploadForm({ title: "", type: "", subject_id: "", description: "" });
      setSelectedFile(null);
      setUploadProgress(0);
      fetchData();
    } catch (error: any) {
      console.error("Error uploading content:", error);
      toast.error(error.message || "خطأ في رفع المحتوى");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const contentToDelete = contents.find((c) => c.id === id);
    const { deleteContentBunnyAssets, writeDeletionAudit } = await import("@/lib/bunnyCleanup");
    const startedAt = performance.now();
    let bunnyResults: Awaited<ReturnType<typeof deleteContentBunnyAssets>> = [];
    let auditError: string | null = null;

    try {
      // 1) Delete Bunny.net media (Stream + Storage) BEFORE the DB row is
      //    removed — the bunny-* edge functions verify ownership by row lookup.
      if (contentToDelete) {
        bunnyResults = await deleteContentBunnyAssets({
          file_url: contentToDelete.file_url,
          thumbnail_url: (contentToDelete as unknown as { thumbnail_url?: string | null }).thumbnail_url,
        });
      }

      // 2) Legacy Supabase Storage cleanup for non-Bunny URLs.
      const legacyUrl = contentToDelete?.file_url;
      if (legacyUrl && !legacyUrl.startsWith("bunny://") && !legacyUrl.startsWith("bstorage://")) {
        try {
          const url = new URL(legacyUrl);
          const pathParts = url.pathname.split("/storage/v1/object/public/");
          if (pathParts.length > 1) {
            const [bucket, ...filePathParts] = pathParts[1].split("/");
            const filePath = filePathParts.join("/");
            await supabase.storage.from(bucket).remove([filePath]);
          }
        } catch { /* ignore malformed URLs */ }
      }

      const { error } = await supabase.from("content").delete().eq("id", id);
      if (error) throw error;
      toast.success("تم حذف المحتوى");
      fetchData();
    } catch (error) {
      auditError = error instanceof Error ? error.message : String(error);
      console.error("Error deleting content:", error);
      toast.error("خطأ في حذف المحتوى");
    } finally {
      await writeDeletionAudit({
        actionType: "content_delete",
        targetId: id,
        targetLabel: contentToDelete?.title ?? null,
        targetMeta: {
          type: (contentToDelete as unknown as { type?: string })?.type,
          file_url: contentToDelete?.file_url,
        },
        bunnyResults,
        startedAt,
        error: auditError,
      });
    }
  };



  // Reset file when type changes
  useEffect(() => {
    setSelectedFile(null);
  }, [uploadForm.type]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "video":
        return <Video className="h-4 w-4" />;
      case "pdf":
      case "summary":
        return <FileText className="h-4 w-4" />;
      case "exam":
        return <ClipboardList className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const filteredSubjects = subjects.filter((s) => {
    if (selectedStage && s.stage !== selectedStage) return false;
    if (selectedGrade && s.grade !== selectedGrade) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">إدارة المحتوى</h2>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Upload className="h-6 w-6" />
          إدارة المحتوى
        </h2>
        <Button onClick={() => setShowUploadDialog(true)}>
          <Plus className="h-4 w-4 ml-2" />
          رفع محتوى جديد
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={selectedStage || "__all__"} onValueChange={(v) => { setSelectedStage(v === "__all__" ? "" : v); setSelectedGrade(""); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="المرحلة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">الكل</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedGrade || "__all__"} onValueChange={(v) => setSelectedGrade(v === "__all__" ? "" : v)} disabled={!selectedStage}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="الصف" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">الكل</SelectItem>
            {selectedStage && gradesByStage[selectedStage]?.map((g) => (
              <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">العنوان</TableHead>
                <TableHead className="text-right">المادة</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    لا يوجد محتوى
                  </TableCell>
                </TableRow>
              ) : (
                contents.map((content) => {
                  const subject = subjects.find((s) => s.id === content.subject_id);
                  return (
                    <TableRow key={content.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getTypeIcon(content.type)}
                          <Badge variant="outline">{content.type}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{content.title}</TableCell>
                      <TableCell>{subject?.name || "-"}</TableCell>
                      <TableCell>
                        {content.created_at
                          ? new Date(content.created_at).toLocaleDateString("ar-EG")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                          >
                            <a href={content.file_url} target="_blank" rel="noopener noreferrer">
                              <Eye className="h-4 w-4" />
                            </a>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                                <AlertDialogDescription>
                                  هل أنت متأكد من حذف هذا المحتوى؟ لا يمكن التراجع عن هذا الإجراء.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(content.id)}>
                                  حذف
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>رفع محتوى جديد</DialogTitle>
            <DialogDescription>أضف فيديو أو ملف PDF أو امتحان أو ملخص</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>العنوان *</Label>
              <Input
                value={uploadForm.title}
                onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                placeholder="عنوان المحتوى"
              />
            </div>
            <div>
              <Label>نوع المحتوى *</Label>
              <Select
                value={uploadForm.type}
                onValueChange={(v) => setUploadForm({ ...uploadForm, type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر النوع" />
                </SelectTrigger>
                <SelectContent>
                  {contentTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <t.icon className="h-4 w-4" />
                        {t.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>المادة *</Label>
              <Select
                value={uploadForm.subject_id}
                onValueChange={(v) => setUploadForm({ ...uploadForm, subject_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر المادة" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.length === 0 ? (
                    <SelectItem value="__no_subjects__" disabled>لا توجد مواد - أضف مادة أولاً</SelectItem>
                  ) : (
                    subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.stage} - {s.grade})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الملف *</Label>
              <div className="space-y-2">
                <Input
                  type="file"
                  accept={uploadForm.type ? getAcceptedFileTypes(uploadForm.type) : "*/*"}
                  onChange={handleFileChange}
                  disabled={!uploadForm.type}
                  className="cursor-pointer"
                />
                {!uploadForm.type && (
                  <p className="text-xs text-muted-foreground">اختر نوع المحتوى أولاً</p>
                )}
                {selectedFile && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <span>{selectedFile.name}</span>
                    <span className="text-xs">({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                  </div>
                )}
                {uploading && uploadProgress > 0 && (
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
            <div>
              <Label>الوصف (اختياري)</Label>
              <Textarea
                value={uploadForm.description}
                onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                placeholder="وصف المحتوى"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              إلغاء
            </Button>
            <Button onClick={handleUpload} disabled={uploading || !selectedFile}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Upload className="h-4 w-4 ml-2" />}
              {uploading ? `جاري الرفع ${uploadProgress}%` : "رفع"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ============================================
// SUBJECTS TAB
// ============================================
const SubjectsTab = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

  const [form, setForm] = useState({
    name: "",
    stage: "",
    grade: "",
    section: "",
    category: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchSubjects = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .order("stage", { ascending: true });

      if (error) throw error;
      setSubjects(data || []);
    } catch (error) {
      console.error("Error fetching subjects:", error);
      toast.error("خطأ في تحميل المواد");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  const resetForm = () => {
    setForm({ name: "", stage: "", grade: "", section: "", category: "", description: "" });
    setEditingSubject(null);
  };

  const handleSave = async () => {
    if (!form.name || !form.stage || !form.grade || !form.category) {
      toast.error("يرجى ملء الحقول المطلوبة");
      return;
    }

    setSaving(true);
    try {
      if (editingSubject) {
        const { error } = await supabase
          .from("subjects")
          .update({
            name: form.name,
            stage: form.stage,
            grade: form.grade,
            section: form.section || null,
            category: form.category,
            description: form.description || null,
          })
          .eq("id", editingSubject.id);

        if (error) throw error;
        toast.success("تم تحديث المادة");
      } else {
        const { error } = await supabase.from("subjects").insert({
          name: form.name,
          stage: form.stage,
          grade: form.grade,
          section: form.section || null,
          category: form.category,
          description: form.description || null,
        });

        if (error) throw error;
        toast.success("تمت إضافة المادة");
      }

      setShowAddDialog(false);
      resetForm();
      fetchSubjects();
    } catch (error) {
      console.error("Error saving subject:", error);
      toast.error("خطأ في حفظ المادة");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (subject: Subject) => {
    setEditingSubject(subject);
    setForm({
      name: subject.name,
      stage: subject.stage,
      grade: subject.grade,
      section: subject.section || "",
      category: subject.category,
      description: subject.description || "",
    });
    setShowAddDialog(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw error;
      toast.success("تم حذف المادة");
      fetchSubjects();
    } catch (error) {
      console.error("Error deleting subject:", error);
      toast.error("خطأ في حذف المادة");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">إدارة المواد</h2>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6" />
          إدارة المواد
        </h2>
        <Button onClick={() => { resetForm(); setShowAddDialog(true); }}>
          <Plus className="h-4 w-4 ml-2" />
          إضافة مادة جديدة
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">المادة</TableHead>
                <TableHead className="text-right">المرحلة</TableHead>
                <TableHead className="text-right">الصف</TableHead>
                <TableHead className="text-right">الشعبة</TableHead>
                <TableHead className="text-right">التصنيف</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    لا توجد مواد
                  </TableCell>
                </TableRow>
              ) : (
                subjects.map((subject) => (
                  <TableRow key={subject.id}>
                    <TableCell className="font-medium">{subject.name}</TableCell>
                    <TableCell>{subject.stage}</TableCell>
                    <TableCell>{subject.grade}</TableCell>
                    <TableCell>{subject.section || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{subject.category}</Badge>
                    </TableCell>
                    <TableCell>
                      {subject.is_active ? (
                        <Badge className="bg-green-500">نشط</Badge>
                      ) : (
                        <Badge variant="secondary">معطل</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(subject)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                              <AlertDialogDescription>هل أنت متأكد من حذف هذه المادة؟</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>إلغاء</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(subject.id)}>حذف</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSubject ? "تعديل المادة" : "إضافة مادة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم المادة *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="اسم المادة" />
            </div>
            <div>
              <Label>المرحلة *</Label>
              <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v, grade: "" })}>
                <SelectTrigger><SelectValue placeholder="اختر المرحلة" /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الصف *</Label>
              <Select value={form.grade} onValueChange={(v) => setForm({ ...form, grade: v })} disabled={!form.stage}>
                <SelectTrigger><SelectValue placeholder="اختر الصف" /></SelectTrigger>
                <SelectContent>
                  {form.stage && gradesByStage[form.stage]?.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الشعبة</Label>
              <Select value={form.section || "__none__"} onValueChange={(v) => setForm({ ...form, section: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="اختر الشعبة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">بدون</SelectItem>
                  {sections.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>التصنيف *</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="التصنيف" />
            </div>
            <div>
              <Label>الوصف</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="وصف المادة" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              {editingSubject ? "تحديث" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ============================================
// NOTIFICATIONS TAB
// ============================================
const NotificationsTab = () => {
  return <NotificationsPage />;
};

// ============================================
// SUPPORT TAB
// ============================================
// SupportTab removed - now using AdminSupportPage component (src/pages/admin/SupportPage.tsx)

// ============================================
// SETTINGS TAB
// ============================================
// Old SettingsTab removed - now using SettingsPage component

const StudentSettingsTab = () => {
  const [settings, setSettings] = useState<PlatformSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from("platform_settings")
          .select("key, value")
          .in("key", [
            "student_dashboard_ticker_enabled",
            "student_dashboard_ticker_text",
            "student_dashboard_ticker_items",
          ]);

        if (error) throw error;

        const nextSettings: PlatformSettings = {
          student_dashboard_ticker_enabled: "false",
          student_dashboard_ticker_text: "",
          student_dashboard_ticker_items: "",
        };

        (data || []).forEach((item) => {
          nextSettings[item.key] = item.value || "";
        });

        if (nextSettings.student_dashboard_ticker_items) {
          try {
            const parsed = JSON.parse(nextSettings.student_dashboard_ticker_items);
            nextSettings.student_dashboard_ticker_items = Array.isArray(parsed) ? parsed.join("\n") : "";
          } catch {
            nextSettings.student_dashboard_ticker_items = "";
          }
        }

        setSettings(nextSettings);
      } catch (error) {
        console.error("Error fetching student settings:", error);
        toast.error("تعذر تحميل إعدادات الطالب");
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const items = (settings.student_dashboard_ticker_items || "")
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);

      const payload = [
        { key: "student_dashboard_ticker_enabled", value: settings.student_dashboard_ticker_enabled || "false" },
        { key: "student_dashboard_ticker_text", value: settings.student_dashboard_ticker_text || "" },
        { key: "student_dashboard_ticker_items", value: JSON.stringify(items) },
      ];

      for (const item of payload) {
        await supabase.from("platform_settings").upsert(item, { onConflict: "key" });
      }

      toast.success("تم حفظ شريط الحالة للطلاب");
    } catch (error) {
      console.error("Error saving student settings:", error);
      toast.error("حدث خطأ أثناء حفظ شريط الحالة");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="space-y-6"><h2 className="text-2xl font-bold">إعدادات الطالب</h2><Skeleton className="h-80" /></div>;

  const tickerEnabled = settings.student_dashboard_ticker_enabled === "true";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><MonitorPlay className="h-6 w-6" />إعدادات الطالب</h2>
          <p className="text-sm text-muted-foreground">من هنا تتحكم في الشريط المتحرك الذي يظهر للطلاب أعلى أقسام المواد.</p>
        </div>
        <Button onClick={saveSettings} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          حفظ التغييرات
        </Button>
      </div>

      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorPlay className="h-5 w-5 text-primary" />
            شريط الحالة / الشريط المتحرك
          </CardTitle>
          <CardDescription>
            اكتب رسالة رئيسية ورسائل متتابعة، وحدد إن كان الشريط يعمل أو متوقف. سيظهر للطلاب فوق أقسام المواد في الصفحة الرئيسية.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-card/80 p-4">
            <div>
              <p className="font-bold text-foreground">تفعيل الشريط المتحرك</p>
              <p className="text-xs text-muted-foreground">عند التفعيل تظهر الرسائل مباشرة للطلاب.</p>
            </div>
            <Switch
              checked={tickerEnabled}
              onCheckedChange={(checked) => updateSetting("student_dashboard_ticker_enabled", String(checked))}
            />
          </div>

          <div className="space-y-2">
            <Label>عنوان الشريط</Label>
            <Input
              value={settings.student_dashboard_ticker_text || ""}
              onChange={(e) => updateSetting("student_dashboard_ticker_text", e.target.value)}
              placeholder="مثال: 🏆 أوائل هذا الأسبوع والتنبيهات المهمة"
            />
          </div>

          <div className="space-y-2">
            <Label>رسائل الشريط المتحركة</Label>
            <Textarea
              value={settings.student_dashboard_ticker_items || ""}
              onChange={(e) => updateSetting("student_dashboard_ticker_items", e.target.value)}
              placeholder={"🎉 تهنئة للطلاب المتفوقين\n📌 تنبيه بموعد المراجعة\n⭐ معلومة سريعة للطلاب"}
              className="min-h-36"
            />
            <p className="text-xs text-muted-foreground">كل سطر = رسالة مستقلة داخل الشريط.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;