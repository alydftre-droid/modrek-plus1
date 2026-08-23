import { useState, useEffect } from "react";
import { Navigate, useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, Upload, ChevronLeft } from "lucide-react";
import SubSubjectsGrid, { SubSubjectRow } from "@/components/SubSubjectsGrid";
import { getCurrentTermForSubject } from "@/lib/termSystem";
import { categorySupportsSubSubjects, subjectHasSubSubjectPlan } from "@/lib/subSubjectDefaults";

// Helper to check if category needs sub-subjects
function needsSubSubjects(category: string, subjectName?: string | null): boolean {
  return categorySupportsSubSubjects(category) || categorySupportsSubSubjects(subjectName);
}

const TeacherSubSubjectView = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subjectId } = useParams();
  const [searchParams] = useSearchParams();
  
  const groupId = searchParams.get("groupId") || "";
  const category = searchParams.get("category") || "";
  const stage = searchParams.get("stage") || "";
  const grade = searchParams.get("grade") || "";
  const subjectName = searchParams.get("subjectName") || "";
  const teacherIdOverride = searchParams.get("teacherId");
  const isAdminMode = !!teacherIdOverride;
  const effectiveUserId = teacherIdOverride || user?.id || "";
  const [currentTerm, setCurrentTerm] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [groupTitle, setGroupTitle] = useState("");

  const backTo = isAdminMode
    ? `/admin/upload/content?subjectId=${subjectId}&stage=${stage}&grade=${grade}&category=${category}`
    : `/teacher/subject?category=${encodeURIComponent(category)}&grade=${encodeURIComponent(grade)}&stage=${stage}`;

  const uploadUrl = (() => {
    const basePrefix = isAdminMode ? "/admin/upload" : "/teacher/upload";
    const teacherParam = teacherIdOverride ? `&teacherId=${teacherIdOverride}` : "";
    return `${basePrefix}/subject/${subjectId}?stage=${stage}&grade=${encodeURIComponent(grade)}&category=${encodeURIComponent(category)}&subjectName=${encodeURIComponent(subjectName)}&groupId=${groupId}${teacherParam}`;
  })();

  useEffect(() => {
    if (!subjectId) return;
    (async () => {
      setCurrentTerm(await getCurrentTermForSubject(subjectId));
    })();
  }, [subjectId]);
  
  useEffect(() => {
    if (groupId && currentTerm) {
      fetchGroupTitle();
    }
  }, [groupId, currentTerm]);
  
  const fetchGroupTitle = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("content_groups")
        .select("title")
        .eq("id", groupId)
        .eq("term", currentTerm)
        .or(`teacher_id.eq.${effectiveUserId},created_by.eq.${effectiveUserId}`)
        .maybeSingle();
      if (!data) {
        navigate(backTo, { replace: true });
        return;
      }
      setGroupTitle(data.title);

      // Data-driven guard: subjects that genuinely have no sections must open
      // the upload screen directly instead of showing an empty sections page.
      const [{ data: subjectRow }, { data: existingSubs }] = await Promise.all([
        supabase
          .from("subjects")
          .select("category, stage, grade, section, name")
          .eq("id", subjectId)
          .maybeSingle(),
        supabase
          .from("sub_subjects")
          .select("id")
          .eq("group_id", groupId)
          .eq("is_active", true)
          .limit(1),
      ]);

      const hasCreatedSections = (existingSubs || []).length > 0;
      const hasPlan = subjectRow
        ? subjectHasSubSubjectPlan(subjectRow)
        : needsSubSubjects(category, subjectName);

      if (!hasCreatedSections && !hasPlan) {
        navigate(uploadUrl, { replace: true });
        return;
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  
  const handleSelectSubSubject = (sub: SubSubjectRow) => {
    const basePrefix = isAdminMode ? "/admin/upload" : "/teacher/upload";
    const teacherParam = teacherIdOverride ? `&teacherId=${teacherIdOverride}` : "";
    navigate(
      `${basePrefix}/subject/${subjectId}?stage=${stage}&grade=${encodeURIComponent(grade)}&category=${encodeURIComponent(category)}&subjectName=${encodeURIComponent(subjectName)}&groupId=${groupId}&subSubjectId=${sub.id}&subSubjectName=${encodeURIComponent(sub.name)}${teacherParam}`
    );
  };
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  // If category doesn't need sub-subjects, redirect directly to upload content
  if (!needsSubSubjects(category, subjectName)) {
    return <Navigate to={uploadUrl} replace />;
  }

  
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to={isAdminMode ? "/admin" : "/teacher"} className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-mudrik shadow-lg shadow-primary/20">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient-mudrik">
              {isAdminMode ? "مدرك Plus - وضع المطور" : "مدرك Plus - لوحة المعلم"}
            </span>
          </Link>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <Upload className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">{isAdminMode ? "وضع المطور" : "وضع الرفع"}</span>
          </div>
        </div>
      </header>
      
      <main className="container px-4 py-8">
        <SubSubjectsGrid
          groupId={groupId}
          groupTitle={groupTitle}
          category={category}
          subjectName={subjectName}
          userId={effectiveUserId}
          isTeacher={true}
          onSelectSubSubject={handleSelectSubSubject}
          onBack={() => navigate(backTo)}
        />
      </main>
    </div>
  );
};

export default TeacherSubSubjectView;
