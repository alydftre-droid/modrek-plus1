import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Home, User, BookOpen, Wallet, Bell, Settings, MessageSquare, LogOut, X, ChevronLeft, GraduationCap,
} from "lucide-react";

const navItems = [
  { label: "الصفحة الرئيسية", icon: Home, path: "/teacher" },
  { label: "المواد الدراسية", icon: BookOpen, path: "/teacher/subjects" },
  { label: "التواصل مع الطلبة", icon: MessageSquare, path: "/teacher/messages", badgeKey: "messages" },
  { label: "المحفظة", icon: Wallet, path: "/teacher/wallet" },
  { label: "السيرة الذاتية", icon: User, path: "/teacher/profile" },
  { label: "الإشعارات", icon: Bell, path: "/teacher/notifications" },
  { label: "الإعدادات", icon: Settings, path: "/teacher/settings" },
];

interface Props {
  children: React.ReactNode;
  title?: string;
  teacherName?: string;
  hideHeaderTitle?: boolean;
  teacherAvatar?: string | null;
}

export default function TeacherSidebarLayout({ children, title, teacherName, hideHeaderTitle, teacherAvatar }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  useEffect(() => {
    const handleOpenSidebar = () => setSidebarOpen(true);
    window.addEventListener('open-teacher-sidebar', handleOpenSidebar);
    return () => window.removeEventListener('open-teacher-sidebar', handleOpenSidebar);
  }, []);

  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      const { count } = await supabase
        .from("teacher_messages")
        .select("*", { count: "exact", head: true })
        .eq("teacher_id", user.id)
        .eq("is_from_teacher", false)
        .eq("is_read", false);
      setUnreadMessages(count || 0);
    };
    const fetchNotifs = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      setUnreadNotifs(count || 0);
    };
    fetchUnread();
    fetchNotifs();
    const channel = supabase
      .channel("teacher-unread-sidebar")
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_messages", filter: `teacher_id=eq.${user.id}` }, fetchUnread)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, fetchNotifs)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const handleSignOut = async () => { await signOut(); navigate("/auth"); };

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={cn(
        "fixed top-0 right-0 h-full w-72 z-50 transition-transform duration-300 flex flex-col shadow-2xl",
        "lg:relative lg:translate-x-0 lg:z-auto",
        sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )}>
        {/* Sidebar background */}
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(158,64%,28%)] via-[hsl(158,55%,22%)] to-[hsl(158,50%,16%)] rounded-l-2xl" />
        
        {/* Header */}
        <div className="relative flex items-center justify-between p-5 border-b border-white/10">
          <Link to="/teacher" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-inner">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold text-white tracking-wide">أزهاريون</span>
              <p className="text-[11px] text-white/50 font-medium">لوحة المعلم</p>
            </div>
          </Link>
          <Button variant="ghost" size="icon" className="lg:hidden text-white/80 hover:bg-white/10 rounded-xl" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Teacher Profile - Clickable */}
        {teacherName && (
          <button
            onClick={() => { navigate("/teacher/edit-profile"); setSidebarOpen(false); }}
            className="relative mx-3 mt-3 p-3 rounded-2xl bg-white/10 backdrop-blur-sm hover:bg-white/15 transition-all duration-200 group"
          >
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-white/25 to-white/10 flex items-center justify-center overflow-hidden shadow-lg ring-2 ring-white/20">
                {teacherAvatar ? (
                  <img src={teacherAvatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-5 w-5 text-white" />
                )}
              </div>
              <div className="text-right flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{teacherName}</p>
                <p className="text-[11px] text-emerald-200/70 font-medium">معلم — اضغط لتعديل الملف</p>
              </div>
              <ChevronLeft className="h-4 w-4 text-white/40 group-hover:text-white/70 transition-colors shrink-0" />
            </div>
          </button>
        )}

        {/* Navigation */}
        <nav className="relative flex-1 overflow-y-auto p-3 mt-1 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const badge = item.badgeKey === "messages" ? unreadMessages : 0;
            return (
              <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-white/20 text-white shadow-lg backdrop-blur-sm ring-1 ring-white/20"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}>
                <div className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                  isActive ? "bg-white/20" : "bg-white/5"
                )}>
                  <item.icon className="h-4 w-4" />
                </div>
                <span className="flex-1">{item.label}</span>
                {badge > 0 && (
                  <Badge className="bg-red-500 text-white text-[10px] h-5 min-w-[20px] p-0 flex items-center justify-center rounded-full border-0 shadow-md">
                    {badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sign Out */}
        <div className="relative p-3 border-t border-white/10">
          <button onClick={handleSignOut}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-200 hover:bg-red-500/20 w-full transition-all duration-200">
            <div className="h-8 w-8 rounded-lg bg-red-500/15 flex items-center justify-center">
              <LogOut className="h-4 w-4" />
            </div>
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 border-b border-border bg-background/90 backdrop-blur-xl">
          {/* Teacher Avatar → opens sidebar */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="h-10 w-10 rounded-full bg-gradient-to-br from-[hsl(158,64%,28%)] to-[hsl(158,55%,22%)] flex items-center justify-center overflow-hidden ring-2 ring-background shadow-md shrink-0"
          >
            {teacherAvatar ? (
              <img src={teacherAvatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-white font-bold text-sm">{teacherName?.charAt(0) || "م"}</span>
            )}
          </button>

          {/* Center Logo */}
          <Link to="/teacher" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[hsl(158,64%,28%)] to-[hsl(158,55%,22%)]">
              <BookOpen className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-bold text-foreground">أزهاريون</span>
          </Link>

          {/* Notifications */}
          <button
            onClick={() => navigate("/teacher/notifications")}
            className="relative h-10 w-10 rounded-full bg-accent flex items-center justify-center hover:bg-accent/80 transition-colors shrink-0"
          >
            <Bell className="h-5 w-5 text-foreground" />
            {unreadNotifs > 0 && (
              <span className="absolute -top-0.5 -left-0.5 h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md">
                {unreadNotifs > 9 ? "9+" : unreadNotifs}
              </span>
            )}
          </button>
        </header>

        {title && !hideHeaderTitle && (
          <div className="px-4 py-2 border-b border-border">
            <h1 className="text-base font-bold truncate">{title}</h1>
          </div>
        )}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
