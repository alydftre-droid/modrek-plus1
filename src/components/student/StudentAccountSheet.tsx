import { Link, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Bell,
  ChevronLeft,
  Gift,
  Globe,
  Key,
  LogOut,
  Mail,
  User,
  Wallet,
} from "lucide-react";

const accountNavItems = [
  { label: "ملفي الشخصي", icon: User, path: "/student-profile" },
  { label: "محفظتي", icon: Wallet, path: "/wallet" },
  { label: "الباقات المخفضة", icon: Gift, path: "/student/bundles" },
  { label: "إدارة الحساب", icon: Key, path: "/student-security" },
  { label: "الإشعارات", icon: Bell, path: "/notifications" },
  { label: "تواصل معنا", icon: Mail, path: "/support" },
  { label: "عن المنصة", icon: Globe, path: "/about-platform" },
];

interface StudentAccountProfile {
  full_name?: string | null;
  avatar_url?: string | null;
  student_code?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: StudentAccountProfile | null;
  onSignOut: () => Promise<void> | void;
  onAvatarClick?: () => void;
  isDeveloperImpersonation?: boolean;
}

export default function StudentAccountSheet({
  open,
  onOpenChange,
  profile,
  onSignOut,
  onAvatarClick,
  isDeveloperImpersonation = false,
}: Props) {
  const location = useLocation();

  const initials =
    profile?.full_name
      ?.split(" ")
      .map((name) => name[0])
      .join("")
      .slice(0, 2) || "؟";

  const handleSignOut = async () => {
    onOpenChange(false);
    await onSignOut();
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
            <button
              type="button"
              onClick={onAvatarClick}
              disabled={!onAvatarClick}
              className={cn(
                "mb-3 flex w-full flex-col items-center gap-2 rounded-2xl bg-muted/40 p-3 text-center",
                !onAvatarClick && "cursor-default",
              )}
            >
              <Avatar className="h-16 w-16 border-3 border-primary/15 shadow-sm">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-foreground">{profile?.full_name || "الطالب"}</p>
                {profile?.student_code ? (
                  <p className="text-[10px] text-muted-foreground">كود الطالب: {profile.student_code}</p>
                ) : null}
                {onAvatarClick ? <p className="text-[10px] font-medium text-primary">تغيير الصورة الشخصية</p> : null}
              </div>
            </button>

            <nav className="space-y-1.5">
              {accountNavItems.map((item) => {
                const isActive = location.pathname === item.path;

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
                    <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
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
                  <span className="text-xs font-medium">
                    {isDeveloperImpersonation ? "الرجوع إلى حساب المطور" : "تسجيل الخروج"}
                  </span>
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