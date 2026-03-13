import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import TeacherProfileEditor from "@/components/teacher/TeacherProfileEditor";
import TeacherScheduleManager from "@/components/teacher/TeacherScheduleManager";
import { Loader2 } from "lucide-react";

export default function TeacherProfilePage() {
  const { user } = useAuth();
  const [teacherName, setTeacherName] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setTeacherName(data.full_name); });
  }, [user?.id]);

  return (
    <TeacherSidebarLayout title="السيرة الذاتية" teacherName={teacherName}>
      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
        <TeacherScheduleManager />
        <TeacherProfileEditor />
      </div>
    </TeacherSidebarLayout>
  );
}
