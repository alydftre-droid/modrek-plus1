import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Users, Search, ChevronLeft, BookOpen, Video,
  ClipboardList, CheckCircle2, XCircle, Eye
} from "lucide-react";
import { motion } from "framer-motion";
import {
  gradeKeyFromArabicLabel, stageKeyFromValue, subjectFilterFromTeacherSelection,
  gradeDisplayFromAny, stageDisplayFromAny,
} from "@/lib/teacherSubjectUtils";
import { reportTeacherScopedStudentIds } from "@/lib/testStudentLeakGuard";

interface StudentDetail {
  id: string;
  name: string;
  code: string | null;
  grade: string;
  joined_at: string;
}

interface StudentProfile {
  purchases: { group_title: string; purchased_at: string; amount: number }[];
  exams: { title: string; score: number; total: number; submitted_at: string }[];
  unwatchedVideos: string[];
  watchedVideos: string[];
  missedExams: string[];
}

export default function TeacherStudentManagement() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const category = params.get("category") || "";
  const grade = params.get("grade") || "";
  const stage = params.get("stage") || "";
  const tab = params.get("tab") || "all";

  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState("");
  const [students, setStudents] = useState<StudentDetail[]>([]);
  const [subscribedStudents, setSubscribedStudents] = useState<StudentDetail[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentDetail | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchStudents();
  }, [user?.id, category, grade, stage]);

  const fetchStudents = async () => {
    if (!user) return;
    setLoading(true);

    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    if (profile) setTeacherName(profile.full_name);

    // Normalize grade/stage/category to DB keys
    const gradeKey = gradeKeyFromArabicLabel(grade) || grade;
    const stageKey = stageKeyFromValue(stage) || stage;
    const subjectFilter = subjectFilterFromTeacherSelection(category);
    const categoryKey = subjectFilter?.categoryKey || category;

    // All students who chose this teacher - use exact match on normalized keys
    let choicesQuery = supabase
      .from("student_teacher_choices")
      .select("student_id, grade, created_at")
      .eq("teacher_id", user.id);

    // Try multiple grade formats for robustness
    if (gradeKey) {
      choicesQuery = choicesQuery.eq("grade", gradeKey);
    }

    const { data: choices } = await choicesQuery;
    reportTeacherScopedStudentIds("student_teacher_choices", (choices || []).map(c => c.student_id), {
      page: "TeacherStudentManagement",
      tab,
      grade: gradeKey,
      stage: stageKey,
      category: categoryKey,
    });

    const studentIds = [...new Set((choices || []).map(c => c.student_id))];
    if (studentIds.length === 0) { setStudents([]); setSubscribedStudents([]); setLoading(false); return; }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, student_code")
      .in("id", studentIds)
      .eq("is_test_account", false);

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const allStudents: StudentDetail[] = (choices || []).flatMap(c => {
      const p = profileMap.get(c.student_id);
      if (!p) return [];
      return [{ id: c.student_id, name: p.full_name || "طالب", code: p.student_code || null, grade: c.grade, joined_at: c.created_at }];
    });

    const seen = new Set<string>();
    const unique = allStudents.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
    setStudents(unique);

    // Subscribed students
    let subjectsQuery = supabase
      .from("subjects")
      .select("id")
      .eq("category", categoryKey)
      .eq("grade", gradeKey)
      .eq("stage", stageKey);
    if (subjectFilter?.subjectName) {
      subjectsQuery = subjectsQuery.eq("name", subjectFilter.subjectName);
    }
    const { data: subjects } = await subjectsQuery;
    const subjectIds = subjects?.map(s => s.id) || [];

    if (subjectIds.length > 0) {
      const { data: groups } = await supabase
        .from("content_groups")
        .select("id")
        .in("subject_id", subjectIds)
        .or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`);
      const groupIds = groups?.map(g => g.id) || [];

      if (groupIds.length > 0) {
        const { data: purchases } = await supabase
          .from("student_group_purchases")
          .select("student_id")
          .in("group_id", groupIds)
          .in("student_id", studentIds);
        reportTeacherScopedStudentIds("student_group_purchases", (purchases || []).map(p => p.student_id), {
          page: "TeacherStudentManagement",
          tab: "subscribed",
          grade: gradeKey,
          stage: stageKey,
          category: categoryKey,
        });

        const subIds = [...new Set((purchases || []).map(p => p.student_id))];
        setSubscribedStudents(unique.filter(s => subIds.includes(s.id)));
      } else {
        setSubscribedStudents([]);
      }
    } else {
      setSubscribedStudents([]);
    }

    setLoading(false);
  };

  const fetchStudentProfile = async (student: StudentDetail) => {
    if (!user) return;
    setSelectedStudent(student);
    setLoadingProfile(true);

    const gradeKey = gradeKeyFromArabicLabel(grade) || grade;
    const stageKey = stageKeyFromValue(stage) || stage;
    const subjectFilter = subjectFilterFromTeacherSelection(category);
    const categoryKey = subjectFilter?.categoryKey || category;

    let subjectsQuery = supabase
      .from("subjects").select("id")
      .eq("category", categoryKey).eq("grade", gradeKey).eq("stage", stageKey);
    if (subjectFilter?.subjectName) {
      subjectsQuery = subjectsQuery.eq("name", subjectFilter.subjectName);
    }
    const { data: subjects } = await subjectsQuery;
    const subjectIds = subjects?.map(s => s.id) || [];

    let purchases: any[] = [];
    if (subjectIds.length > 0) {
      const { data: groups } = await supabase
        .from("content_groups").select("id, title, price")
        .in("subject_id", subjectIds)
        .or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`);
      const groupMap = new Map((groups || []).map(g => [g.id, g]));
      const groupIds = groups?.map(g => g.id) || [];

      if (groupIds.length > 0) {
        const { data: purch } = await supabase
          .from("student_group_purchases")
          .select("group_id, purchased_at, amount_paid")
          .eq("student_id", student.id)
          .in("group_id", groupIds);
        reportTeacherScopedStudentIds("student_group_purchases", [student.id], {
          page: "TeacherStudentManagement.profile",
          rows: (purch || []).length,
        });
        purchases = (purch || []).map(p => {
          const g = groupMap.get(p.group_id);
          return { group_title: g?.title || "", purchased_at: p.purchased_at, amount: p.amount_paid || 0 };
        });
      }
    }

    let exams: any[] = [];
    let missedExams: string[] = [];
    if (subjectIds.length > 0) {
      const { data: allExams } = await supabase
        .from("exams").select("id, title")
        .eq("created_by", user.id).eq("is_published", true).in("subject_id", subjectIds);

      const { data: attempts } = await supabase
        .from("exam_attempts").select("exam_id, score:total_score, total:max_score, submitted_at")
        .eq("student_id", student.id);
      reportTeacherScopedStudentIds("exam_attempts", [student.id], {
        page: "TeacherStudentManagement.profile",
        rows: (attempts || []).length,
      });

      const attemptMap = new Map((attempts || []).map(a => [a.exam_id, a]));
      (allExams || []).forEach(exam => {
        const attempt = attemptMap.get(exam.id);
        if (attempt) {
          exams.push({ title: exam.title, score: attempt.score, total: attempt.total, submitted_at: attempt.submitted_at });
        } else {
          missedExams.push(exam.title);
        }
      });
    }

    let watchedVideos: string[] = [];
    let unwatchedVideos: string[] = [];
    if (subjectIds.length > 0) {
      const { data: allContent } = await supabase
        .from("content").select("id, title")
        .eq("uploaded_by", user.id).eq("type", "video").eq("is_active", true).in("subject_id", subjectIds);

      const { data: progress } = await supabase
        .from("video_progress").select("content_id, progress_seconds, duration_seconds")
        .eq("user_id", student.id);
      reportTeacherScopedStudentIds("video_progress", [student.id], {
        page: "TeacherStudentManagement.profile",
        rows: (progress || []).length,
      });

      const progressMap = new Map((progress || []).map(p => [p.content_id, p]));
      (allContent || []).forEach(c => {
        const p = progressMap.get(c.id);
        if (p && p.progress_seconds > 10) {
          watchedVideos.push(c.title);
        } else {
          unwatchedVideos.push(c.title);
        }
      });
    }

    setStudentProfile({ purchases, exams, missedExams, watchedVideos, unwatchedVideos });
    setLoadingProfile(false);
  };

  const pageTitle = `إدارة الطلاب - الصف ${gradeDisplayFromAny(grade)} ${stageDisplayFromAny(stage)}`;

  const displayList = tab === "subscribed" ? subscribedStudents : students;
  const filtered = displayList.filter(s =>
    !searchQuery || s.name.includes(searchQuery) || (s.code || "").includes(searchQuery)
  );

  if (selectedStudent) {
    return (
      <TeacherSidebarLayout title="ملف الطالب" teacherName={teacherName}>
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4" dir="rtl">
          <Button variant="ghost" onClick={() => { setSelectedStudent(null); setStudentProfile(null); }} className="gap-1">
            <ChevronLeft className="h-4 w-4 rotate-180" />
            رجوع لقائمة الطلاب
          </Button>

          <Card className="overflow-hidden border-0">
            <div className="bg-gradient-to-br from-primary to-primary/80 p-5 text-primary-foreground">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                  <Users className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{selectedStudent.name}</h2>
                  {selectedStudent.code && <p className="text-primary-foreground/70 text-sm">كود: #{selectedStudent.code}</p>}
                  <p className="text-primary-foreground/60 text-xs">تاريخ التسجيل: {new Date(selectedStudent.joined_at).toLocaleDateString("ar-EG")}</p>
                </div>
              </div>
            </div>
          </Card>

          {loadingProfile ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : studentProfile && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-bold flex items-center gap-2 mb-3"><BookOpen className="h-4 w-4 text-primary" /> المجموعات المشترك بها</h3>
                  {studentProfile.purchases.length === 0 ? (
                    <p className="text-sm text-muted-foreground">لا يوجد اشتراكات</p>
                  ) : (
                    <div className="space-y-2">
                      {studentProfile.purchases.map((p, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-accent/50 text-sm">
                          <span className="font-medium">{p.group_title}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{p.amount} جنيه</Badge>
                            <span className="text-xs text-muted-foreground">{new Date(p.purchased_at).toLocaleDateString("ar-EG")}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <h3 className="font-bold flex items-center gap-2 mb-3"><ClipboardList className="h-4 w-4 text-violet-500" /> الامتحانات</h3>
                  {studentProfile.exams.length === 0 && studentProfile.missedExams.length === 0 ? (
                    <p className="text-sm text-muted-foreground">لا يوجد امتحانات</p>
                  ) : (
                    <div className="space-y-2">
                      {studentProfile.exams.map((e, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-sm">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            <span>{e.title}</span>
                          </div>
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-0">
                            {e.score}/{e.total}
                          </Badge>
                        </div>
                      ))}
                      {studentProfile.missedExams.map((title, i) => (
                        <div key={`missed-${i}`} className="flex items-center justify-between p-2 rounded-lg bg-red-50 dark:bg-red-950/30 text-sm">
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-400" />
                            <span>{title}</span>
                          </div>
                          <Badge variant="secondary" className="text-xs">لم يحل</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <h3 className="font-bold flex items-center gap-2 mb-3"><Video className="h-4 w-4 text-red-500" /> الفيديوهات</h3>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-center">
                      <p className="text-lg font-bold text-emerald-600">{studentProfile.watchedVideos.length}</p>
                      <p className="text-xs text-muted-foreground">شاهدها</p>
                    </div>
                    <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 text-center">
                      <p className="text-lg font-bold text-orange-600">{studentProfile.unwatchedVideos.length}</p>
                      <p className="text-xs text-muted-foreground">لم يشاهدها</p>
                    </div>
                  </div>
                  {studentProfile.unwatchedVideos.length > 0 && (
                    <div className="space-y-1 mt-2">
                      <p className="text-xs text-muted-foreground">لم يشاهد:</p>
                      {studentProfile.unwatchedVideos.slice(0, 5).map((v, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-accent/50">
                          <Eye className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate">{v}</span>
                        </div>
                      ))}
                      {studentProfile.unwatchedVideos.length > 5 && (
                        <p className="text-xs text-muted-foreground">و {studentProfile.unwatchedVideos.length - 5} أخرى...</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </TeacherSidebarLayout>
    );
  }

  return (
    <TeacherSidebarLayout title={pageTitle} teacherName={teacherName}>
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4" dir="rtl">
        <Button variant="ghost" onClick={() => navigate(`/teacher/grade?category=${encodeURIComponent(category)}&grade=${encodeURIComponent(grade)}&stage=${stage}`)} className="gap-1">
          <ChevronLeft className="h-4 w-4 rotate-180" />
          رجوع
        </Button>

        <Tabs value={tab} onValueChange={v => {
          const url = new URL(window.location.href);
          url.searchParams.set("tab", v);
          navigate(`${url.pathname}?${url.searchParams.toString()}`, { replace: true });
        }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="all" className="gap-1">
              <Users className="h-4 w-4" />
              جميع الطلاب ({students.length})
            </TabsTrigger>
            <TabsTrigger value="subscribed" className="gap-1">
              <BookOpen className="h-4 w-4" />
              المشتركين ({subscribedStudents.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم أو الكود..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pr-10"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">لا يوجد طلاب</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((student, i) => (
              <motion.div key={student.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
                <Card
                  className="cursor-pointer hover:shadow-md transition-all border-0"
                  onClick={() => fetchStudentProfile(student)}
                >
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">{student.name}</p>
                        {student.code && <p className="text-xs text-muted-foreground">#{student.code}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {new Date(student.joined_at).toLocaleDateString("ar-EG")}
                      </Badge>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </TeacherSidebarLayout>
  );
}
