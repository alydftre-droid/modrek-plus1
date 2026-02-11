import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import TeacherBanner from "@/components/student/TeacherBanner";
import { ChevronLeft, BookOpen, Loader2, X, UserCheck, AlertCircle, Lock } from "lucide-react";

interface Subject {
  id: string;
  name: string;
  category: string;
  teacher_id: string;
}

const Subjects = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const category = searchParams.get("category");
  const stage = searchParams.get("stage");
  const grade = searchParams.get("grade");

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOverlay, setShowOverlay] = useState(false);
  const [subscribedTeacherId, setSubscribedTeacherId] = useState<string | null>(null);

  useEffect(() => {
    if (category && user) checkAccess();
  }, [category, user]);

  const checkAccess = async () => {
    setLoading(true);
    // 1. التحقق من وجود اشتراك فعال لهذا القسم
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("teacher_id")
      .eq("student_id", user?.id)
      .eq("is_active", true)
      .eq("category", category) // نفترض أن الاشتراك بالقسم
      .maybeSingle();

    if (sub) {
      setSubscribedTeacherId(sub.teacher_id);
      fetchSubjects(sub.teacher_id);
      setShowOverlay(false);
    } else {
      setShowOverlay(true);
      setLoading(false);
    }
  };

  const fetchSubjects = async (teacherId: string) => {
    // 2. جلب مواد هذا المعلم فقط لمنع التداخل
    const { data, error } = await supabase
      .from("subjects")
      .select("*")
      .eq("category", category)
      .eq("stage", stage)
      .eq("grade", grade)
      .eq("teacher_id", teacherId); // شرط المعلم

    if (!error) setSubjects(data || []);
    setLoading(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary h-12 w-12" /></div>;

  return (
    <div className="min-h-screen bg-muted/20 pb-12" dir="rtl">
      {/* نافذة اختيار المعلم بملء الشاشة - تظهر لغير المشتركين فقط */}
      {showOverlay && (
        <div className="fixed inset-0 z-[100] bg-background/98 backdrop-blur-md overflow-y-auto animate-in fade-in duration-300">
           <div className="container max-w-4xl py-12 relative">
             <Button variant="ghost" size="icon" className="absolute top-4 left-4" onClick={() => navigate(-1)}><X size={32} /></Button>
             
             <div className="text-center mb-10 space-y-4">
                <div className="bg-primary/10 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto text-primary"><UserCheck size={40} /></div>
                <h2 className="text-3xl font-black text-primary">اختر معلم المادة</h2>
                <p className="text-muted-foreground">يجب اختيار معلم والاشتراك معه لتتمكن من رؤية المحتوى</p>
             </div>

             {/* مكون عرض المعلمين */}
             <div className="bg-white rounded-3xl p-6 shadow-2xl border">
                <TeacherBanner />
             </div>

             <div className="mt-8 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex gap-3 text-amber-800 text-sm">
                <AlertCircle className="shrink-0" />
                <p>بمجرد اختيار المعلم وتفعيل اشتراكك من قبل الإدارة، ستختفي هذه الشاشة تلقائياً وسيظهر لك محتوى هذا المعلم فقط.</p>
             </div>
           </div>
        </div>
      )}

      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur px-4">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ChevronLeft /></Button>
            <h1 className="text-xl font-bold text-primary">المواد الدراسية</h1>
          </div>
        </div>
      </header>

      <main className="container py-8 px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map((subject) => (
            <Link key={subject.id} to={`/subject/${subject.id}`}>
              <Card className="hover:border-primary transition-all group border-none shadow-md overflow-hidden">
                <CardContent className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary"><BookOpen /></div>
                    <h3 className="font-bold">{subject.name}</h3>
                  </div>
                  <ChevronLeft className="text-muted-foreground group-hover:text-primary transition-colors" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        {subjects.length === 0 && !showOverlay && (
          <div className="text-center py-20 opacity-40"><Lock size={60} className="mx-auto mb-4" /><p>لا توجد مواد متاحة حالياً لهذا المعلم</p></div>
        )}
      </main>
    </div>
  );
};

export default Subjects;


