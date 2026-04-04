import { Link, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Bell,
  ChevronLeft,
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
}

export default function StudentAccountSheet({
  open,
  onOpenChange,
  profile,
  onSignOut,
  onAvatarClick,
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
        className="max-h-[85vh] rounded-t-[32px] border-x-0 border-b-0 border-t border-border bg-background px-0 pt-3 [&>button]:hidden"
      >
        <div dir="rtl">
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-muted" />

          <div className="flex items-center justify-between px-4 pb-4">
            <div className="w-16" />
            <SheetTitle className="text-base font-bold text-foreground">حسابي</SheetTitle>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary"
            >
              <ArrowRight className="h-4 w-4" />
              رجوع
            </button>
          </div>

          <div className="border-t border-border/70 px-4 pt-4">
            <button
              type="button"
              onClick={onAvatarClick}
              disabled={!onAvatarClick}
              className={cn(
                "mb-4 flex w-full flex-col items-center gap-3 rounded-3xl bg-muted/40 p-4 text-center",
                !onAvatarClick && "cursor-default",
              )}
            >
              <Avatar className="h-24 w-24 border-4 border-primary/15 shadow-sm">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-2xl font-bold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <p className="text-base font-bold text-foreground">{profile?.full_name || "الطالب"}</p>
                {profile?.student_code ? (
                  <p className="text-xs text-muted-foreground">كود الطالب: {profile.student_code}</p>
                ) : null}
                {onAvatarClick ? <p className="text-xs font-medium text-primary">تغيير الصورة الشخصية</p> : null}
              </div>
            </button>

            <nav className="space-y-2">
              {accountNavItems.map((item) => {
                const isActive = location.pathname === item.path;

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => onOpenChange(false)}
                    className={cn(
                      "flex items-center justify-between rounded-2xl border border-border/60 bg-card px-4 py-3 transition-colors",
                      isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <span className="text-sm font-medium text-foreground">{item.label}</span>
                    </div>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </Link>
                );
              })}
            </nav>

            <div className="pt-3">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-card px-4 py-3 text-destructive transition-colors hover:bg-destructive/10"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                    <LogOut className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium">تسجيل الخروج</span>
                </div>
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}