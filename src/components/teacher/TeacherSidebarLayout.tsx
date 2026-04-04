import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Bell,
  BookOpen,
  Briefcase,
  ChevronLeft,
  GraduationCap,
  Home,
  LogOut,
  MessageSquare,
  Settings,
  Wallet,
  X,
} from "lucide-react";

interface Props {
  children: React.ReactNode;
  title?: string;
  teacherName?: string;
  hideHeaderTitle?: boolean;
  teacherAvatar?: string | null;
}

interface NavItem {
  label: string;
  icon: typeof Home;
  path: string;
  tone: string;
  badgeKey?: "messages" | "notifications";
}

const navItems: NavItem[] = [
  { label: "الصفحة الرئيسية", icon: Home, path: "/teacher", tone: "bg-teacher-home", },
  { label: "المواد الدراسية", icon: BookOpen, path: "/teacher/subjects", tone: "bg-teacher-subjects", },
  { label: "التواصل مع الطلبة", icon: MessageSquare, path: "/teacher/messages", tone: "bg-teacher-messages", badgeKey: "messages" },
  { label: "المحفظة", icon: Wallet, path: "/teacher/wallet", tone: "bg-teacher-wallet", },
  { label: "السيرة الذاتية", icon: Briefcase, path: "/teacher/profile", tone: "bg-teacher-profile", },
  { label: "الإشعارات", icon: Bell, path: "/teacher/notifications", tone: "bg-teacher-notifications", badgeKey: "notifications" },
  { label: "الإعدادات", icon: Settings, path: "/teacher/settings", tone: "bg-teacher-settings", },
];

