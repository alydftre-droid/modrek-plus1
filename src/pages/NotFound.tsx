import Seo from "@/components/seo/Seo";
import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { BookOpen, Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 pattern-islamic p-4">
      <Seo title="الصفحة غير موجودة | مدرك Plus" description="الصفحة المطلوبة غير موجودة على منصة مدرك Plus." path="/404" noindex />
      <div className="text-center animate-scale-in">
        {/* الشعار */}
        <Link to="/" className="inline-flex items-center gap-3 mb-8 group">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-mudrik shadow-mudrik transition-transform duration-300 group-hover:scale-105">
            <BookOpen className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold text-gradient-mudrik">مدرك Plus</span>
        </Link>

        <div className="mb-8">
          <h1 className="text-8xl font-bold text-gradient-mudrik mb-4">404</h1>
          <p className="text-2xl font-semibold text-foreground mb-2">الصفحة غير موجودة</p>
          <p className="text-muted-foreground">عذراً، الصفحة التي تبحث عنها غير متاحة</p>
        </div>

        <Button size="lg" asChild>
          <Link to="/" className="gap-2">
            <Home className="h-5 w-5" />
            العودة للصفحة الرئيسية
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
