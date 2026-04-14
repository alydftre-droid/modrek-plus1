import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Bell,
  BookOpen,
  Home,
  MessageSquare,
} from "lucide-react";
import TeacherAccountSheet from "./TeacherAccountSheet";

const bottomNavItems = [
  { to: "/teacher", icon: Home, label: "الرئيسية" },
  { to: "/teacher/subjects", icon: BookOpen, label: "المواد" },
  { to: "/teacher/messages", icon: MessageSquare, label: "الرسائل" },
];

interface Props {
  children: React.ReactNode;
  title?: string;
  teacherName?: string;
  hideHeaderTitle?: boolean;
  teacherAvatar?: string | null;
}

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
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [teacherCode, setTeacherCode] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("teacher_code")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setTeacherCode(data.teacher_code);
      });
  }, [user]);

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
  const initials = displayName.split(" ").map((n) => n[0]).join("").slice(0, 2) || "م";

  return (
    <div className="flex min-h-screen bg-background" dir="rtl">
      <TeacherAccountSheet
        open={accountSheetOpen}
        onOpenChange={setAccountSheetOpen}
        teacherName={displayName}
        teacherAvatar={teacherAvatar}
        teacherCode={teacherCode}
        unreadMessages={unreadMessages}
        unreadNotifs={unreadNotifs}
        onSignOut={handleSignOut}
      />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Header - matching student style */}
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border/50 bg-background/85 px-3 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <button onClick={() => setAccountSheetOpen(true)} className="shrink-0">
              <Avatar className="h-8 w-8 border-2 border-primary/30 shadow-sm">
                <AvatarImage src={teacherAvatar || ""} />
                <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">{initials}</AvatarFallback>
              </Avatar>
            </button>
            {title && !hideHeaderTitle && <h1 className="truncate text-sm font-bold text-foreground">{title}</h1>}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate("/teacher/notifications")}
              className="relative flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent"
            >
              <Bell className="h-4.5 w-4.5" />
              {unreadNotifs > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[0.55rem] font-bold text-destructive-foreground">
                  {unreadNotifs > 9 ? "9+" : unreadNotifs}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-[60px] lg:pb-0">{children}</main>

        {/* Bottom Nav - matching student style */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden">
          <div className="border-t border-border/40 bg-card/90 backdrop-blur-2xl shadow-[0_-4px_20px_hsl(var(--foreground)/0.06)]">
            <div className="safe-area-bottom flex items-center justify-around px-2 py-1.5">
              {bottomNavItems.map((item) => {
                const isActive = location.pathname === item.to || (item.to !== "/teacher" && location.pathname.startsWith(item.to + "/"));
                const isExactActive = item.to === "/teacher" && location.pathname === "/teacher";
                const active = isActive || isExactActive;
                const badge = item.to === "/teacher/messages" ? unreadMessages : 0;

                return (
                  <Link key={item.to} to={item.to} className="relative flex min-w-[60px] flex-col items-center gap-0.5 px-3 py-1">
                    {active && (
                      <motion.div
                        layoutId="teacherNavGlow"
                        className="absolute top-0 h-8 w-8 rounded-full bg-primary/20 blur-lg"
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                      />
                    )}
                    <motion.div
                      animate={{
                        scale: active ? 1.12 : 1,
                        y: active ? -4 : 0,
                      }}
                      transition={{ type: "spring", stiffness: 320, damping: 22 }}
                      className={cn(
                        "relative flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-200",
                        active
                          ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/25"
                          : "bg-transparent text-muted-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4" strokeWidth={active ? 2.5 : 2} />
                      {badge > 0 && !active && (
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-0.5 text-[0.5rem] font-bold text-destructive-foreground">
                          {badge > 9 ? "9+" : badge}
                        </span>
                      )}
                    </motion.div>
                    <motion.span
                      animate={{ opacity: active ? 1 : 0.55, scale: active ? 1.05 : 1 }}
                      className={cn("text-[9px] font-medium", active ? "font-extrabold text-primary" : "text-muted-foreground")}
                    >
                      {item.label}
                    </motion.span>
                    {active && (
                      <motion.div
                        layoutId="teacherBottomNavIndicator"
                        className="absolute -top-0.5 h-[2px] w-8 rounded-full bg-gradient-to-r from-primary/60 via-primary to-primary/60"
                        transition={{ type: "spring", stiffness: 400, damping: 28 }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}
