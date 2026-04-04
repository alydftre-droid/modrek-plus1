import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  User,
  BookOpen,
  Wallet,
  Globe,
  Settings,
  LogOut,
  X,
  Star,
  Bell,
  HelpCircle,
  TrendingUp,
  Library,
} from "lucide-react";
import DashboardSupportLauncher from "./DashboardSupportLauncher";

const navItems = [
  { label: "الصفحة الرئيسية", icon: Home, path: "/dashboard", color: "bg-blue-500/10 text-blue-600" },
  { label: "ملفي الشخصي", icon: User, path: "/student-profile", color: "bg-emerald-500/10 text-emerald-600" },
  { label: "الإعدادات", icon: Settings, path: "/profile", color: "bg-cyan-500/10 text-cyan-600" },
  { label: "تقدمي", icon: TrendingUp, path: "/student-progress", color: "bg-purple-500/10 text-purple-600" },
  { label: "محفظتي", icon: Wallet, path: "/wallet", color: "bg-amber-500/10 text-amber-600" },
  { label: "دروسي المشترك بها", icon: BookOpen, path: "/my-courses", color: "bg-teal-500/10 text-teal-600" },
  { label: "الإشعارات", icon: Bell, path: "/notifications", color: "bg-red-500/10 text-red-600" },
  { label: "عن المنصة", icon: Globe, path: "/about-platform", color: "bg-indigo-500/10 text-indigo-600" },
  { label: "المساعدة", icon: HelpCircle, path: "/support", color: "bg-pink-500/10 text-pink-600" },
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

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-[280px] max-w-[86vw] flex-col transition-transform duration-300",
          "bg-gradient-to-b from-primary via-primary to-primary/90",
          "lg:relative lg:translate-x-0 lg:z-auto lg:shrink-0",
          sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header */}
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

          {/* Profile Card */}
          <div className="flex flex-col items-center">
            <div className="relative mb-3">
              <Avatar className="h-20 w-20 border-4 border-primary-foreground/20 shadow-2xl">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="bg-primary-foreground/15 text-xl font-bold text-primary-foreground">{initials}</AvatarFallback>
              </Avatar>
              <span className="absolute bottom-1 left-1 h-3.5 w-3.5 rounded-full border-2 border-primary bg-green-400" />
            </div>
            <h3 className="text-base font-bold text-primary-foreground">{profile?.full_name || "طالب"}</h3>
            {profile?.student_code && <span className="mt-0.5 text-xs text-primary-foreground/70">كود: {profile.student_code}</span>}
          </div>
        </div>

        {/* Nav with colored icons */}
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
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0", isActive ? "bg-secondary-foreground/10" : item.color.split(" ")[0])}>
                  <item.icon className={cn("h-[18px] w-[18px]", isActive ? "" : item.color.split(" ")[1])} />
                </div>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sign Out */}
        <div className="p-3 border-t border-primary-foreground/10">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-red-200 hover:bg-red-500/20 transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/15">
              <LogOut className="h-4 w-4 text-red-300" />
            </div>
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Top bar - avatar trigger instead of hamburger */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/50 bg-background/85 px-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            {/* Mobile: avatar opens sidebar */}
            <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Avatar className="h-9 w-9 border-2 border-primary/30 shadow-sm">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">{initials}</AvatarFallback>
              </Avatar>
            </button>
            {title && <h1 className="truncate text-base font-bold text-foreground">{title}</h1>}
          </div>
          <div className="flex items-center gap-1">
            {headerActions}
            <button
              onClick={() => navigate("/profile")}
              className="p-2 rounded-lg hover:bg-accent transition-colors"
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-[72px] lg:pb-0">{children}</main>

        {/* Bottom Nav with animations */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden">
          <div className="border-t border-border/50 bg-card/95 backdrop-blur-2xl shadow-[0_-8px_30px_hsl(var(--foreground)/0.06)]">
            <div className="safe-area-bottom flex items-center justify-around px-2 py-1.5">
              {bottomNavItems.map((item) => {
                const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
                return (
                  <Link key={item.to} to={item.to} className="relative flex min-w-[72px] flex-col items-center gap-0.5 px-4 py-1.5">
                    <motion.div
                      animate={{
                        scale: isActive ? 1.15 : 1,
                        y: isActive ? -4 : 0,
                      }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-2xl transition-colors duration-200",
                        isActive
                          ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25"
                          : "bg-transparent text-muted-foreground"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                    </motion.div>
                    <motion.span
                      animate={{ opacity: isActive ? 1 : 0.6, scale: isActive ? 1.05 : 1 }}
                      className={cn("text-[10px] font-medium", isActive ? "font-bold text-primary" : "text-muted-foreground")}
                    >
                      {item.label}
                    </motion.span>
                    {isActive && (
                      <motion.div
                        layoutId="bottomNavIndicator"
                        className="absolute -top-0.5 h-[3px] w-8 rounded-full bg-primary"
                        transition={{ type: "spring", stiffness: 400, damping: 28 }}
                      />
                    )}
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
