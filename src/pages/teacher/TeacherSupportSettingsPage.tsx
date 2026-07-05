import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import SupportChannelsView from "@/components/support/SupportChannelsView";

export default function TeacherSupportSettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [teacherName, setTeacherName] = useState("");
  const [teacherAvatar, setTeacherAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) { setTeacherName(data.full_name); setTeacherAvatar(data.avatar_url); }
      });
  }, [user?.id]);

  return (
    <TeacherSidebarLayout title="التواصل مع الدعم" teacherName={teacherName} teacherAvatar={teacherAvatar}>
      <SupportChannelsView audience="teacher" assistantPath="/teacher/assistant" onBack={() => navigate("/teacher/settings")} />
    </TeacherSidebarLayout>
  );
}
