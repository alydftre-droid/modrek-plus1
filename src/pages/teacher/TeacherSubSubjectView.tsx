import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, Upload, ChevronLeft } from "lucide-react";
import SubSubjectsGrid, { SubSubjectRow } from "@/components/SubSubjectsGrid";

// Helper to check if category needs sub-subjects
function needsSubSubjects(category: string): boolean {
  const cat = (category || "").toLowerCase();
  return cat.includes("عربي") || cat === "arabic" || cat.includes("شرعي") || cat === "religious" || cat === "sharia";
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
  
  const [loading, setLoading] = useState(true);
  const [groupTitle, setGroupTitle] = useState("");
  
  useEffect(() => {
    if (groupId) {
      fetchGroupTitle();
    }
  }, [groupId]);
  
  const fetchGroupTitle = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("content_groups")
        .select("title")
        .eq("id", groupId)
        .maybeSingle();
      if (data) {
        setGroupTitle(data.title);
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
  
  const backTo = isAdminMode
    ? `/admin/upload/content?subjectId=${subjectId}&stage=${stage}&grade=${grade}&category=${category}`
    : `/teacher/subject?category=${encodeURIComponent(category)}&grade=${encodeURIComponent(grade)}&stage=${stage}`;
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  // If category doesn't need sub-subjects, redirect directly to upload content
  if (!needsSubSubjects(category)) {
    const basePrefix = isAdminMode ? "/admin/upload" : "/teacher/upload";
    const teacherParam = teacherIdOverride ? `&teacherId=${teacherIdOverride}` : "";
    navigate(
      `${basePrefix}/subject/${subjectId}?stage=${stage}&grade=${encodeURIComponent(grade)}&category=${encodeURIComponent(category)}&subjectName=${encodeURIComponent(subjectName)}&groupId=${groupId}${teacherParam}`
    );
    return null;
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to={isAdminMode ? "/admin" : "/teacher"} className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-azhari shadow-lg shadow-primary/20">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient-azhari">
              {isAdminMode ? "أزهاريون - وضع المطور" : "أزهاريون - لوحة المعلم"}
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
          userId={user?.id || ""}
          isTeacher={true}
          onSelectSubSubject={handleSelectSubSubject}
          onBack={() => navigate(backTo)}
        />
      </main>
    </div>
  );
};

export default TeacherSubSubjectView;
