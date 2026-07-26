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
  Star,
} from "lucide-react";
import { toast } from "sonner";
import PaywallDialog from "@/components/subscription/PaywallDialog";
import { gradeKeyFromArabicLabel } from "@/lib/teacherSubjectUtils";
import { normalizeSectionForSubjects } from "@/lib/educationSection";
import { buildTeacherEducationTypeMap, filterAssignmentsForStudent, TEACHER_ASSIGNMENT_CATEGORY_VARIANTS, TEACHER_ASSIGNMENT_GRADE_VARIANTS } from "@/lib/teacherFiltering";

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

interface TeacherRequestMatch {
  user_id: string;
  assigned_grades: string[] | null;
  assigned_stages: string[] | null;
  education_type: string | null;
}

interface TeacherBannerProps {
  category: string;
  stage: string;
  grade: string;
  section?: string | null;
  onTeacherSelected?: (teacherId: string) => void;
  onDismiss?: () => void;
}

const TeacherBanner = ({ category, stage, grade, section, onTeacherSelected, onDismiss }: TeacherBannerProps) => {
  const { user } = useAuth();
  const normalizedSection = normalizeSectionForSubjects(section);
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
  }, [user, category, stage, grade, section]);

  const fetchTeachers = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [choiceDataRes, studentProfileRes] = await Promise.all([
        supabase
          .from("student_teacher_choices")
          .select("teacher_id")
          .eq("student_id", user.id)
          .eq("category", category)
          .eq("stage", stage)
          .eq("grade", grade)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("education_type")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      const choiceData = choiceDataRes.data;
      const studentEducationType = (studentProfileRes.data as any)?.education_type || null;

      if (choiceData) {
        setExistingChoice(choiceData.teacher_id);
        setSelectedTeacherId(choiceData.teacher_id);
      }

      const categoriesToSearch = TEACHER_ASSIGNMENT_CATEGORY_VARIANTS[category]
        || [category, categoryToArabic[category] || category].filter((v, i, a) => a.indexOf(v) === i);
      const gradePatterns = TEACHER_ASSIGNMENT_GRADE_VARIANTS[grade] || gradeToArabicPatterns[grade] || [grade];

      const [{ data: assignments, error: assignError }, { data: requestMatches }] = await Promise.all([
        supabase
          .from("teacher_assignments")
          .select("teacher_id, grade, section, education_type")
          .in("category", categoriesToSearch)
          .eq("stage", stage)
          .in("grade", gradePatterns),
        supabase
          .from("approved_teacher_assignments" as any).select("user_id, assigned_grades, assigned_stages, education_type")
          .in("assigned_category", categoriesToSearch),
      ]);

      if (assignError) throw assignError;

      const requestAssignments = ((requestMatches as TeacherRequestMatch[] | null) || [])
        .filter((request) => (request.assigned_stages || []).includes(stage) && (request.assigned_grades || []).some((requestGrade) => gradePatterns.includes(requestGrade)))
        .map((request) => ({
          teacher_id: request.user_id,
          grade,
          section: null,
          education_type: request.education_type,
        }));

      const combinedAssignments = [...(assignments || []), ...requestAssignments].filter((assignment, index, list) => {
        const key = `${assignment.teacher_id}|${assignment.grade}|${assignment.section || ""}|${assignment.education_type || ""}`;
        return index === list.findIndex((item) => `${item.teacher_id}|${item.grade}|${item.section || ""}|${item.education_type || ""}` === key);
      });

      const teacherEducationTypeMap = buildTeacherEducationTypeMap(requestMatches as TeacherRequestMatch[] | null);

      const filteredAssignments = filterAssignmentsForStudent({
        assignments: combinedAssignments,
        category,
        normalizedSection,
        studentEducationType,
        teacherEducationTypeMap,
      });

      if (!filteredAssignments || filteredAssignments.length === 0) {
        setTeachers([]);
        setLoading(false);
        return;
      }

      const teacherIds = [...new Set(filteredAssignments.map(a => a.teacher_id))];

      const [{ data: profileRows }, { data: teacherProfiles }, { data: fallbackProfiles }] = await Promise.all([
        supabase.from("teacher_profiles").select("teacher_id, bio, photo_url, video_url").in("teacher_id", teacherIds).eq("is_approved", true),
        supabase.from("public_teacher_profiles" as any).select("id, full_name").in("id", teacherIds),
        supabase.from("teacher_directory" as any).select("id, full_name").in("id", teacherIds),
      ]);

      const normalizeName = (name?: string | null) => (name || "").trim();
      const nameMap = new Map(teacherProfiles?.map(p => [p.id, normalizeName(p.full_name)]) || []);
      const fallbackNameMap = new Map(fallbackProfiles?.map(p => [p.id, normalizeName(p.full_name)]) || []);
      const profileMap = new Map((profileRows || []).map((profile) => [profile.teacher_id, profile]));

      const gradesByTeacher = new Map<string, string[]>();
      filteredAssignments.forEach(a => {
        const normalizedGrade = gradeKeyFromArabicLabel(a.grade) || a.grade;
        const existing = gradesByTeacher.get(a.teacher_id) || [];
        if (!existing.includes(normalizedGrade)) existing.push(normalizedGrade);
        gradesByTeacher.set(a.teacher_id, existing);
      });

      const teacherList: TeacherInfo[] = teacherIds.map((teacherId) => {
        const profile = profileMap.get(teacherId);
        return {
          teacher_id: teacherId,
          teacher_name: nameMap.get(teacherId) || fallbackNameMap.get(teacherId) || "اسم المعلم غير متاح",
          bio: profile?.bio || null,
          photo_url: profile?.photo_url || null,
          video_url: profile?.video_url || null,
          grades: gradesByTeacher.get(teacherId) || [],
        };
      });

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (teachers.length === 0) return null;

  return (
    <>
      <div className="relative">
        {/* Close button */}
        <button
          onClick={() => onDismiss?.()}
          className="absolute top-4 left-4 z-10 p-2 rounded-full bg-background/90 hover:bg-background border border-border shadow-sm transition-all hover:shadow-md"
          aria-label="إغلاق"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Users className="h-5 w-5 text-primary" />
            <span className="text-sm font-bold text-primary">معلمو هذا القسم</span>
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">اختر معلمك المفضل</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            اختر المعلم الذي تريد الاشتراك معه، وسيظهر لك محتواه الخاص فقط
          </p>
        </div>

        {/* Teachers list - VERTICAL stack */}
        <div className="flex flex-col gap-4 max-w-2xl mx-auto">
          {teachers.map((teacher, index) => {
            const isSelected = selectedTeacherId === teacher.teacher_id;
            return (
              <Card
                key={teacher.teacher_id}
                className={`overflow-hidden transition-all duration-300 hover:shadow-xl ${
                  isSelected
                    ? "border-2 border-primary shadow-lg shadow-primary/10 bg-primary/[0.02]"
                    : "border border-border/60 hover:border-primary/40"
                }`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Teacher photo - larger */}
                    <div className="relative shrink-0">
                      <Avatar className={`h-20 w-20 border-3 shadow-lg ${isSelected ? 'border-primary' : 'border-background'}`}>
                        <AvatarImage src={teacher.photo_url || undefined} className="object-cover" />
                        <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground text-xl">
                          <GraduationCap className="h-8 w-8" />
                        </AvatarFallback>
                      </Avatar>
                      {isSelected && (
                        <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1 shadow">
                          <CheckCircle className="h-4 w-4 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Teacher info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-foreground">{teacher.teacher_name}</h3>
                        {isSelected && (
                          <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">
                            <Star className="h-3 w-3 ml-1" />
                            معلمك الحالي
                          </Badge>
                        )}
                      </div>

                      {teacher.bio && (
                        <p className="text-sm text-muted-foreground leading-relaxed mb-3 line-clamp-3">
                          {teacher.bio}
                        </p>
                      )}

                      {teacher.grades.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {teacher.grades.map(g => (
                            <Badge key={g} variant="secondary" className="text-xs px-2 py-0.5">
                              الصف {formatGrade(g)}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2">
                        {teacher.video_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => {
                              setActiveVideoUrl(teacher.video_url);
                              setActiveVideoName(teacher.teacher_name);
                              setShowVideo(true);
                            }}
                          >
                            <Play className="h-4 w-4" />
                            فيديو تعريفي
                          </Button>
                        )}
                        <Button
                          size="sm"
                          className={`gap-1.5 ${isSelected ? "bg-green-500 hover:bg-green-600" : ""}`}
                          disabled={selecting}
                          onClick={() => handleSelectTeacher(teacher.teacher_id, teacher.teacher_name)}
                        >
                          {selecting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isSelected ? (
                            <>
                              <CheckCircle className="h-4 w-4" />
                              تم الاختيار
                            </>
                          ) : (
                            "اختيار والاشتراك"
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
