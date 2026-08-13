import { Link } from "react-router-dom";
import { Mail, Phone } from "lucide-react";
import mudrikLogo from "@/assets/mudrik-logo.png";

const Footer = () => {
  return (
    <footer className="border-t border-border bg-muted/30 pattern-islamic">
      <div className="container px-4 py-12">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* معلومات المنصة */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <img src={mudrikLogo} alt="مدرك Plus" className="h-10 w-10 rounded-lg" />
              <span className="text-xl font-bold text-gradient-mudrik">مدرك Plus</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              منصة تعليمية متكاملة للتعليم العام والأزهري. نوفر لك كل ما تحتاجه من كتب ومناهج وشروحات فيديو مع مساعد ذكي يجيب على أسئلتك.
            </p>
          </div>

          {/* روابط سريعة */}
          <div className="space-y-4">
            <h3 className="font-bold text-foreground">روابط سريعة</h3>
            <nav className="flex flex-col gap-2">
              <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">الرئيسية</Link>
              <Link to="/about" className="text-sm text-muted-foreground hover:text-primary transition-colors">عن المنصة</Link>
              <Link to="/education" className="text-sm text-muted-foreground hover:text-primary transition-colors">المراحل والمواد الدراسية</Link>
              <Link to="/teachers" className="text-sm text-muted-foreground hover:text-primary transition-colors">المعلمون على المنصة</Link>
              <Link to="/auth" className="text-sm text-muted-foreground hover:text-primary transition-colors">تسجيل الدخول</Link>
              <Link to="/auth?mode=register" className="text-sm text-muted-foreground hover:text-primary transition-colors">إنشاء حساب</Link>
              <Link to="/privacy-policy" className="text-sm text-muted-foreground hover:text-primary transition-colors">سياسة الخصوصية</Link>
              <Link to="/terms-of-service" className="text-sm text-muted-foreground hover:text-primary transition-colors">شروط الخدمة</Link>
            </nav>
          </div>

          {/* المراحل الدراسية */}
          <div className="space-y-4">
            <h3 className="font-bold text-foreground">المراحل والأقسام</h3>
            <nav className="flex flex-col gap-2">
              <Link to="/education/secondary-general" className="text-sm text-muted-foreground hover:text-primary transition-colors">الثانوية العامة</Link>
              <Link to="/education/secondary-azhari" className="text-sm text-muted-foreground hover:text-primary transition-colors">الثانوية الأزهرية</Link>
              <Link to="/education/preparatory" className="text-sm text-muted-foreground hover:text-primary transition-colors">المرحلة الإعدادية</Link>
              <Link to="/features/ai-assistant" className="text-sm text-muted-foreground hover:text-primary transition-colors">المساعد الذكي</Link>
              <Link to="/features/books" className="text-sm text-muted-foreground hover:text-primary transition-colors">الكتب والمناهج</Link>
              <Link to="/features/exams" className="text-sm text-muted-foreground hover:text-primary transition-colors">الامتحانات والمراجعات</Link>
            </nav>
          </div>

          {/* تواصل معنا */}
          <div className="space-y-4">
            <h3 className="font-bold text-foreground">تواصل معنا</h3>
            <div className="flex flex-col gap-3">
              <a href="mailto:modrekplus@gmail.com" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                <Mail className="h-4 w-4" />
                modrekplus@gmail.com
              </a>
              <a href="https://wa.me/201155941352" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors" dir="ltr">
                <Phone className="h-4 w-4" />
                011 55941352
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-border text-center space-y-3">
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <Link to="/privacy-policy" className="text-muted-foreground hover:text-primary transition-colors">سياسة الخصوصية</Link>
            <Link to="/terms-of-service" className="text-muted-foreground hover:text-primary transition-colors">شروط الخدمة</Link>
            <Link to="/about" className="text-muted-foreground hover:text-primary transition-colors">عن المنصة</Link>
          </nav>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} مدرك Plus. جميع الحقوق محفوظة.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
