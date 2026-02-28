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
} from "lucide-react";

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
  { id: "teachers", label: "المعلمين", icon: GraduationCap },
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

          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setSidebarOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-2 lg:gap-3 px-3 lg:px-4 py-2 lg:py-3 rounded-lg text-xs lg:text-sm font-medium transition-all",
                activeTab === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4 lg:h-5 lg:w-5 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
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
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "students" && <StudentsTab />}
        {activeTab === "teachers" && <TeachersTab />}
        {activeTab === "subscriptions" && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">الاشتراكات</h2>
            <Button onClick={() => navigate("/admin/subscriptions")} className="gap-2">
              <CreditCard className="h-5 w-5" />
              إدارة الاشتراكات
            </Button>
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
const OverviewTab = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    pendingTeachers: 0,
    totalSubjects: 0,
    totalVideos: 0,
    totalPdfs: 0,
    unreadSupport: 0,
    // Subscription stats
    totalActiveSubscriptions: 0,
    totalSubscribedStudents: 0,
    expiringSoon: 0,
    expiredRecently: 0,
    expectedRevenue: 0,
  });
  const [subscriptionPrice, setSubscriptionPrice] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Get students count
        const { count: studentsCount } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true });

        // Get teachers count (approved)
        const { count: teachersCount } = await supabase
          .from("user_roles")
          .select("*", { count: "exact", head: true })
          .eq("role", "teacher");

        // Get pending teacher requests
        const { count: pendingCount } = await supabase
          .from("teacher_requests")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending");

        // Get subjects count
        const { count: subjectsCount } = await supabase
          .from("subjects")
          .select("*", { count: "exact", head: true });

        // Get videos count
        const { count: videosCount } = await supabase
          .from("content")
          .select("*", { count: "exact", head: true })
          .eq("type", "video");

        // Get PDFs count
        const { count: pdfsCount } = await supabase
          .from("content")
          .select("*", { count: "exact", head: true })
          .eq("type", "pdf");

        // Get unread support messages
        const { count: unreadCount } = await supabase
          .from("support_messages")
          .select("*", { count: "exact", head: true })
          .eq("is_from_admin", false)
          .eq("is_read", false);

        // Get subscription stats
        const now = new Date();
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Active subscriptions
        const { data: activeSubscriptions } = await supabase
          .from("subscriptions")
          .select("student_id, end_date")
          .eq("is_active", true)
          .gt("end_date", now.toISOString());

        const totalActiveSubscriptions = activeSubscriptions?.length || 0;
        const uniqueStudents = new Set(activeSubscriptions?.map(s => s.student_id) || []);
        const totalSubscribedStudents = uniqueStudents.size;

        // Expiring soon (within 7 days)
        const expiringSoon = activeSubscriptions?.filter(s => {
          const endDate = new Date(s.end_date);
          return endDate <= sevenDaysFromNow && endDate > now;
        }).length || 0;

        // Expired recently (last 7 days)
        const { count: expiredCount } = await supabase
          .from("subscriptions")
          .select("*", { count: "exact", head: true })
          .lt("end_date", now.toISOString())
          .gt("end_date", sevenDaysAgo.toISOString());

        // Get subscription price for revenue calculation
        const { data: priceData } = await supabase
          .from("platform_settings")
          .select("value")
          .eq("key", "subscription_default_price")
          .single();

        const price = parseFloat(priceData?.value || "100");
        setSubscriptionPrice(price);
        const expectedRevenue = totalActiveSubscriptions * price;

        setStats({
          totalStudents: studentsCount || 0,
          totalTeachers: teachersCount || 0,
          pendingTeachers: pendingCount || 0,
          totalSubjects: subjectsCount || 0,
          totalVideos: videosCount || 0,
          totalPdfs: pdfsCount || 0,
          unreadSupport: unreadCount || 0,
          totalActiveSubscriptions,
          totalSubscribedStudents,
          expiringSoon,
          expiredRecently: expiredCount || 0,
          expectedRevenue,
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
    { title: "إجمالي الطلاب", value: stats.totalStudents, icon: Users, color: "text-blue-500" },
    { title: "إجمالي المعلمين", value: stats.totalTeachers, icon: GraduationCap, color: "text-green-500" },
    { title: "طلبات المعلمين المعلقة", value: stats.pendingTeachers, icon: AlertTriangle, color: "text-yellow-500" },
    { title: "عدد المواد", value: stats.totalSubjects, icon: BookOpen, color: "text-purple-500" },
    { title: "عدد الفيديوهات", value: stats.totalVideos, icon: Video, color: "text-red-500" },
    { title: "عدد ملفات PDF", value: stats.totalPdfs, icon: FileText, color: "text-orange-500" },
    { title: "رسائل الدعم غير المقروءة", value: stats.unreadSupport, icon: MessageSquare, color: "text-pink-500" },
  ];

  const subscriptionCards = [
    { 
      title: "الاشتراكات النشطة", 
      value: stats.totalActiveSubscriptions, 
      icon: CreditCard, 
      color: "bg-emerald-500",
      description: "إجمالي الاشتراكات الفعالة"
    },
    { 
      title: "الطلاب المشتركين", 
      value: stats.totalSubscribedStudents, 
      icon: Users, 
      color: "bg-blue-500",
      description: "عدد الطلاب الذين لديهم اشتراك نشط"
    },
    { 
      title: "تنتهي قريباً", 
      value: stats.expiringSoon, 
      icon: Clock,
      color: "bg-amber-500",
      description: "اشتراكات تنتهي خلال 7 أيام"
    },
    { 
      title: "انتهت مؤخراً", 
      value: stats.expiredRecently, 
      icon: AlertTriangle, 
      color: "bg-red-500",
      description: "اشتراكات انتهت خلال 7 أيام"
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4 lg:space-y-6 w-full max-w-full">
        <h2 className="text-xl lg:text-2xl font-bold">نظرة عامة</h2>
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-4">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-24 lg:h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-8 w-full max-w-full">
      <h2 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
        <BarChart3 className="h-5 w-5 lg:h-6 lg:w-6 flex-shrink-0" />
        <span className="truncate">نظرة عامة</span>
      </h2>

      {/* General Stats */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-4">
        {statCards.map((stat, index) => (
          <Card key={index} className="overflow-hidden">
            <CardContent className="p-3 lg:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs lg:text-sm text-muted-foreground truncate">{stat.title}</p>
                  <p className="text-xl lg:text-3xl font-bold mt-1 lg:mt-2">{stat.value}</p>
                </div>
                <stat.icon className={cn("h-6 w-6 lg:h-10 lg:w-10 flex-shrink-0", stat.color)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Subscription Stats Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg lg:text-xl font-bold flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            إحصائيات الاشتراكات
          </h3>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate("/admin/subscriptions")}
            className="gap-2"
          >
            <Settings className="h-4 w-4" />
            إدارة الاشتراكات
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {subscriptionCards.map((card, index) => (
            <Card key={index} className="overflow-hidden hover:shadow-lg transition-shadow">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs lg:text-sm text-muted-foreground truncate">{card.title}</p>
                    <p className="text-2xl lg:text-4xl font-bold mt-2">{card.value}</p>
                    <p className="text-xs text-muted-foreground mt-1 truncate hidden lg:block">{card.description}</p>
                  </div>
                  <div className={cn("p-2 lg:p-3 rounded-xl", card.color)}>
                    <card.icon className="h-5 w-5 lg:h-6 lg:w-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Revenue Card */}
        <Card className="bg-gradient-to-br from-primary/10 to-gold/10 border-primary/20">
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">الإيرادات المتوقعة</p>
                <p className="text-3xl lg:text-4xl font-bold text-primary mt-2">
                  {stats.expectedRevenue.toLocaleString("ar-EG")} جنيه
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  بناءً على {stats.totalActiveSubscriptions} اشتراك نشط × {subscriptionPrice} جنيه
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-primary/20">
                <TrendingUp className="h-8 w-8 lg:h-10 lg:w-10 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
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
// TEACHERS TAB - Uses new AdminTeacherManagement component
// ============================================
const TeachersTab = () => {
  // Dynamically import to keep this file smaller
  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    import("@/components/admin/AdminTeacherManagement").then(mod => {
      setComponent(() => mod.default);
    });
  }, []);
  
  if (!Component) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return <Component />;
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
                    </Tab