export default function TeacherSidebarLayout({
  children,
  title,
  teacherName,
  hideHeaderTitle,
  teacherAvatar,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  useEffect(() => {
    const handleOpenSidebar = () => setSidebarOpen(true);
    window.addEventListener("open-teacher-sidebar", handleOpenSidebar);
    return () => window.removeEventListener("open-teacher-sidebar", handleOpenSidebar);
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teacher_messages", filter: `teacher_id=eq.${user.id}` },
        fetchUnread,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        fetchNotifs,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const displayName = teacherName?.trim() || "المعلم";
  const displayLetter = displayName.charAt(0) || "م";

  const sidebarItems = useMemo(
    () =>
      navItems.map((item) => ({
        ...item,
        badge:
          item.badgeKey === "messages"
            ? unreadMessages
            : item.badgeKey === "notifications"
              ? unreadNotifs
              : 0,
      })),
    [unreadMessages, unreadNotifs],
  );

  return (
    <div className="flex min-h-screen bg-teacher-shell" dir="rtl">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="إغلاق القائمة الجانبية"
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-full w-[312px] max-w-[86vw] flex-col overflow-hidden border-l border-teacher-border bg-teacher-surface shadow-[0_24px_60px_hsl(var(--teacher-sidebar-shadow)/0.22)] transition-transform duration-300 lg:relative lg:translate-x-0 lg:shadow-none",
          sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
      >
        <div className="relative overflow-hidden rounded-bl-[40px] bg-gradient-to-bl from-[hsl(var(--teacher-sidebar-header-start))] to-[hsl(var(--teacher-sidebar-header-end))] px-5 pb-20 pt-5">
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[hsl(var(--teacher-sidebar-header-glow)/0.9)] to-transparent" />
          <div className="absolute -left-8 top-12 h-24 w-24 rounded-full bg-white/10 blur-2xl" />

          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-[1.35rem] bg-white/12 shadow-inner shadow-white/15 backdrop-blur-md">
                <GraduationCap className="h-7 w-7 text-white" />
              </div>
              <div className="space-y-1 text-right">
                <p className="text-[2rem] font-extrabold leading-none tracking-tight text-white">أزهاريون</p>
                <p className="text-sm font-medium text-white/78">لوحة المعلم</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/90 transition hover:bg-white/20 lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="relative z-10 -mt-14 px-5">
          <button
            onClick={() => {
              setSidebarOpen(false);
              navigate("/teacher/settings/account");
            }}
            className="flex w-full items-center gap-4 rounded-[2rem] border border-white/70 bg-card px-4 py-4 text-right shadow-[0_18px_40px_hsl(var(--teacher-sidebar-shadow)/0.16)] transition-transform duration-200 hover:-translate-y-0.5"
          >
            <div className="relative shrink-0">
              <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[hsl(var(--teacher-sidebar-header-start))] to-[hsl(var(--teacher-sidebar-header-end))] ring-4 ring-background">
                {teacherAvatar ? (
                  <img src={teacherAvatar} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xl font-extrabold text-white">{displayLetter}</span>
                )}
              </div>
              <span className="absolute bottom-0 left-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-teacher-success text-[0.625rem] text-white">
                ✓
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-extrabold text-teacher-strong">{displayName}</p>
              <p className="mt-1 text-sm font-medium text-teacher-soft">عرض الملف الشخصي</p>
            </div>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-5 pb-5 pt-5">
          <div className="space-y-3">
            {sidebarItems.map((item) => {
              const isActive = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "group flex items-center gap-4 rounded-[1.9rem] border px-3 py-3.5 transition-all duration-200",
                    isActive
                      ? "border-teacher-active-border bg-teacher-active shadow-[0_16px_34px_hsl(var(--teacher-sidebar-shadow)/0.14)]"
                      : "border-transparent bg-transparent hover:border-teacher-border hover:bg-background/70",
                  )}
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.4rem] bg-card shadow-[0_12px_30px_hsl(var(--teacher-sidebar-shadow)/0.12)]">
                    <div className={cn("flex h-11 w-11 items-center justify-center rounded-[1.1rem] text-white shadow-sm", item.tone)}>
                      <item.icon className="h-5 w-5" />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 text-right">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-[1.05rem] font-bold", isActive ? "text-teacher-strong" : "text-teacher-text")}>{item.label}</span>
                      {isActive ? (
                        <ChevronLeft className="h-5 w-5 shrink-0 text-teacher-soft" />
                      ) : null}
                    </div>
                    <div className="mt-1 h-px w-full bg-gradient-to-l from-transparent via-border/60 to-transparent" />
                  </div>

                  {item.badge ? (
                    <Badge className="absolute left-5 top-3 flex h-5 min-w-[1.5rem] items-center justify-center rounded-full border-0 bg-destructive px-1 text-[0.65rem] font-bold text-destructive-foreground shadow-sm">
                      {item.badge > 99 ? "+99" : item.badge}
                    </Badge>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="px-5 pb-5 pt-2">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center justify-center gap-3 rounded-[1.9rem] border border-transparent bg-card px-4 py-4 text-lg font-bold text-teacher-logout shadow-[0_16px_34px_hsl(var(--teacher-sidebar-shadow)/0.14)] transition-transform duration-200 hover:-translate-y-0.5"
          >
            <LogOut className="h-5 w-5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur-xl">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-teacher-border bg-card shadow-sm lg:hidden"
          >
            {teacherAvatar ? (
              <img src={teacherAvatar} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-extrabold text-teacher-strong">{displayLetter}</span>
            )}
          </button>

          <Link to="/teacher" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(var(--teacher-sidebar-header-start))] to-[hsl(var(--teacher-sidebar-header-end))] shadow-sm">
              <BookOpen className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="text-base font-extrabold text-teacher-strong">أزهاريون</span>
          </Link>

          <button
            onClick={() => navigate("/teacher/notifications")}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card shadow-sm transition hover:bg-accent"
          >
            <Bell className="h-5 w-5 text-teacher-strong" />
            {unreadNotifs > 0 ? (
              <span className="absolute -left-1 -top-1 flex h-5 min-w-[1.4rem] items-center justify-center rounded-full bg-destructive px-1 text-[0.65rem] font-bold text-destructive-foreground shadow-sm">
                {unreadNotifs > 9 ? "9+" : unreadNotifs}
              </span>
            ) : null}
          </button>
        </header>

        {title && !hideHeaderTitle ? (
          <div className="border-b border-border/60 px-4 py-2.5">
            <h1 className="truncate text-base font-extrabold text-teacher-strong">{title}</h1>
          </div>
        ) : null}

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
