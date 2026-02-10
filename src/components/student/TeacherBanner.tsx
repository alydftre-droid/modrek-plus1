import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  GraduationCap,
  X,
  Play,
  CheckCircle,
  Users,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import PaywallDialog from "@/components/subscription/PaywallDialog";
import { gradeKeyFromArabicLabel } from "@/lib/teacherSubjectUtils";

// Map English category keys to Arabic labels used in teacher_assignments
const categoryToArabic: Record<string, string> = {
  arabic: "المواد العربية",
  sharia: "المواد الشرعية",
  religious: "المواد الشرعية",
  science: "العلوم",
  studies: "الدراسات",
  literary: "المواد الأدبية",
  scientific: "المواد العلمية",
  english: "الإنجليزية",
  french: "الفرنسية",
  math: "الرياضيات",
  social: "الدراسات",
};

// Map English grade keys to possible Arabic labels in teacher_assignments
const gradeToArabicPatterns: Record<string, string[]> = {
  first: ["الأول", "first"],
  second: ["الثاني", "second"],
  third: ["الثالث", "third"],
};

interface TeacherInfo {
  teacher_id: string;
  teacher_name: string;
  bio: string | null;
  photo_url: string | null;
  video_url: string | null;
  grades: string[];
}

interface TeacherBannerProps {
  category: string;
  stage: string;
  grade: string;
  section?: string | null;
  onTeacherSelected?: (teacherId: string) => void;
}

