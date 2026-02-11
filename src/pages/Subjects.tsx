import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import TeacherBanner from "@/components/student/TeacherBanner";
import { 
  ChevronLeft, 
  BookOpen, 
  Loader2, 
  X, 
  UserCheck, 
  AlertCircle 
} from "lucide-react";

interface Subject {
  id: string;
  name: string;
  category: string;
}

const Subjects = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const category = searchParams.get("category");
  const stage = searchParams.get("stage");
  const grade = searchParams.get("grade");

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTeacherSelection, setShowTeacherSelection] = useState(false);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);

  useEffect(() => {
    if (category && stage && grade) {
      fetchSubjects();
      checkSubscriptionStatus();
    }
  }, [category, stage, grade]);

  const fetchSubjects = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("subjects")
      .select("id, name, category")
      .eq("category", category)
      .eq("stage", stage)
      .eq("grade", grade);

    if (!error) setSubjects(data || []);
    setLoading(false);
  };

  const checkSubscriptionStatus = async () => {
    if (!user) return;
    
    // فحص إذا كان الطالب مشتركاً في أي مادة من هذا القسم باشتراك فعال
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("student_id", user.id)
      .eq("is_active", true)
      .gte("end_date", new Date().toISOString());

    if (data && data.length > 0) {
      setHasActiveSubscription(true);
      setShowTeacherSelection(false); // لا تظهر الرسالة إذا كان مشتركاً
    } else {
      setHasActiveSubscription(false);
      setShowTeacherSelection(true); // أظهر نافذة الاختيار إذا لم يكن مشتركاً
    }
  };

  const getCategoryTitle = (cat: string | null) => {
    const titles: Record<string, string> = {
      arabic: "المواد العربية",
      religious: "المواد الشرعية",
      science: "المواد العلمية",
      literary: "المواد الأدبية",
      english: "اللغة الإنجليزية",
      foreign: "اللغات الأجنبية",
      social: "الدراسات الاجتماعية"
    };
    return titles[cat || ""] || "المواد الدراسية";
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/20 pb-12" dir="rtl">
      {/* نافذة اختيار المعلم بملء الشاشة - تظهر فقط إذا لم يكن هناك اشتراك */}
      {showTeacherSelection && !hasActiveSubscription && (
        <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md animate-in fade-in zoom-in-95 duration-300 overflow-y-auto">
          <div className="container max-w-4xl py-12 relative">
            {/* زر الإغلاق X */}
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute top-4 left-4 rounded-full hover:bg-destructive/10 text-destructive"
              onClick={() => setShowTeacherSelection(false)}
            >
              <X className="h-8 w-8" />
            </Button>

            <div className="text-center mb-8 space-y-4">
               <div className="bg-primary/10 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto text-primary">
                  <UserCheck size={40} />
               </div>
               <h2 className="text-3xl font-black text-primary">اختر معلمك المفضل</h2>
               <p className="text-muted-foreground">اختر المعلم الذي تود الاشتراك معه لمشاهدة محتوى {getCategoryTitle(category)}</p>
            </div>

            <div className="space-y-6">
              <TeacherBanner />
            </div>

            <div className="mt-12 p-6 bg-amber-50 border border-amber-200 rounded-2xl flex gap-4 text-amber-900">
               <AlertCircle className="h-6 w-6 shrink-0" />
               <p className="text-sm leading-relaxed">
                 بمجرد اختيار المعلم وإتمام عملية الدفع وتفعيل الاشتراك من قبل الإدارة، ستختفي هذه النافذة تلقائياً وسيظهر لك محتوى المواد مباشرة.
               </p>
            </div>
          </div>
        </div>
      )}

      {/* الهيدر العادي */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur shadow-sm">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-primary">{getCategoryTitle(category)}</h1>
              <p className="text-[10px] text-muted-foreground">
                {stage === 'preparatory' ? 'الإعدادية' : 'الثانوية'} - {grade === 'first' ? 'الأول' : grade === 'second' ? 'الثاني' : 'الثالث'}
              </p>
            </div>
          </div>
          <div className="bg-primary/10 px-4 py-2 rounded-xl">
             <BookOpen className="h-5 w-5 text-primary" />
          </div>
        </div>
      </header>

      {/* عرض المواد - يظهر فقط في الخلفية أو بعد الاشتراك */}
      <main className="container py-8 px-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map((subject) => (
            <Link key={subject.id} to={`/subject/${subject.id}`}>
              <Card className="hover:border-primary transition-all duration-300 group cursor-pointer border-none shadow-md overflow-hidden">
                <CardContent className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                      <BookOpen size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg group-hover:text-primary transition-colors">{subject.name}</h3>
                      <p className="text-xs text-muted-foreground">اضغط لدخول المادة</p>
                    </div>
                  </div>
                  <ChevronLeft className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-[-5px] transition-all" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {subjects.length === 0 && (
          <div className="text-center py-20 opacity-50">
             <BookOpen size={60} className="mx-auto mb-4" />
             <p>لا توجد مواد مضافة لهذا القسم حالياً</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Subjects;


