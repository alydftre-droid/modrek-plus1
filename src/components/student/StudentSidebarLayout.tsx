import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  User,
  Wallet,
  Key,
  Mail,
  LogOut,
  ChevronLeft,
  Bell,
  Globe,
} from "lucide-react";

const navItems = [
  { label: "الملف الشخصي", icon: User, path: "/student-profile" },
  { label: "محفظتي", icon: Wallet, path: "/wallet" },
  { label: "إدارة الحساب", icon: Key, path: "/student-security" },
  { label: "الإشعارات", icon: Bell, path: "/notifications" },
  { label: "تواصل معنا", icon: Mail, path: "/support" },
  { label: "عن المنصة", icon: Globe, path: "/about-platform" },
];

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function StudentSidebarLayout({ children, title }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data);
      });
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const initials = profile?.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "؟";

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Nagwa Classes style sheet */}
      {sidebarOpen && (
        <div
          className={cn(
            "fixed top-0 right-0 h-full w-[85%] max-w-[340px] bg-background z-50 flex flex-col animate-in slide-in-from-right duration-300",
            "shadow-2xl"
          )}
        >
          {/* Header bar */}
          <div className="flex items-center justify-between px-5 pt-5 pb-2">
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-sm font-medium text-primary"
            >
              تم
            </button>
            <h2 className="text-base font-bold text-foreground">حسابي</h2>
            <div className="w-8" />
          </div>

          {/* Avatar section */}
          <div className="flex flex-col items-center py-6">
            <Avatar className="h-24 w-24 border-4 border-primary/20">
              <AvatarImage src={profile?.avatar_url || ""} />
              <AvatarFallback className="bg-primary/15 text-primary text-2xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <p className="mt-3 text-lg font-bold text-foreground">
              {profile?.full_name || "الطالب"}
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-border mx-5" />

          {/* Nav Items */}
          <nav className="flex-1 overflow-y-auto px-3 py-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center justify-between px-3 py-4 border-b border-border/40 text-sm font-medium transition-colors",
                    isActive
                      ? "text-primary"
                      : "text-foreground hover:text-primary"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <item.icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <span className="text-[15px]">{item.label}</span>
                  </div>
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </Link>
              );
            })}

            {/* Logout row */}
            <button
              onClick={handleSignOut}
              className="flex items-center justify-between w-full px-3 py-4 text-sm font-medium text-foreground hover:text-destructive transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <LogOut className="h-5 w-5 text-muted-foreground" />
                </div>
                <span className="text-[15px]">تسجيل الخروج</span>
              </div>
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          </nav>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 border-b border-border bg-background/80 backdrop-blur-xl">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex items-center"
          >
            <Avatar className="h-9 w-9 border-2 border-primary/20">
              <AvatarImage src={profile?.avatar_url || ""} />
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>
          {title && <h1 className="text-lg font-bold truncate">{title}</h1>}
          <div className="w-9" />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
