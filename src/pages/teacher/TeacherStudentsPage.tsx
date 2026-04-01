import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import TeacherStudentAnalytics from "@/components/teacher/TeacherStudentAnalytics";
import { Users } from "lucide-react";

export default function TeacherStudentsPage() {
  const { user } = useAuth();
  const [teacherName, setTeacherName] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setTeacherName(data.full_name); });
  }, [user?.id]);

  return (
    <TeacherSidebarLayout title="إدارة الطلاب" teacherName={teacherName}>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        {/* Mini Header */}
        <div className="teacher-hero-card !py-5 !px-6">
          <div className="relative z-10 flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">إدارة الطلاب</h1>
              <p className="text-white/70 text-sm">متابعة الطلاب المسجلين والمشتركين</p>
            </div>
          </div>
        </div>

        <TeacherStudentAnalytics />
      </div>
    </TeacherSidebarLayout>
  );
}
