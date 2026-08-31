import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { GraduationCap, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlatform } from "@/hooks/usePlatform";

/**
 * Branded tenant landing page. Shows ONLY the current platform's identity —
 * no official Modrek Plus marketing, no other teachers, no other subjects.
 */
export default function PlatformLanding() {
  const { platform, isLoading, notFound } = usePlatform();

  if (isLoading) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-muted/30">
        <p className="text-muted-foreground">جارٍ تحميل المنصة...</p>
      </div>
    );
  }

  if (notFound || !platform) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <div className="text-center max-w-sm">
          <h1 className="text-2xl font-bold mb-2">المنصة غير متاحة</h1>
          <p className="text-muted-foreground">
            الرابط الذي فتحته لا يشير إلى منصة نشطة. يرجى التأكد من الرابط مع معلمك.
          </p>
        </div>
      </div>
    );
  }

  const accent = platform.brand_color || "hsl(var(--primary))";

  return (
    <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center bg-muted/20 p-6">
      <Helmet>
        <title>{platform.name}</title>
        <meta name="description" content={platform.description || `منصة تعليمية خاصة بالمعلم ${platform.teacher_name || ""}`} />
        <meta name="robots" content="noindex" />
      </Helmet>

      <main className="w-full max-w-md text-center space-y-6">
        <div
          className="mx-auto h-24 w-24 rounded-3xl flex items-center justify-center overflow-hidden shadow-lg"
          style={{ background: accent }}
        >
          {platform.logo_url ? (
            <img src={platform.logo_url} alt={`شعار ${platform.name}`} className="h-full w-full object-cover" />
          ) : (
            <GraduationCap className="h-10 w-10 text-white" />
          )}
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">{platform.name}</h1>
          {platform.teacher_name && (
            <p className="text-muted-foreground">المعلم: {platform.teacher_name}</p>
          )}
          {platform.description && (
            <p className="text-muted-foreground leading-relaxed">{platform.description}</p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Button asChild size="lg" className="w-full gap-2" style={{ background: accent }}>
            <Link to="/auth">
              <LogIn className="h-5 w-5" />
              تسجيل الدخول
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full gap-2">
            <Link to="/auth?mode=register">
              <UserPlus className="h-5 w-5" />
              إنشاء حساب
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
