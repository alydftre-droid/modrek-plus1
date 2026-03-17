import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Home,
  User,
  BookOpen,
  Wallet,
  Globe,
  Settings,
  LogOut,
  Menu,
  X,
  Star,
  Bell,
  HelpCircle,
  TrendingUp,
  Library,
} from "lucide-react";
import DashboardSupportLauncher from "./DashboardSupportLauncher";

const navItems = [
  { label: "الصفحة الرئيسية", icon: Home, path: "/dashboard" },
  { label: "ملفي الشخصي", icon: User, path: "/student-profile" },
  { label: "الإعدادات", icon: Settings, path: "/profile" },
  { label: "تقدمي", icon: TrendingUp, path: "/student-progress" },
  { label: "محفظتي", icon: Wallet, path: "/wallet" },
  { label: "دروسي المشترك بها", icon: BookOpen, path: "/my-courses" },
  { label: "الإشعارات", icon: Bell, path: "/notifications" },
  { label: "عن المنصة", icon: Globe, path: "/about-platform" },
  { label: "المساعدة", icon: HelpCircle, path: "/support" },
];

const bottomNavItems = [
  { to: "/dashboard", icon: Home, label: "الرئيسية" },
  { to: "/my-courses", icon: BookOpen, label: "دروسي" },
  { to: "/my-library", icon: Library, label: "مكتبتي" },
];

interface Props {
  children: React.ReactNode;
  title?: string;
  headerActions?: React.ReactNode;
}

export default function StudentLayout({ children, title, headerActions }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState<{ full_name: string; avatar_url: string | null; student_code: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, avatar_url, student_code")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile(data);
      });
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const initials = profile?.full_name?.split(" ").map((name) => name[0]).join("").slice(0, 2) || "؟";
  const showDashboardAssistant = location.pathname === "/dashboard";

  return (
    <div className="flex min-h-screen bg-background" dir="rtl">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-[280px] flex-col bg-gradient-to-b from-primary via-primary to-primary/90 transition-transform duration-300 lg:relative lg:z-auto lg:translate-x-0 lg:shrink-0",
          sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        )}
      >
        <div className="p-5 pb-4">
          <div className="mb-4 flex items-center justify-between">
            <Badge className="gap-1 rounded-full border-0 bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground shadow-gold">
              <Star className="h-3 w-3" />
              الطالب الذهبي
            </Badge>
            <button className="text-primary-foreground/80 lg:hidden" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-col items-center">
            <div className="relative mb-3">
              <Avatar className="h-20 w-20 border-4 border-primary-foreground/20 shadow-2xl">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="bg-primary-foreground/15 text-xl font-bold text-primary-foreground">{initials}</AvatarFallback>
              </Avatar>
              <span className="absolute bottom-1 left-1 h-3.5 w-3.5 rounded-full border-2 border-primary bg-secondary" />
            </div>
            <h3 className="text-base font-bold text-primary-foreground">{profile?.full_name || "طالب"}</h3>
            {profile?.student_code && <span className="mt-0.5 text-xs text-primary-foreground/70">كود: {profile.student_code}</span>}
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path === "/my-courses" && location.pathname.startsWith("/my-courses"));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-secondary text-secondary-foreground shadow-gold"
                    : "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
                )}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-primary-foreground/10 p-3">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-primary-foreground/80 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/50 bg-background/85 px-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            {title && <h1 className="truncate text-base font-bold text-foreground">{title}</h1>}
          </div>
          <div className="flex items-center gap-1">{headerActions}</div>
        </header>

        <main className="flex-1 overflow-y-auto pb-[72px] lg:pb-0">{children}</main>

        <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden">
          <div className="border-t border-border bg-card shadow-[0_-8px_30px_hsl(var(--foreground)/0.08)]">
            <div className="safe-area-bottom flex items-center justify-around px-2 py-1.5">
              {bottomNavItems.map((item) => {
                const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex min-w-[72px] flex-col items-center gap-1 rounded-xl px-4 py-1.5 transition-all duration-200",
                      isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200",
                        isActive ? "bg-primary text-primary-foreground shadow-azhari" : "bg-transparent"
                      )}
                    >
                      <item.icon className="h-[18px] w-[18px]" />
                    </div>
                    <span className={cn("text-[10px] font-medium", isActive && "font-bold")}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        {showDashboardAssistant && <DashboardSupportLauncher />}
      </div>
    </div>
  );
}