const TeacherBanner = ({ category, stage, grade, section, onTeacherSelected }: TeacherBannerProps) => {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [existingChoice, setExistingChoice] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [activeVideoName, setActiveVideoName] = useState("");
  const [showPaywall, setShowPaywall] = useState(false);
  const [selectedTeacherName, setSelectedTeacherName] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !category || !stage || !grade) return;
    fetchTeachers();
  }, [user, category, stage, grade]);

  const fetchTeachers = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Check existing choice
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
      // teacher_assignments may store category in Arabic and grade in Arabic
      const arabicCategory = categoryToArabic[category] || category;
      const gradePatterns = gradeToArabicPatterns[grade] || [grade];
      
      // Query with both English and Arabic category values
      const categoriesToSearch = [category, arabicCategory].filter((v, i, a) => a.indexOf(v) === i);
      
      const { data: assignments, error: assignError } = await supabase
        .from("teacher_assignments")
        .select("teacher_id, grade")
        .in("category", categoriesToSearch)
        .eq("stage", stage);
      
      // Filter assignments by grade (handle both English keys and Arabic labels)
      const filteredAssignments = (assignments || []).filter(a => {
        if (a.grade === grade) return true;
        // Check if Arabic grade contains our grade pattern
        for (const pattern of gradePatterns) {
          if (a.grade.includes(pattern)) return true;
        }
        return false;
      });

      if (assignError) throw assignError;
      if (!filteredAssignments || filteredAssignments.length === 0) {
        setTeachers([]);
        setLoading(false);
        return;
      }

      const teacherIds = [...new Set(filteredAssignments.map(a => a.teacher_id))];

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
      filteredAssignments.forEach(a => {
        // Normalize grade to English key for display
        const normalizedGrade = gradeKeyFromArabicLabel(a.grade) || a.grade;
        const existing = gradesByTeacher.get(a.teacher_id) || [];
        if (!existing.includes(normalizedGrade)) existing.push(normalizedGrade);
        gradesByTeacher.set(a.teacher_id, existing);
      });

      const teacherList: TeacherInfo[] = profiles.map(p => ({
        teacher_id: p.teacher_id,
        teacher_name: nameMap.get(p.teacher_id) || "معلم",
        bio: p.bio,
        photo_url: p.photo_url,
        video_url: p.video_url,
        grades: gradesByTeacher.get(p.teacher_id) || [],
      }));

      setTeachers(teacherList);
    } catch (e) {
      console.error("Error fetching teachers:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTeacher = async (teacherId: string, teacherName: string) => {
    if (!user) return;
    setSelecting(true);
    try {
      if (existingChoice) {
        const { error } = await supabase
          .from("student_teacher_choices")
          .update({ teacher_id: teacherId })
          .eq("student_id", user.id)
          .eq("category", category)
          .eq("stage", stage)
          .eq("grade", grade);
        if (error) throw error;
      } else {
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
      setSelectedTeacherName(teacherName);
      toast.success("تم اختيار المعلم بنجاح");
      onTeacherSelected?.(teacherId);

      // Show paywall after selection
      setShowPaywall(true);
    } catch (e) {
      console.error("Error selecting teacher:", e);
      toast.error("خطأ في اختيار المعلم");
    } finally {
      setSelecting(false);
    }
  };

  const formatGrade = (g: string) => {
    if (g === "first") return "الأول";
    if (g === "second") return "الثاني";
    if (g === "third") return "الثالث";
    return g;
  };

  // Don't show if dismissed, loading, or no teachers
  if (dismissed || loading || teachers.length === 0) return null;

  return (
    <>
      <div className="mb-6 relative rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/10 overflow-hidden">
        {/* Close button */}
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-3 left-3 z-10 p-1.5 rounded-full bg-background/80 hover:bg-background border border-border/50 transition-colors"
          aria-label="إغلاق"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Header */}
        <div className="p-4 pb-2 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Users className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">معلمو هذه المادة</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            اختر المعلم الذي تريد الاشتراك معه لمشاهدة المحتوى الخاص به
          </p>
        </div>

        {/* Teachers list */}
        <div className="p-4 pt-2">
          <div className={`grid gap-3 ${teachers.length === 1 ? 'max-w-sm mx-auto' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
            {teachers.map(teacher => {
              const isSelected = selectedTeacherId === teacher.teacher_id;
              return (
                <Card
                  key={teacher.teacher_id}
                  className={`overflow-hidden transition-all duration-300 hover:shadow-lg ${
                    isSelected
                      ? "border-2 border-primary shadow-md shadow-primary/10"
                      : "border hover:border-primary/30"
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-14 w-14 border-2 border-background shadow">
                        <AvatarImage src={teacher.photo_url || undefined} />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          <GraduationCap className="h-6 w-6" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-foreground truncate">{teacher.teacher_name}</h4>
                        {isSelected && (
                          <Badge className="mt-0.5 bg-green-500 gap-1 text-xs">
                            <CheckCircle className="h-3 w-3" />
                            معلمك الحالي
                          </Badge>
                        )}
                      </div>
                    </div>

                    {teacher.bio && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
                        {teacher.bio}
                      </p>
                    )}

                    {teacher.grades.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {teacher.grades.map(g => (
                          <Badge key={g} variant="secondary" className="text-xs">
                            الصف {formatGrade(g)}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      {teacher.video_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 flex-1 text-xs"
                          onClick={() => {
                            setActiveVideoUrl(teacher.video_url);
                            setActiveVideoName(teacher.teacher_name);
                            setShowVideo(true);
                          }}
                        >
                          <Play className="h-3 w-3" />
                          فيديو تعريفي
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className={`gap-1 flex-1 text-xs ${isSelected ? "bg-green-500 hover:bg-green-600" : ""}`}
                        disabled={selecting}
                        onClick={() => handleSelectTeacher(teacher.teacher_id, teacher.teacher_name)}
                      >
                        {selecting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : isSelected ? (
                          <>
                            <CheckCircle className="h-3 w-3" />
                            تم الاختيار
                          </>
                        ) : (
                          "اختيار والاشتراك"
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* Video Dialog */}
      <Dialog open={showVideo} onOpenChange={setShowVideo}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>فيديو تعريفي - {activeVideoName}</DialogTitle>
          </DialogHeader>
          {activeVideoUrl && (
            <video src={activeVideoUrl} controls autoPlay className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>

      {/* Paywall Dialog */}
      {user && (
        <PaywallDialog
          open={showPaywall}
          onOpenChange={setShowPaywall}
          subjectName={category}
          grade={grade}
          stage={stage}
          section={section}
          studentId={user.id}
          teacherName={selectedTeacherName}
        />
      )}
    </>
  );
};

export default TeacherBanner;
