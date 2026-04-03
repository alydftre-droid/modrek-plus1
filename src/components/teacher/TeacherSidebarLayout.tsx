import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Home, User, BookOpen, Wallet, Bell, Settings, MessageSquare, LogOut, Menu, X, ChevronLeft, GraduationCap,
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
}

export default function TeacherSidebarLayout({ children, title, teacherName, hideHeaderTitle }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

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
    fetchUnread();
    const channel = supabase
      .channel("teacher-unread-sidebar")
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_messages", filter: `teacher_id=eq.${user.id}` }, fetchUnread)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const handleSignOut = async () => { await signOut(); navigate("/auth"); };

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={cn(
        "fixed top-0 right-0 h-full w-64 z-50 transition-transform duration-300 flex flex-col",
        "lg:relative lg:translate-x-0 lg:z-auto",
        sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )} style={{ background: "linear-gradient(180deg, hsl(217 91% 48%) 0%, hsl(258 80% 50%) 100%)" }}>
        <div className="flex items-center justify-between p-4 border-b border-primary-foreground/10">
          <Link to="/teacher" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary-foreground/20 flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <span className="text-base font-bold text-primary-foreground">أزهاريون</span>
              <p className="text-[10px] text-primary-foreground/60">لوحة المعلم</p>
            </div>
          </Link>
          <Button variant="ghost" size="icon" className="lg:hidden text-primary-foreground hover:bg-primary-foreground/10" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {teacherName && (
          <div className="px-4 py-3 border-b border-primary-foreground/10">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                <User className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm font-bold text-primary-foreground truncate max-w-[140px]">{teacherName}</p>
                <p className="text-[10px] text-primary-foreground/50">معلم</p>
              </div>
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const badge = item.badgeKey === "messages" ? unreadMessages : 0;
            return (
              <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary-foreground/15 text-primary-foreground ring-1 ring-primary-foreground/25 shadow-md"
                    : "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
                )}>
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {badge > 0 && (
                  <Badge className="bg-red-500 text-white text-[10px] h-5 min-w-[20px] p-0 flex items-center justify-center rounded-full border-0">
                    {badge}
                  </Badge>
                )}
                {isActive && <ChevronLeft className="h-4 w-4 mr-auto" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-2 border-t border-primary-foreground/10">
          <button onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-300 hover:bg-red-500/20 w-full transition-colors">
            <LogOut className="h-5 w-5 shrink-0" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 h-14 px-4 border-b border-border bg-background/80 backdrop-blur-xl">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          {title && <h1 className="text-base font-bold truncate">{title}</h1>}
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
