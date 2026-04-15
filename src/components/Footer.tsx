import { Link } from "react-router-dom";
import { BookOpen, Mail, Phone, MapPin } from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-t border-border bg-muted/30 pattern-islamic">
      <div className="container px-4 py-12">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* معلومات المنصة */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-azhari">
                <BookOpen className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-gradient-azhari">مدرك Plus</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              منصة تعليمية متكاملة لطلاب الأزهر الشريف. نوفر لك كل ما تحتاجه من كتب ومناهج وشروحات فيديو مع مساعد ذكي يجيب على أسئلتك.
            </p>
          </div>

          {/* روابط سريعة */}
          <div className="space-y-4">
            <h3 className="font-bold text-foreground">روابط سريعة</h3>
            <nav className="flex flex-col gap-2">
              <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                الرئيسية
              </Link>
              <Link to="/about" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                عن المنصة
              </Link>
              <Link to="/auth" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                تسجيل الدخول
              </Link>
              <Link to="/auth?mode=register" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                إنشاء حساب
              </Link>
            </nav>
          </div>

          {/* المراحل الدراسية */}
          <div className="space-y-4">
            <h3 className="font-bold text-foreground">المراحل الدراسية</h3>
            <nav className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">المرحلة الإعدادية</span>
              <span className="text-sm text-muted-foreground">المرحلة الثانوية - علمي</span>
              <span className="text-sm text-muted-foreground">المرحلة الثانوية - أدبي</span>
            </nav>
          </div>

          {/* تواصل معنا */}
          <div className="space-y-4">
            <h3 className="font-bold text-foreground">تواصل معنا</h3>
            <div className="flex flex-col gap-3">
              <a
                href="mailto:alyedaft@gmail.com"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <Mail className="h-4 w-4" />
                alyedaft@gmail.com
              </a>
              <a
                href="https://wa.me/201223909712"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <Phone className="h-4 w-4" />
                01223909712
              </a>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                بني سويف، مصر
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-border text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} مدرك Plus. جميع الحقوق محفوظة. تطوير{" "}
            <span className="font-semibold text-primary">علي محمد علي</span>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
