import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen } from "lucide-react";
import { motion } from "framer-motion";

type TeacherAssignment = {
  stage: string;
  grade: string;
  section: string | null;
  category: string;
};

const gradeColors = [
  "from-blue-500 to-blue-600",
  "from-emerald-500 to-emerald-600", 
  "from-violet-500 to-violet-600",
];

const formatGrade = (g: string) => {
  if (g === "first") return "الأول";
  if (g === "second") return "الثاني";
  if (g === "third") return "الثالث";
  return g;
};

const formatStage = (s: string) => (s === "secondary" ? "الثانوي" : s === "preparatory" ? "الإعدادي" : s);

export default function TeacherSubjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState("");
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user?.id]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [profileRes, assignRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      supabase.from("teacher_assignments").select("stage, grade, section, category").eq("teacher_id", user.id),
    ]);
    if (profileRes.data) setTeacherName(profileRes.data.full_name);
    setAssignments((assignRes.data || []) as TeacherAssignment[]);
    setLoading(false);
  };

  const grouped = assignments.reduce((acc, curr) => {
    const key = `${curr.category}-${curr.stage}`;
    if (!acc[key]) acc[key] = { category: curr.category, stage: curr.stage, grades: [] };
    if (!acc[key].grades.includes(curr.grade)) acc[key].grades.push(curr.grade);
    return acc;
  }, {} as Record<string, { category: string; stage: string; grades: string[] }>);

  if (loading) {
    return (
      <TeacherSidebarLayout title="المواد الدراسية" teacherName={teacherName}>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
      </TeacherSidebarLayout>
    );
  }

  return (
    <TeacherSidebarLayout title="المواد الدراسية" teacherName={teacherName}>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        {Object.values(grouped).map((group) => (
          <div key={`${group.category}-${group.stage}`} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-1 rounded-full bg-primary" />
              <div>
                <h2 className="text-lg font-bold">{group.category}</h2>
                <p className="text-sm text-muted-foreground">المرحلة {formatStage(group.stage)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.grades.map((grade, i) => (
                <motion.div key={grade} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                  <Card
                    className="cursor-pointer hover:shadow-lg transition-all overflow-hidden border-0"
                    onClick={() =>
                      navigate(`/teacher/subject?category=${encodeURIComponent(group.category)}&grade=${encodeURIComponent(grade)}&stage=${group.stage}`)
                    }
                  >
                    <CardContent className="p-0">
                      <div className={`bg-gradient-to-br ${gradeColors[i % gradeColors.length]} p-5 text-white`}>
                        <BookOpen className="h-8 w-8 mb-3 opacity-80" />
                        <h3 className="text-lg font-bold">الصف {formatGrade(grade)}</h3>
                        <p className="text-white/60 text-sm">{group.category}</p>
                      </div>
                      <div className="p-3 bg-card">
                        <Badge variant="outline" className="text-xs">{formatStage(group.stage)}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </TeacherSidebarLayout>
  );
}
