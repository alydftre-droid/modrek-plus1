import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, User, Settings } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import mudrikLogo from "@/assets/mudrik-logo.png";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, role, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4">
        {/* الشعار */}
        <Link to="/" className="flex items-center gap-3 group">
          <img src={mudrikLogo} alt="مدرك Plus" className="h-10 w-10 rounded-lg transition-transform duration-300 group-hover:scale-105" />
          <span className="text-xl font-bold">
            <span style={{ color: "#1E293B" }}>مدرك </span>
            <span style={{ color: "#16A34A" }}>Plus</span>
          </span>
        </Link>

        {/* روابط التنقل - Desktop */}
        <nav className="hidden md:flex items-center gap-6">
          <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            الرئيسية
          </Link>
          <Link to="/about" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            عن المنصة
          </Link>
          <Link to="/privacy-policy" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            سياسة الخصوصية
          </Link>
          <Link to="/terms-of-service" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            الشروط
          </Link>
          {user && role === "admin" && (
            <Link to="/admin" className="text-sm font-medium text-gold hover:text-gold/80 transition-colors">
              لوحة المطور
            </Link>
          )}
        </nav>

        {/* أزرار التسجيل / حساب المستخدم - Desktop */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              {role === "student" && (
                <Button variant="ghost" asChild>
                  <Link to="/dashboard">
                    <User className="h-4 w-4 ml-2" />
                    لوحتي
                  </Link>
                </Button>
              )}
              <Button variant="ghost" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 ml-2" />
                تسجيل الخروج
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link to="/auth">تسجيل الدخول</Link>
              </Button>
              <Button asChild>
                <Link to="/auth?mode=register">إنشاء حساب</Link>
              </Button>
            </>
          )}
        </div>

        {/* زر القائمة - Mobile */}
        <button
          className="md:hidden p-2 text-muted-foreground hover:text-primary transition-colors"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* القائمة المنسدلة - Mobile */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-border bg-background animate-slide-up">
          <nav className="container flex flex-col gap-4 p-4">
            <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors" onClick={() => setIsMenuOpen(false)}>الرئيسية</Link>
            <Link to="/about" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors" onClick={() => setIsMenuOpen(false)}>عن المنصة</Link>
            <Link to="/privacy-policy" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors" onClick={() => setIsMenuOpen(false)}>سياسة الخصوصية</Link>
            <Link to="/terms-of-service" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors" onClick={() => setIsMenuOpen(false)}>شروط الخدمة</Link>
            {user && role === "admin" && (
              <Link to="/admin" className="text-sm font-medium text-gold hover:text-gold/80 transition-colors" onClick={() => setIsMenuOpen(false)}>لوحة المطور</Link>
            )}
            <div className="flex flex-col gap-2 pt-4 border-t border-border">
              {user ? (
                <>
                  {role === "student" && (
                    <Button variant="ghost" asChild className="justify-center">
                      <Link to="/dashboard" onClick={() => setIsMenuOpen(false)}>
                        <User className="h-4 w-4 ml-2" />
                        لوحتي
                      </Link>
                    </Button>
                  )}
                  <Button variant="ghost" className="justify-center" onClick={() => { handleSignOut(); setIsMenuOpen(false); }}>
                    <LogOut className="h-4 w-4 ml-2" />
                    تسجيل الخروج
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" asChild className="justify-center">
                    <Link to="/auth" onClick={() => setIsMenuOpen(false)}>تسجيل الدخول</Link>
                  </Button>
                  <Button asChild className="justify-center">
                    <Link to="/auth?mode=register" onClick={() => setIsMenuOpen(false)}>إنشاء حساب</Link>
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
