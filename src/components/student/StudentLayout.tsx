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
} from "lucide-react";

const navItems = [
  { label: "الصفحة الرئيسية", icon: Home, path: "/dashboard" },
  { label: "ملفي الشخصي", icon: User, path: "/student-profile" },
  { label: "تقدمي الدراسي", icon: TrendingUp, path: "/student-progress" },
  { label: "محفظتي", icon: Wallet, path: "/wallet" },
  { label: "دروسي المشترك بها", icon: BookOpen, path: "/my-courses" },
  { label: "الإشعارات", icon: Bell, path: "/notifications" },
  { label: "عن المنصة", icon: Globe, path: "/about-platform" },
  { label: "الدعم الفني", icon: HelpCircle, path: "/support" },
  { label: "الإعدادات", icon: Settings, path: "/profile" },
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
    supabase.from("profiles").select("full_name, avatar_url, student_code").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setProfile(data); });
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const initials = profile?.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "؟";

  return (
    <div className="min-h-screen bg-muted/30 flex" dir="rtl">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ===== SIDEBAR ===== */}
      <aside className={cn(
        "fixed top-0 right-0 h-full w-[280px] z-50 flex flex-col transition-transform duration-300",
        "bg-gradient-to-b from-primary via-primary to-primary/90",
        "lg:relative lg:translate-x-0 lg:z-auto lg:shrink-0",
        sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )}>
        {/* Profile Section */}
        <div className="p-5 pb-4">
          <div className="flex items-center justify-between mb-4">
            <Badge className="bg-secondary text-secondary-foreground border-0 gap-1 text-xs font-bold px-3 py-1 rounded-full shadow-gold">
              <Star className="h-3 w-3" />
              الطالب الذهبي
            </Badge>
            <button className="lg:hidden text-primary-foreground/80" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Avatar */}
          <div className="flex flex-col items-center">
            <div className="relative mb-3">
              <Avatar className="h-20 w-20 border-4 border-primary-foreground/20 shadow-2xl">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="bg-primary-foreground/15 text-primary-foreground text-xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="absolute bottom-1 left-1 h-3.5 w-3.5 rounded-full bg-green-400 border-2 border-primary" />
            </div>
            <h3 className="text-primary-foreground font-bold text-base">{profile?.full_name || "طالب"}</h3>
            {profile?.student_code && (
              <span className="text-primary-foreground/60 text-xs mt-0.5">كود: {profile.student_code}</span>
            )}
          </div>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path ||
              (item.path === "/my-courses" && location.pathname.startsWith("/my-courses"));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-secondary text-secondary-foreground shadow-gold"
                    : "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
                )}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                <span>{item.label}</span>
                {isActive && <span className="mr-auto text-[10px] font-bold opacity-80">(نشط)</span>}
              </Link>
            );
          })}
        </nav>

        {/* Sign Out */}
        <div className="p-3 border-t border-primary-foreground/10">
          <button onClick={handleSignOut} className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-red-200 hover:bg-red-500/20 w-full transition-colors">
            <LogOut className="h-4 w-4 shrink-0" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 border-b border-border bg-background/90 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            {title && <h1 className="text-lg font-bold text-foreground truncate">{title}</h1>}
          </div>
          <div className="flex items-center gap-1">
            {headerActions}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          {children}
        </main>

        {/* ===== BOTTOM NAV - Mobile Only ===== */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t border-border bg-background/95 backdrop-blur-xl">
          <div className="flex items-center justify-around h-14">
            <Link
              to="/dashboard"
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors",
                location.pathname === "/dashboard"
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <Home className="h-5 w-5" />
              <span className="text-[10px] font-semibold">الرئيسية</span>
            </Link>
            <Link
              to="/my-courses"
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors",
                location.pathname === "/my-courses"
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <BookOpen className="h-5 w-5" />
              <span className="text-[10px] font-semibold">دروسي</span>
            </Link>
            <Link
              to="/student-profile"
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors",
                location.pathname === "/student-profile"
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <User className="h-5 w-5" />
              <span className="text-[10px] font-semibold">ملفي</span>
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
