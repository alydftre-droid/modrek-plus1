import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/manualClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
} from "lucide-react";
import AdminDepositManagement from "@/components/admin/AdminDepositManagement";
import AdminTeacherAffairs from "@/components/admin/AdminTeacherAffairs";
import PaymentSettingsEditor from "@/components/admin/PaymentSettingsEditor";

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

interface Notification {
  id: string;
  title: string;
  message: string;
  user_id: string | null;
  is_read: boolean | null;
  created_at: string | null;
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
  { id: "students", label: "الطلاب", icon: Users },
  { id: "deposits", label: "طلبات الإيداع", icon: Wallet },
  { id: "teacher-affairs", label: "شؤون المعلمين", icon: UserCog },
  { id: "subscriptions", label: "الاشتراكات", icon: CreditCard },
  { id: "content", label: "المحتوى", icon: Upload },
  { id: "subjects", label: "المواد", icon: BookOpen },
  { id: "notifications", label: "الإشعارات", icon: Bell },
  { id: "support", label: "الدعم الفني", icon: MessageSquare },
  { id: "settings", label: "الإعدادات", icon: Settings },
];

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
      setSidebarBadges({
        deposits: pendingDeposits || 0,
        "teacher-affairs": (pendingTeachers || 0) + (pendingPriceChanges || 0),
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

  // Fetch badges & subscribe to realtime
  useEffect(() => {
    if (!isAdmin) return;
    fetchBadgeCounts();

    const channel = supabase
      .channel("admin-sidebar-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "deposit_requests" }, () => fetchBadgeCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_requests" }, () => fetchBadgeCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "price_change_requests" }, () => fetchBadgeCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, () => fetchBadgeCounts())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isAdmin, fetchBadgeCounts]);

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
          <span className="font-bold text-foreground text-sm">أزهاريون</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="h-8 w-8"
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
              <span className="font-bold text-foreground text-sm lg:text-base">أزهاريون</span>
              <p className="text-xs text-muted-foreground hidden lg:block">لوحة التحكم</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 lg:p-4 space-y-1 overflow-y-auto">
          {/* زر الرفع الخاص */}
          <button
            onClick={() => {
              navigate("/admin/upload");
              setSidebarOpen(false);
            }}
            className="w-full flex items-center gap-2 lg:gap-3 px-3 lg:px-4 py-2 lg:py-3 rounded-lg text-xs lg:text-sm font-medium transition-all bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/30 mb-3 lg:mb-4"
          >
            <Upload className="h-4 w-4 lg:h-5 lg:w-5 flex-shrink-0" />
            <span className="truncate">رفع المحتوى</span>
          </button>

          <Separator className="my-2 lg:my-3" />

          {menuItems.map((item) => {
            const badgeCount = sidebarBadges[item.id] || 0;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2 lg:gap-3 px-3 lg:px-4 py-2 lg:py-3 rounded-lg text-xs lg:text-sm font-medium transition-all relative",
                  activeTab === item.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4 lg:h-5 lg:w-5 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
                {badgeCount > 0 && (
                  <span className={cn(
                    "mr-auto flex h-5 min-w-5 items-center justify-center rounded-full text-[10px] font-bold px-1",
                    activeTab === item.id
                      ? "bg-primary-foreground text-primary"
                      : "bg-destructive text-destructive-foreground animate-pulse"
                  )}>
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Admin Info */}
        <div className="p-3 lg:p-4 border-t border-border">
          <div className="flex items-center gap-2 lg:gap-3 px-3 lg:px-4 py-2 lg:py-3 rounded-lg bg-accent/50 mb-2 lg:mb-3">
            <div className="h-8 w-8 lg:h-10 lg:w-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <User className="h-4 w-4 lg:h-5 lg:w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs lg:text-sm font-medium text-foreground truncate">المدير</p>
              <p className="text-xs text-muted-foreground truncate hidden lg:block">مدير النظام</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 lg:gap-3 text-destructive hover:text-destructive hover:bg-destructive/10 text-xs lg:text-sm"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4 lg:h-5 lg:w-5 flex-shrink-0" />
            <span className="truncate">تسجيل الخروج</span>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:mr-64 p-4 lg:p-8 pt-20 lg:pt-8 w-full max-w-full overflow-x-hidden">
        {activeTab === "overview" && <OverviewTab onNavigate={setActiveTab} />}
        {activeTab === "students" && <StudentsTab />}
        {activeTab === "deposits" && <AdminDepositManagement />}
        {activeTab === "teacher-affairs" && <TeacherAffairsFullTab />}
        {activeTab === "subscriptions" && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">الاشتراكات</h2>
            <Button onClick={() => navigate("/admin/subscriptions")} className="gap-2">
              <CreditCard className="h-5 w-5" />
              إدارة الاشتراكات
            </Button>
            <PaymentSettingsEditor />
          </div>
        )}
        {activeTab === "content" && <ContentTab />}
        {activeTab === "subjects" && <SubjectsTab />}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "support" && <SupportTab />}
        {activeTab === "settings" && <SettingsTab />}
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
      gradient: "from-blue-500 to-blue-600",
      tab: "students",
      badge: 0,
    },
    {
      title: "إجمالي المعلمين",
      value: stats.totalTeachers,
      icon: GraduationCap,
      gradient: "from-emerald-500 to-emerald-600",
      tab: "teacher-affairs",
      badge: 0,
    },
    {
      title: "طلبات المعلمين المعلقة",
      value: stats.pendingTeachers,
      icon: Clock,
      gradient: "from-amber-500 to-amber-600",
      tab: "teacher-affairs",
      badge: stats.pendingTeachers,
    },
    {
      title: "الطلاب المشتركين",
      value: stats.subscribedStudents,
      icon: CreditCard,
      gradient: "from-violet-500 to-violet-600",
      tab: "subscriptions",
      badge: 0,
    },
    {
      title: "رسائل الدعم غير المقروءة",
      value: stats.unreadSupport,
      icon: MessageSquare,
      gradient: "from-pink-500 to-pink-600",
      tab: "support",
      badge: stats.unreadSupport,
    },
    {
      title: "طلبات الإيداع",
      value: stats.pendingDeposits,
      icon: Wallet,
      gradient: "from-cyan-500 to-cyan-600",
      tab: "deposits",
      badge: stats.pendingDeposits,
    },
    {
      title: "شؤون المعلمين",
      value: stats.pendingPriceChanges,
      icon: UserCog,
      gradient: "from-orange-500 to-orange-600",
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
        <p className="text-primary-foreground/70 text-sm lg:text-base">إدارة منصة أزهاريون التعليمية</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4">
        {statCards.map((stat, index) => (
          <Card
            key={index}
            className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 border-0 shadow-sm relative overflow-hidden group"
            onClick={() => onNavigate(stat.tab)}
          >
            {stat.badge > 0 && (
              <div className="absolute top-2 left-2 z-10">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold animate-pulse">
                  {stat.badge}
                </span>
              </div>
            )}
            <CardContent className="p-4 lg:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs lg:text-sm text-muted-foreground truncate">{stat.title}</p>
                  <p className="text-2xl lg:text-4xl font-bold mt-1.5">{stat.value}</p>
                  {stat.subtitle && (
                    <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
                  )}
                </div>
                <div className={`p-2.5 lg:p-3 rounded-xl bg-gradient-to-br ${stat.gradient} group-hover:scale-110 transition-transform`}>
                  <stat.icon className="h-5 w-5 lg:h-6 lg:w-6 text-white" />
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
      <h2 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
        <UserCog className="h-5 w-5 lg:h-6 lg:w-6" />
        شؤون المعلمين
      </h2>

      {/* Teacher Management Section */}
      {TeacherMgmt ? <TeacherMgmt /> : (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Price Change Requests */}
      <Separator />
      <AdminTeacherAffairs />
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
    try {
      // Get content to delete file from storage
      const contentToDelete = contents.find((c) => c.id === id);
      
      if (contentToDelete?.file_url) {
        // Extract file path from URL and delete from storage
        const url = new URL(contentToDelete.file_url);
        const pathParts = url.pathname.split("/storage/v1/object/public/");
        if (pathParts.length > 1) {
          const [bucket, ...filePathParts] = pathParts[1].split("/");
          const filePath = filePathParts.join("/");
          await supabase.storage.from(bucket).remove([filePath]);
        }
      }

      const { error } = await supabase.from("content").delete().eq("id", id);
      if (error) throw error;
      toast.success("تم حذف المحتوى");
      fetchData();
    } catch (error) {
      console.error("Error deleting content:", error);
      toast.error("خطأ في حذف المحتوى");
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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const sendNotification = async () => {
    if (!newTitle || !newMessage) {
      toast.error("يرجى كتابة العنوان والرسالة");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from("notifications").insert({
        title: newTitle,
        message: newMessage,
        user_id: null,
      });
      if (error) throw error;
      toast.success("تم إرسال الإشعار");
      setNewTitle("");
      setNewMessage("");
      fetchNotifications();
    } catch (error) {
      console.error("Error sending notification:", error);
      toast.error("خطأ في إرسال الإشعار");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="space-y-6"><h2 className="text-2xl font-bold">الإشعارات</h2><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2"><Bell className="h-6 w-6" />الإشعارات</h2>
      <Card>
        <CardHeader><CardTitle>إرسال إشعار جديد</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>العنوان</Label><Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="عنوان الإشعار" /></div>
          <div><Label>الرسالة</Label><Textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="محتوى الإشعار" /></div>
          <Button onClick={sendNotification} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Send className="h-4 w-4 ml-2" />}
            إرسال للجميع
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>الإشعارات المرسلة</CardTitle></CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد إشعارات</p>
          ) : (
            <div className="space-y-3">
              {notifications.map((n) => (
                <div key={n.id} className="p-3 rounded-lg border">
                  <p className="font-medium">{n.title}</p>
                  <p className="text-sm text-muted-foreground">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{n.created_at ? new Date(n.created_at).toLocaleString("ar-EG") : ""}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ============================================
// SUPPORT TAB
// ============================================
const SupportTab = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("support_messages")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const grouped = new Map<string, SupportMessage[]>();
      (data || []).forEach((msg) => {
        const existing = grouped.get(msg.user_id) || [];
        existing.push(msg);
        grouped.set(msg.user_id, existing);
      });

      const userIds = [...grouped.keys()];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      const convList: ChatConversation[] = userIds.map((uid) => {
        const msgs = grouped.get(uid) || [];
        const unread = msgs.filter((m) => !m.is_from_admin && !m.is_read).length;
        const lastMsg = msgs[0];
        const profile = profileMap.get(uid);
        return {
          user_id: uid,
          user_name: profile?.full_name || "مستخدم",
          user_email: profile?.email || "",
          unread_count: unread,
          last_message: lastMsg?.message || "",
          last_message_time: lastMsg?.created_at || null,
        };
      });

      setConversations(convList);
    } catch (error) {
      console.error("Error fetching conversations:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const openConversation = async (userId: string) => {
    setSelectedUser(userId);
    const { data } = await supabase
      .from("support_messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    setMessages(data || []);

    await supabase
      .from("support_messages")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_from_admin", false);
  };

  const sendReply = async () => {
    if (!reply || !selectedUser || !user) return;
    setSending(true);
    try {
      const { error } = await supabase.from("support_messages").insert({
        user_id: selectedUser,
        message: reply,
        is_from_admin: true,
      });
      if (error) throw error;
      setReply("");
      openConversation(selectedUser);
    } catch (error) {
      console.error("Error sending reply:", error);
      toast.error("خطأ في إرسال الرد");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="space-y-6"><h2 className="text-2xl font-bold">الدعم الفني</h2><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2"><MessageSquare className="h-6 w-6" />الدعم الفني</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>المحادثات</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-96">
              {conversations.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">لا توجد محادثات</p>
              ) : (
                conversations.map((conv) => (
                  <button key={conv.user_id} onClick={() => openConversation(conv.user_id)} className={cn("w-full text-right p-4 border-b hover:bg-accent transition-colors", selectedUser === conv.user_id && "bg-accent")}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{conv.user_name}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-48">{conv.last_message}</p>
                      </div>
                      {conv.unread_count > 0 && <Badge variant="destructive" className="text-xs">{conv.unread_count}</Badge>}
                    </div>
                  </button>
                ))
              )}
            </ScrollArea>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            {selectedUser ? (
              <>
                <ScrollArea className="h-80 mb-4">
                  <div className="space-y-3">
                    {messages.map((msg) => (
                      <div key={msg.id} className={cn("p-3 rounded-lg max-w-[80%]", msg.is_from_admin ? "bg-primary text-primary-foreground mr-auto" : "bg-accent ml-auto")}>
                        <p className="text-sm">{msg.message}</p>
                        <p className="text-xs opacity-70 mt-1">{msg.created_at ? new Date(msg.created_at).toLocaleString("ar-EG") : ""}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <div className="flex gap-2">
                  <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="اكتب ردك..." className="flex-1" />
                  <Button onClick={sendReply} disabled={sending || !reply}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-96 text-muted-foreground">اختر محادثة لعرض الرسائل</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ============================================
// SETTINGS TAB
// ============================================
const SettingsTab = () => {
  const [settings, setSettings] = useState<PlatformSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase.from("platform_settings").select("*");
        if (error) throw error;
        const settingsObj: PlatformSettings = {};
        (data || []).forEach((s) => { settingsObj[s.key] = s.value || ""; });
        setSettings(settingsObj);
      } catch (error) {
        console.error("Error fetching settings:", error);
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
      for (const [key, value] of Object.entries(settings)) {
        await supabase
          .from("platform_settings")
          .upsert({ key, value }, { onConflict: "key" });
      }
      toast.success("تم حفظ الإعدادات");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("خطأ في حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="space-y-6"><h2 className="text-2xl font-bold">الإعدادات</h2><Skeleton className="h-96" /></div>;

  const settingsGroups = [
    { title: "معلومات المنصة", icon: Globe, fields: [
      { key: "platform_name", label: "اسم المنصة", type: "text" },
      { key: "support_email", label: "البريد الإلكتروني للدعم", type: "text" },
      { key: "support_phone", label: "هاتف الدعم", type: "text" },
      { key: "support_whatsapp", label: "رقم واتساب الدعم", type: "text" },
    ]},
    { title: "إعدادات الاشتراك", icon: CreditCard, fields: [
      { key: "subscription_default_price", label: "السعر الافتراضي (جنيه)", type: "text" },
      { key: "subscription_currency", label: "العملة", type: "text" },
      { key: "subscription_whatsapp", label: "رقم واتساب الاشتراك", type: "text" },
      { key: "subscription_default_message", label: "رسالة الاشتراك الافتراضية", type: "textarea" },
    ]},
    { title: "إعدادات الصيانة", icon: Wrench, fields: [
      { key: "maintenance_mode", label: "وضع الصيانة (true/false)", type: "text" },
      { key: "maintenance_message", label: "رسالة الصيانة", type: "textarea" },
    ]},
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2"><Settings className="h-6 w-6" />الإعدادات</h2>
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Save className="h-4 w-4 ml-2" />}
          حفظ الإعدادات
        </Button>
      </div>
      {settingsGroups.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <group.icon className="h-5 w-5" />
              {group.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {group.fields.map((field) => (
              <div key={field.key}>
                <Label>{field.label}</Label>
                {field.type === "textarea" ? (
                  <Textarea value={settings[field.key] || ""} onChange={(e) => updateSetting(field.key, e.target.value)} />
                ) : (
                  <Input value={settings[field.key] || ""} onChange={(e) => updateSetting(field.key, e.target.value)} />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AdminDashboard;