import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import TeacherProfileCard from "@/components/teacher/TeacherProfileCard";
import PaywallDialog from "@/components/subscription/PaywallDialog";
import {
  BookOpen,
  ChevronLeft,
  Loader2,
  GraduationCap,
  Info,
  MessageSquare,
  Settings,
  LogOut,
} from "lucide-react";
import NotificationsDropdown from "@/components/student/NotificationsDropdown";

interface TeacherInfo {
  teacher_id: string;
  teacher_name: string;
  bio: string | null;
  photo_url: string | null;
  video_url: string | null;
  category: string;
  grades: string[];
}

const TeacherSelection = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, signOut } = useAuth();

  const stage = params.get("stage") || "";
  const grade = params.get("grade") || "";
  const section = params.get("section") || "";
  const category = params.get("category") || "";

  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [existingChoice, setExistingChoice] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    if (!user || !stage || !grade || !category) return;
    fetchTeachers();
  }, [user, stage, grade, category]);

  const fetchTeachers = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Check if student already chose a teacher for this category
      const { data: choiceData } = await supabase
        .from("student_teacher_choices")
        .select("teacher_id")
        .eq("student_id", user.id)
        .eq("category", category)
        .eq("stage", stage)
        .eq("grade", grade)
        .maybeSingle();

      if (choiceData) {
        setExistingChoice(choiceData.teacher_id);
        setSelectedTeacherId(choiceData.teacher_id);
      }

      // Fetch teachers assigned to this category/stage/grade
      const { data: assignments, error: assignError } = await supabase
        .from("teacher_assignments")
        .select("teacher_id, grade")
        .eq("category", category)
        .eq("stage", stage)
        .eq("grade", grade);

      if (assignError) throw assignError;

      if (!assignments || assignments.length === 0) {
        setTeachers([]);
        setLoading(false);
        return;
      }

      // Get unique teacher IDs
      const teacherIds = [...new Set(assignments.map(a => a.teacher_id))];

      // Fetch approved profiles only
      const { data: profiles } = await supabase
        .from("teacher_profiles")
        .select("teacher_id, bio, photo_url, video_url")
        .in("teacher_id", teacherIds)
        .eq("is_approved", true);

      if (!profiles || profiles.length === 0) {
        setTeachers([]);
        setLoading(false);
        return;
      }

      // Fetch teacher names
      const { data: teacherProfiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", profiles.map(p => p.teacher_id));

      const nameMap = new Map(teacherProfiles?.map(p => [p.id, p.full_name]) || []);

      // Group grades per teacher
      const gradesByTeacher = new Map<string, string[]>();
      assignments.forEach(a => {
        const existing = gradesByTeacher.get(a.teacher_id) || [];
        if (!existing.includes(a.grade)) {
          existing.push(a.grade);
        }
        gradesByTeacher.set(a.teacher_id, existing);
      });

      const teacherList: TeacherInfo[] = profiles.map(p => ({
        teacher_id: p.teacher_id,
        teacher_name: nameMap.get(p.teacher_id) || "معلم",
        bio: p.bio,
        photo_url: p.photo_url,
        video_url: p.video_url,
        category,
        grades: gradesByTeacher.get(p.teacher_id) || [],
      }));

      setTeachers(teacherList);
    } catch (e) {
      console.error("Error fetching teachers:", e);
      toast.error("خطأ في تحميل المعلمين");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTeacher = async (teacherId: string) => {
    if (!user) return;
    setSelecting(true);
    try {
      if (existingChoice) {
        // Update existing choice
        const { error } = await supabase
          .from("student_teacher_choices")
          .update({ teacher_id: teacherId })
          .eq("student_id", user.id)
          .eq("category", category)
          .eq("stage", stage)
          .eq("grade", grade);
        if (error) throw error;
      } else {
        // Insert new choice
        const { error } = await supabase
          .from("student_teacher_choices")
          .insert({
            student_id: user.id,
            teacher_id: teacherId,
            category,
            stage,
            grade,
          });
        if (error) throw error;
      }

      setSelectedTeacherId(teacherId);
      setExistingChoice(teacherId);
      toast.success("تم اختيار المعلم بنجاح");

      // Show paywall after selection
      setShowPaywall(true);
    } catch (e) {
      console.error("Error selecting teacher:", e);
      toast.error("خطأ في اختيار المعلم");
    } finally {
      setSelecting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const formatStage = (s: string) => {
    if (s === "preparatory") return "المرحلة الإعدادية";
    if (s === "secondary") return "المرحلة الثانوية";
    return s;
  };

  const formatGrade = (g: string) => {
    if (g === "first") return "الصف الأول";
    if (g === "second") return "الصف الثاني";
    if (g === "third") return "الصف الثالث";
    return g;
  };

  const backUrl = `/subjects?stage=${stage}&grade=${grade}${section ? `&section=${section}` : ""}&category=${category}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-azhari shadow-lg shadow-primary/20">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient-azhari">مدرك Plus</span>
          </Link>
          <div className="flex items-center gap-2">
            <NotificationsDropdown />
            <Button variant="ghost" size="icon" asChild>
              <Link to="/about-platform"><Info className="h-5 w-5" /></Link>
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link to="/support"><MessageSquare className="h-5 w-5" /></Link>
            </Button>
            <Button variant="ghost" size="icon"><Settings className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" onClick={handleSignOut}><LogOut className="h-5 w-5" /></Button>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        <Button variant="ghost" className="mb-6" onClick={() => navigate(backUrl)}>
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
          رجوع للمواد
        </Button>

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-xl shadow-primary/30">
            <GraduationCap className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">اختر معلمك</h1>
          <p className="text-muted-foreground">
            {formatStage(stage)} - {formatGrade(grade)} - {category}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            اختر المعلم الذي تريد الاشتراك معه لمشاهدة المحتوى الخاص به
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
        ) : teachers.length === 0 ? (
          <Card className="border-2 border-dashed max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <GraduationCap className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-bold mb-2">لا يوجد معلمين متاحين</h3>
              <p className="text-muted-foreground mb-4">
                لم يتم تعيين معلمين لهذه المادة بعد أو لم يتم الموافقة على سيرهم الذاتية
              </p>
              <Button onClick={() => navigate(backUrl)}>العودة للمواد</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {teachers.map(teacher => (
              <TeacherProfileCard
                key={teacher.teacher_id}
                teacherId={teacher.teacher_id}
                teacherName={teacher.teacher_name}
                bio={teacher.bio}
                photoUrl={teacher.photo_url}
                videoUrl={teacher.video_url}
                category={teacher.category}
                grades={teacher.grades}
                isSelected={selectedTeacherId === teacher.teacher_id}
                onSelect={() => handleSelectTeacher(teacher.teacher_id)}
              />
            ))}
          </div>
        )}

        {/* Paywall */}
        {selectedTeacherId && (
          <PaywallDialog
            open={showPaywall}
            onOpenChange={setShowPaywall}
            subjectName={category}
            grade={grade}
            stage={stage}
            section={section}
            studentId={user?.id || ""}
          />
        )}
      </main>
    </div>
  );
};

export default TeacherSelection;
