import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Home,
  User,
  BookOpen,
  Wallet,
  Bell,
  Settings,
  MessageSquare,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  GraduationCap,
} from "lucide-react";

const navItems = [
  { label: "الصفحة الرئيسية", icon: Home, path: "/teacher" },
  { label: "المواد الدراسية", icon: BookOpen, path: "/teacher/subjects" },
  { label: "إدارة الطلاب", icon: GraduationCap, path: "/teacher/students" },
  { label: "الرسائل", icon: MessageSquare, path: "/teacher/messages" },
  { label: "المحفظة", icon: Wallet, path: "/teacher/wallet" },
  { label: "السيرة الذاتية", icon: User, path: "/teacher/profile" },
  { label: "الإشعارات", icon: Bell, path: "/teacher/notifications" },
  { label: "الإعدادات", icon: Settings, path: "/teacher/settings" },
];

interface Props {
  children: React.ReactNode;
  title?: string;
  teacherName?: string;
}

export default function TeacherSidebarLayout({ children, title, teacherName }: Props) {
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
          "fixed top-0 right-0 h-full w-72 bg-primary z-50 transition-transform duration-300 flex flex-col",
          "lg:relative lg:translate-x-0 lg:z-auto",
          sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-primary-foreground/10">
          <Link to="/teacher" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <span className="text-lg font-bold text-primary-foreground">أزهاريون</span>
              <p className="text-xs text-primary-foreground/60">لوحة المعلم</p>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Teacher info */}
        {teacherName && (
          <div className="px-5 py-4 border-b border-primary-foreground/10">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                <User className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm font-bold text-primary-foreground">{teacherName}</p>
                <p className="text-xs text-primary-foreground/50">معلم</p>
              </div>
            </div>
          </div>
        )}

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary-foreground text-primary shadow-md"
                    : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
                {isActive && <ChevronLeft className="h-4 w-4 mr-auto" />}
              </Link>
            );
          })}
        </nav>

        {/* Sign Out */}
        <div className="p-3 border-t border-primary-foreground/10">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-300 hover:bg-red-500/20 w-full transition-colors"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span>تسجيل الخروج</span>
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
