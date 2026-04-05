import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Home,
  BookOpen,
  Library,
} from "lucide-react";
import DashboardSupportLauncher from "./DashboardSupportLauncher";
import StudentAccountSheet from "./StudentAccountSheet";

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
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
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
      <StudentAccountSheet
        open={accountSheetOpen}
        onOpenChange={setAccountSheetOpen}
        profile={profile}
        onSignOut={handleSignOut}
      />

      {/* Main Content */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border/50 bg-background/85 px-3 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <button onClick={() => setAccountSheetOpen(true)} className="shrink-0">
              <Avatar className="h-8 w-8 border-2 border-primary/30 shadow-sm">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">{initials}</AvatarFallback>
              </Avatar>
            </button>
            {title && <h1 className="truncate text-sm font-bold text-foreground">{title}</h1>}
          </div>
          <div className="flex items-center gap-1">
            {headerActions}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-[60px] lg:pb-0">{children}</main>

        <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden">
          <div className="border-t border-border/40 bg-card/90 backdrop-blur-2xl shadow-[0_-4px_20px_hsl(var(--foreground)/0.06)]">
            <div className="safe-area-bottom flex items-center justify-around px-2 py-1.5">
              {bottomNavItems.map((item) => {
                const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
                return (
                  <Link key={item.to} to={item.to} className="relative flex min-w-[60px] flex-col items-center gap-0.5 px-3 py-1">
                    {isActive && (
                      <motion.div
                        layoutId="navGlow"
                        className="absolute top-0 h-8 w-8 rounded-full bg-primary/20 blur-lg"
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                      />
                    )}
                    <motion.div
                      animate={{
                        scale: isActive ? 1.12 : 1,
                        y: isActive ? -4 : 0,
                      }}
                      transition={{ type: "spring", stiffness: 320, damping: 22 }}
                      className={cn(
                        "relative flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-200",
                        isActive
                          ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/25"
                          : "bg-transparent text-muted-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4" strokeWidth={isActive ? 2.5 : 2} />
                    </motion.div>
                    <motion.span
                      animate={{ opacity: isActive ? 1 : 0.55, scale: isActive ? 1.05 : 1 }}
                      className={cn("text-[9px] font-medium", isActive ? "font-extrabold text-primary" : "text-muted-foreground")}
                    >
                      {item.label}
                    </motion.span>
                    {isActive && (
                      <motion.div
                        layoutId="bottomNavIndicator"
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

        {showDashboardAssistant && <DashboardSupportLauncher />}
      </div>
    </div>
  );
}
