import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Home, User, BookOpen, Wallet, Bell, Settings, MessageSquare, LogOut, X, GraduationCap, ChevronLeft, Briefcase,
} from "lucide-react";

const navItems = [
  { label: "الصفحة الرئيسية", icon: Home, path: "/teacher", color: "bg-blue-500 text-white", badgeKey: null },
  { label: "المواد الدراسية", icon: BookOpen, path: "/teacher/subjects", color: "bg-teal-500 text-white", badgeKey: null },
  { label: "التواصل مع الطلبة", icon: MessageSquare, path: "/teacher/messages", color: "bg-purple-500 text-white", badgeKey: "messages" },
  { label: "المحفظة", icon: Wallet, path: "/teacher/wallet", color: "bg-amber-400 text-white", badgeKey: null },
  { label: "السيرة الذاتية", icon: Briefcase, path: "/teacher/profile", color: "bg-teal-500 text-white", badgeKey: null },
  { label: "الإشعارات", icon: Bell, path: "/teacher/notifications", color: "bg-red-400 text-white", badgeKey: null },
  { label: "الإعدادات", icon: Settings, path: "/teacher/settings", color: "bg-sky-600 text-white", badgeKey: null },
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

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 right-0 h-full w-[280px] z-50 transition-transform duration-300 flex flex-col overflow-hidden",
        "bg-gradient-to-b from-slate-50 to-slate-100/80 dark:from-slate-900 dark:to-slate-800/80",
        "lg:relative lg:translate-x-0 lg:z-auto",
        sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )}>
        {/* Blue gradient header */}
        <div className="relative bg-gradient-to-l from-blue-500 via-blue-600 to-indigo-600 px-4 pt-4 pb-16 rounded-b-[28px]">
          <div className="flex items-center justify-between mb-1">
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden h-8 w-8 flex items-center justify-center text-white/80 hover:text-white">
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <div>
                <h2 className="text-lg font-bold text-white text-left">أزهاريون</h2>
                <p className="text-[10px] text-blue-100 text-left">لوحة المعلم</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Teacher profile - overlapping the header */}
        <div className="-mt-10 mx-4 mb-2">
          <button
            onClick={() => { setSidebarOpen(false); navigate("/teacher/settings/account"); }}
            className="w-full flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-md hover:shadow-lg transition-shadow"
          >
            <div className="text-right flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{teacherName || "المعلم"}</p>
              <p className="text-[10px] text-muted-foreground">عرض الملف الشخصي</p>
            </div>
            <div className="relative shrink-0">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center overflow-hidden ring-3 ring-white dark:ring-slate-800">
                {teacherAvatar ? (
                  <img src={teacherAvatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-white font-bold text-lg">{teacherName?.charAt(0) || "م"}</span>
                )}
              </div>
              <div className="absolute -bottom-0.5 -left-0.5 h-4.5 w-4.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800 flex items-center justify-center">
                <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
              </div>
            </div>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {navItems.map((item, idx) => {
            const isActive = location.pathname === item.path;
            const badge = item.badgeKey === "messages" ? unreadMessages : 0;
            return (
              <div key={item.path}>
                <Link
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-200",
                    isActive
                      ? "bg-white dark:bg-slate-700 shadow-md"
                      : "hover:bg-white/60 dark:hover:bg-slate-700/50"
                  )}
                >
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", item.color)}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  <span className={cn("flex-1 text-right", isActive ? "text-foreground" : "text-muted-foreground")}>{item.label}</span>
                  {badge > 0 && (
                    <Badge className="bg-destructive text-destructive-foreground text-[10px] h-5 min-w-[20px] p-0 flex items-center justify-center rounded-full border-0">
                      {badge}
                    </Badge>
                  )}
                  {isActive && <ChevronLeft className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
                </Link>
                {idx < navItems.length - 1 && !isActive && (
                  <div className="mx-4 border-b border-border/30" />
                )}
              </div>
            );
          })}
        </nav>

        {/* Sign Out */}
        <div className="p-3">
          <button
            onClick={handleSignOut}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 shadow-sm hover:shadow-md text-destructive font-semibold text-sm transition-all"
          >
            <LogOut className="h-4.5 w-4.5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 border-b border-border bg-background/90 backdrop-blur-xl">
          <button
            onClick={() => setSidebarOpen(true)}
            className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center overflow-hidden ring-2 ring-border shadow-sm shrink-0"
          >
            {teacherAvatar ? (
              <img src={teacherAvatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-white font-bold text-sm">{teacherName?.charAt(0) || "م"}</span>
            )}
          </button>

          <Link to="/teacher" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
              <BookOpen className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-bold text-foreground">أزهاريون</span>
          </Link>

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
