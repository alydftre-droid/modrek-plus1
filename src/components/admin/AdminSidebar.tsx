import { Link, useLocation } from "react-router-dom";
import {
  BarChart3, Users, GraduationCap, Upload, BookOpen, Bell, Settings, LogOut,
  MessageSquare, Info, User, Wallet, Megaphone, Library, Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface AdminSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onSignOut: () => void;
}

const menuItems = [
  { id: "overview", label: "نظرة عامة", icon: BarChart3 },
  { id: "students", label: "الطلاب", icon: Users },
  { id: "teachers", label: "المعلمين", icon: GraduationCap },
  { id: "teacher-withdrawals", label: "سحب المعلمين", icon: Wallet },
  { id: "student-wallets", label: "محفظة الطلاب", icon: Wallet, route: "/admin/student-wallets" },
  { id: "content", label: "المحتوى", icon: Upload },
  { id: "subjects", label: "المواد", icon: BookOpen },
  { id: "notifications", label: "الإشعارات", icon: Bell },
  { id: "ads", label: "إدارة الإعلانات", icon: Megaphone, route: "/admin/ads" },
  { id: "modrek-library", label: "مكتبة Modrek AI", icon: Library, route: "/admin/modrek-library" },
  { id: "modrek-analytics", label: "تحليلات Modrek AI", icon: Sparkles, route: "/admin/modrek-analytics" },
  { id: "support", label: "الدعم الفني", icon: MessageSquare },
  { id: "settings", label: "الإعدادات", icon: Settings },
];

const AdminSidebar = ({ activeTab, onTabChange, onSignOut }: AdminSidebarProps) => {
  const navigate = useNavigate();
  return (
    <aside className="fixed right-0 top-0 h-screen w-64 bg-card border-l border-border flex flex-col z-40">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-mudrik">
            <BookOpen className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <span className="font-bold text-foreground">مدرك Plus</span>
            <p className="text-xs text-muted-foreground">لوحة التحكم</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {menuItems.map((item: any) => (
          <button
            key={item.id}
            onClick={() => item.route ? navigate(item.route) : onTabChange(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
              activeTab === item.id
                ? "bg-primary text-primary-foreground shadow-mudrik"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </button>
        ))}
      </nav>

      {/* Admin Info */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-accent/50 mb-3">
          <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
            <User className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">المدير</p>
            <p className="text-xs text-muted-foreground">مدير النظام</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onSignOut}
        >
          <LogOut className="h-5 w-5" />
          تسجيل الخروج
        </Button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
