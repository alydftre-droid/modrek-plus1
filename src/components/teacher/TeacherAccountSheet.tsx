import { Link, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Briefcase,
  Bug,
  ChevronLeft,
  Home,
  LogOut,
  MessageSquare,
  Settings,
  Wallet,
} from "lucide-react";

const accountNavItems = [
  { label: "الصفحة الرئيسية", icon: Home, path: "/teacher" },
  { label: "المواد الدراسية", icon: BookOpen, path: "/teacher/subjects" },
  { label: "تشخيص التعيينات", icon: Bug, path: "/teacher/assignments-diagnostics" },
  { label: "التواصل مع الطلبة", icon: MessageSquare, path: "/teacher/messages", badgeKey: "messages" as const },
  { label: "المحفظة", icon: Wallet, path: "/teacher/wallet" },
  { label: "السيرة الذاتية", icon: Briefcase, path: "/teacher/profile" },
  { label: "الإشعارات", icon: Bell, path: "/teacher/notifications", badgeKey: "notifications" as const },
  { label: "الإعدادات", icon: Settings, path: "/teacher/settings" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacherName?: string;
  teacherAvatar?: string | null;
  teacherCode?: string | null;
  unreadMessages: number;
  unreadNotifs: number;
  onSignOut: () => Promise<void> | void;
}

export default function TeacherAccountSheet({
  open,
  onOpenChange,
  teacherName,
  teacherAvatar,
  teacherCode,
  unreadMessages,
  unreadNotifs,
  onSignOut,
}: Props) {
  const location = useLocation();

  const displayName = teacherName?.trim() || "المعلم";
  const initials =
    displayName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2) || "م";

  const handleSignOut = async () => {
    onOpenChange(false);
    await onSignOut();
  };

  const getBadge = (key?: "messages" | "notifications") => {
    if (key === "messages") return unreadMessages;
    if (key === "notifications") return unreadNotifs;
    return 0;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] rounded-t-[28px] border-x-0 border-b-0 border-t border-border bg-background px-0 pt-2 [&>button]:hidden"
      >
        <div dir="rtl" className="flex max-h-[88vh] flex-col">
          <div className="mx-auto mb-2 h-1 w-12 rounded-full bg-muted shrink-0" />

          <div className="flex items-center justify-between px-4 pb-2 shrink-0">
            <div className="w-14" />
            <SheetTitle className="text-sm font-bold text-foreground">حسابي</SheetTitle>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              رجوع
            </button>
          </div>

          <div className="flex-1 overflow-y-auto border-t border-border/70 px-3 pt-3 pb-4">
            <Link
              to="/teacher/settings/account"
              onClick={() => onOpenChange(false)}
              className="mb-3 flex w-full flex-col items-center gap-2 rounded-2xl bg-muted/40 p-3 text-center"
            >
              <Avatar className="h-16 w-16 border-3 border-primary/15 shadow-sm">
                <AvatarImage src={teacherAvatar || ""} />
                <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-foreground">{displayName}</p>
                {teacherCode && (
                  <p className="text-[10px] text-muted-foreground">كود المعلم: {teacherCode}</p>
                )}
                <p className="text-[10px] font-medium text-primary">عرض الملف الشخصي</p>
              </div>
            </Link>

            <nav className="space-y-1.5">
              {accountNavItems.map((item) => {
                const isActive = location.pathname === item.path;
                const badge = getBadge(item.badgeKey);

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => onOpenChange(false)}
                    className={cn(
                      "flex items-center justify-between rounded-xl border border-border/60 bg-card px-3 py-2.5 transition-colors",
                      isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <item.icon className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-medium text-foreground">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {badge > 0 && (
                        <Badge className="h-5 min-w-[1.4rem] rounded-full border-0 bg-destructive px-1.5 text-[0.6rem] font-bold text-destructive-foreground">
                          {badge > 99 ? "99+" : badge}
                        </Badge>
                      )}
                      <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </nav>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-card px-3 py-2.5 text-destructive transition-colors hover:bg-destructive/10"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10">
                    <LogOut className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-medium">تسجيل الخروج</span>
                </div>
                <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
