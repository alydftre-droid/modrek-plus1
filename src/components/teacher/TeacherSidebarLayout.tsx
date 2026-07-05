import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Bell,
  BookOpen,
  Home,
  Loader2,
  MessageSquare,
} from "lucide-react";
import TeacherAccountSheet from "./TeacherAccountSheet";
import { reportTeacherScopedStudentIds } from "@/lib/testStudentLeakGuard";

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
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [teacherCode, setTeacherCode] = useState<string | null>(null);
  const [legacyArabicPromptOpen, setLegacyArabicPromptOpen] = useState(false);
  const [legacyTeacherRequestId, setLegacyTeacherRequestId] = useState<string | null>(null);
  const [legacyArabicEducationType, setLegacyArabicEducationType] = useState<"عام" | "أزهر" | "">("");
  const [savingLegacyArabicEducationType, setSavingLegacyArabicEducationType] = useState(false);
  const [hasResolvedLegacyArabicType, setHasResolvedLegacyArabicType] = useState(false);

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

    let cancelled = false;

    (async () => {
      const [{ data: requestRows, error: requestError }, { data: assignmentRows, error: assignmentError }, { data: profileRow, error: profileError }] = await Promise.all([
        supabase
          .from("teacher_requests")
          .select("id, assigned_category, education_type, created_at")
          .eq("user_id", user.id)
          .eq("status", "approved")
          .order("created_at", { ascending: false }),
        supabase
          .from("teacher_assignments")
          .select("education_type, category")
          .eq("teacher_id", user.id),
        supabase
          .from("profiles")
          .select("education_type")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (requestError || assignmentError || profileError) {
        console.error("Error checking legacy Arabic education type:", requestError || assignmentError || profileError);
        return;
      }

      const arabicRequest = (requestRows || []).find((row) => ["المواد العربية", "arabic", "لغة عربية"].includes((row.assigned_category || "").trim()));
      const hasArabicAssignment = (assignmentRows || []).some((row) => ["المواد العربية", "arabic", "لغة عربية"].includes((row.category || "").trim()));
      const savedEducationType =
        ((profileRow as { education_type?: string | null } | null)?.education_type || "").trim()
        || ((arabicRequest as { education_type?: string | null } | undefined)?.education_type || "").trim()
        || ((assignmentRows || []).find((row) => ["المواد العربية", "arabic", "لغة عربية"].includes((row.category || "").trim()) && row.education_type)?.education_type || "").trim();

      const shouldPrompt = Boolean((arabicRequest || hasArabicAssignment) && !savedEducationType);

      setHasResolvedLegacyArabicType(Boolean(savedEducationType));
      setLegacyArabicEducationType(savedEducationType === "عام" || savedEducationType === "أزهر" ? savedEducationType : "");
      setLegacyTeacherRequestId(shouldPrompt ? arabicRequest?.id || null : null);
      setLegacyArabicPromptOpen(shouldPrompt);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, location.pathname]);

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

      const { data: unreadRows } = await supabase
        .from("teacher_messages")
        .select("student_id")
        .eq("teacher_id", user.id)
        .eq("is_from_teacher", false)
        .eq("is_read", false)
        .limit(50);
      reportTeacherScopedStudentIds("teacher_messages", (unreadRows || []).map((row) => row.student_id), {
        component: "TeacherSidebarLayout.unreadMessages",
      });
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

  const handleSaveLegacyArabicEducationType = async () => {
    if (!user || !legacyArabicEducationType) return;

    setSavingLegacyArabicEducationType(true);

    try {
      const [requestUpdate, assignmentUpdate, profileUpdate] = await Promise.all([
        supabase
          .from("teacher_requests")
          .update({ education_type: legacyArabicEducationType })
          .eq("user_id", user.id)
          .eq("status", "approved")
          .in("assigned_category", ["المواد العربية", "arabic", "لغة عربية"]),
        supabase
          .from("teacher_assignments")
          .update({ education_type: legacyArabicEducationType })
          .eq("teacher_id", user.id)
          .in("category", ["المواد العربية", "arabic", "لغة عربية"]),
        supabase
          .from("profiles")
          .update({ education_type: legacyArabicEducationType })
          .eq("id", user.id),
      ]);

      if (requestUpdate.error) throw requestUpdate.error;
      if (assignmentUpdate.error) console.error("Error updating Arabic assignments:", assignmentUpdate.error);
      if (profileUpdate.error) throw profileUpdate.error;

      await queryClient.invalidateQueries({ queryKey: ["teacher-assignments", user.id] });
      setHasResolvedLegacyArabicType(true);
      setLegacyArabicEducationType(legacyArabicEducationType);
      setLegacyTeacherRequestId(null);
      setLegacyArabicPromptOpen(false);
    } catch (error) {
      console.error("Error saving Arabic education type:", error);
    } finally {
      setSavingLegacyArabicEducationType(false);
    }
  };

  return (
    <div className="mobile-app-shell flex bg-background" dir="rtl">
      <Dialog open={legacyArabicPromptOpen && !hasResolvedLegacyArabicType}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>حدد نوع شرح اللغة العربية</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">اختر مرة واحدة هل أنت معلم عربي عام أم معلم عربي أزهر حتى تظهر للطلاب الصحيحين فقط.</p>
            <RadioGroup value={legacyArabicEducationType} onValueChange={(value) => setLegacyArabicEducationType(value as "عام" | "أزهر")} className="space-y-3">
              <label className="flex items-center gap-3 rounded-xl border border-border p-3 cursor-pointer">
                <RadioGroupItem value="عام" id="legacy-arabic-general" />
                <Label htmlFor="legacy-arabic-general" className="cursor-pointer">معلم عربي عام</Label>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-border p-3 cursor-pointer">
                <RadioGroupItem value="أزهر" id="legacy-arabic-azhar" />
                <Label htmlFor="legacy-arabic-azhar" className="cursor-pointer">معلم عربي أزهر</Label>
              </label>
            </RadioGroup>
            <Button onClick={handleSaveLegacyArabicEducationType} disabled={!legacyArabicEducationType || savingLegacyArabicEducationType} className="w-full">
              {savingLegacyArabicEducationType && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حفظ ومتابعة
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header - matching student style */}
        <header className="mobile-app-header sticky z-30 border-b border-border/50 bg-background/85 backdrop-blur-xl">
          <div className="mobile-app-header-inner flex items-center justify-between px-3">
            <div className="flex min-w-0 items-center gap-2">
            <button onClick={() => setAccountSheetOpen(true)} className="shrink-0">
              <Avatar className="h-8 w-8 border-2 border-primary/30 shadow-sm">
                <AvatarImage src={teacherAvatar || ""} />
                <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">{initials}</AvatarFallback>
              </Avatar>
            </button>
              {title && !hideHeaderTitle && <h1 className="truncate text-sm font-bold text-foreground">{title}</h1>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
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
          </div>
        </header>

        <main className="flex-1 min-w-0 overflow-y-auto overscroll-y-auto touch-pan-y pb-[calc(60px+env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch] lg:pb-0">{children}</main>

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
