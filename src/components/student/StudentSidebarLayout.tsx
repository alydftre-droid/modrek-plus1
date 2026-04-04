import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Home,
  User,
  Wallet,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  Globe,
  Key,
  Mail,
} from "lucide-react";

const navItems = [
  { label: "الصفحة الرئيسية", icon: Home, path: "/dashboard" },
  { label: "ملفي الشخصي", icon: User, path: "/student-profile" },
  { label: "محفظتي", icon: Wallet, path: "/wallet" },
  { label: "إدارة الحساب", icon: Key, path: "/student-security" },
  { label: "الإشعارات", icon: Bell, path: "/notifications" },
  { label: "الإعدادات", icon: Settings, path: "/profile" },
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
  const { signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 right-0 h-full w-72 bg-card border-l border-border z-50 transition-transform duration-300 flex flex-col",
          "lg:relative lg:translate-x-0 lg:z-auto",
          sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <Link to="/dashboard" className="flex items-center gap-3">
            <span className="text-lg font-bold text-foreground">أزهاريون</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center justify-between px-4 py-3.5 mx-2 border-b border-border/50 text-sm font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-foreground hover:text-primary"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span>{item.label}</span>
                </div>
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })}
        </nav>

        {/* Sign Out */}
        <div className="p-3 border-t border-border">
          <button
            onClick={handleSignOut}
            className="flex items-center justify-between px-4 py-3.5 mx-2 text-sm font-medium text-destructive hover:bg-destructive/10 w-full rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-destructive/10 flex items-center justify-center">
                <LogOut className="h-4 w-4 text-destructive" />
              </div>
              <span>تسجيل الخروج</span>
            </div>
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 h-16 px-4 border-b border-border bg-background/80 backdrop-blur-xl">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          {title && <h1 className="text-lg font-bold truncate">{title}</h1>}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}