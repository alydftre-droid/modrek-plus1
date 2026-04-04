import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Home, User, BookOpen, Wallet, Bell, Settings, MessageSquare, LogOut, X, GraduationCap,
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={cn(
        "fixed top-0 right-0 h-full w-72 z-50 transition-transform duration-300 flex flex-col",
        "bg-card border-l border-border shadow-xl",
        "lg:relative lg:translate-x-0 lg:z-auto",
        sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <Link to="/teacher" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[hsl(158,64%,28%)] to-[hsl(158,55%,22%)] flex items-center justify-center">
              <GraduationCap className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <span className="text-base font-bold text-foreground">أزهاريون</span>
              <p className="text-[10px] text-muted-foreground">لوحة المعلم</p>
            </div>
          </Link>
          <Button variant="ghost" size="icon" className="lg:hidden text-muted-foreground hover:text-foreground rounded-lg h-8 w-8" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2 mt-1 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const badge = item.badgeKey === "messages" ? unreadMessages : 0;
            return (
              <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}>
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                <span className="flex-1">{item.label}</span>
                {badge > 0 && (
                  <Badge className="bg-destructive text-destructive-foreground text-[10px] h-5 min-w-[20px] p-0 flex items-center justify-center rounded-full border-0">
                    {badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sign Out */}
        <div className="p-2 border-t border-border">
          <button onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 w-full transition-all">
            <LogOut className="h-[18px] w-[18px]" />
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
            className="h-10 w-10 rounded-full bg-gradient-to-br from-[hsl(158,64%,28%)] to-[hsl(158,55%,22%)] flex items-center justify-center overflow-hidden ring-2 ring-border shadow-sm shrink-0"
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
              <span className="absolute -top-0.5 -left-0.5 h-5 min-w-[20px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shadow-md">
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
