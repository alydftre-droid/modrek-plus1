import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import TeacherStudentAnalytics from "@/components/teacher/TeacherStudentAnalytics";
import { Loader2 } from "lucide-react";

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
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <TeacherStudentAnalytics />
      </div>
    </TeacherSidebarLayout>
  );
}
