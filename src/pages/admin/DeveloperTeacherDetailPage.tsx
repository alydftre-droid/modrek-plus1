import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowRight, GraduationCap } from "lucide-react";
import { TeacherOverviewTab } from "@/components/admin/developer/teacher/TeacherOverviewTab";
import { TeacherStudentsTab } from "@/components/admin/developer/teacher/TeacherStudentsTab";
import { TeacherSubscriptionsTab } from "@/components/admin/developer/teacher/TeacherSubscriptionsTab";
import { TeacherLogsTab } from "@/components/admin/developer/teacher/TeacherLogsTab";

export default function DeveloperTeacherDetailPage() {
  const { teacherId } = useParams<{ teacherId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<string>("overview");
  const [teacherName, setTeacherName] = useState<string>("");

  useEffect(() => {
    if (!teacherId) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", teacherId).maybeSingle();
      if (data?.full_name) setTeacherName(data.full_name);
    })();
  }, [teacherId]);

  if (!teacherId) return null;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-1">
              <ArrowRight className="h-4 w-4 rotate-180" /> رجوع
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 text-white flex items-center justify-center">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">{teacherName || "معلم"}</h1>
                <p className="text-[11px] text-slate-500">لوحة المطور — تحليل شامل بالوقت الحقيقي</p>
              </div>
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-white border border-slate-200 rounded-2xl p-1 w-full sm:w-auto">
            <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
            <TabsTrigger value="students">الطلاب</TabsTrigger>
            <TabsTrigger value="subs">الاشتراكات</TabsTrigger>
            <TabsTrigger value="logs">السجلات</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <TeacherOverviewTab teacherId={teacherId} onOpenStudents={() => setTab("students")} />
          </TabsContent>
          <TabsContent value="students" className="mt-4">
            <TeacherStudentsTab teacherId={teacherId} />
          </TabsContent>
          <TabsContent value="subs" className="mt-4">
            <TeacherSubscriptionsTab teacherId={teacherId} />
          </TabsContent>
          <TabsContent value="logs" className="mt-4">
            <TeacherLogsTab teacherId={teacherId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
