import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import TeacherProfileEditor from "@/components/teacher/TeacherProfileEditor";
import TeacherScheduleManager from "@/components/teacher/TeacherScheduleManager";
import TeacherProfileCard from "@/components/teacher/TeacherProfileCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, GraduationCap, Star, Users, Video } from "lucide-react";

export default function TeacherProfilePage() {
  const { user } = useAuth();
  const [teacherName, setTeacherName] = useState("");
  const [profilePreview, setProfilePreview] = useState<any>(null);
  const [stats, setStats] = useState({ students: 0, groups: 0, subscribers: 0, videos: 0 });

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      supabase.from("teacher_profiles").select("*").eq("teacher_id", user.id).maybeSingle(),
      supabase.from("student_teacher_choices").select("student_id" as any).eq("teacher_id", user.id),
      supabase.from("content_groups").select("id" as any).or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`),
      supabase.from("student_group_purchases").select("id, group_id" as any),
      supabase.from("content").select("id" as any).eq("uploaded_by", user.id).eq("type", "video"),
    ]).then(([profileRes, teacherProfileRes, choicesRes, groupsRes, purchasesRes, videosRes]) => {
      if (profileRes.data) setTeacherName(profileRes.data.full_name);
      if (teacherProfileRes.data) setProfilePreview(teacherProfileRes.data);

      const groupIds = new Set((groupsRes.data || []).map((item: any) => item.id));
      const subscribers = (purchasesRes.data || []).filter((row: any) => groupIds.has(row.group_id)).length;
      setStats({
        students: new Set((choicesRes.data || []).map((row: any) => row.student_id)).size,
        groups: groupIds.size,
        subscribers,
        videos: (videosRes.data || []).length,
      });
    });
  }, [user?.id]);

  const previewQualifications = useMemo(
    () => Array.isArray(profilePreview?.qualifications) ? profilePreview.qualifications.map((item: any) => item?.title).filter(Boolean) : [],
    [profilePreview?.qualifications],
  );

  const previewAchievements = useMemo(
    () => Array.isArray(profilePreview?.achievements) ? profilePreview.achievements.map((item: any) => item?.title).filter(Boolean) : [],
    [profilePreview?.achievements],
  );

  return (
    <TeacherSidebarLayout title="السيرة الذاتية" teacherName={teacherName}>
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        <section className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="teacher-hero-card !px-6 !py-6">
            <div className="relative z-10 space-y-4">
              <Badge className="bg-white/20 text-white border-white/20">واجهة السيرة الذاتية الاحترافية</Badge>
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-white">{teacherName || "السيرة الذاتية للمعلم"}</h1>
                <p className="text-white/80 text-sm md:text-base mt-2">ابنِ بطاقة تعريف قوية تظهر للطالب خبرتك وإنجازاتك ومحتواك في أول نظرة.</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatPill icon={<Users className="h-4 w-4" />} label="الطلاب" value={stats.students} />
                <StatPill icon={<BookOpen className="h-4 w-4" />} label="المجموعات" value={stats.groups} />
                <StatPill icon={<GraduationCap className="h-4 w-4" />} label="المشتركين" value={stats.subscribers} />
                <StatPill icon={<Video className="h-4 w-4" />} label="الفيديوهات" value={stats.videos} />
              </div>
            </div>
          </div>

          <Card className="border border-border/60 shadow-none overflow-hidden">
            <CardContent className="p-4">
              <TeacherProfileCard
                teacherId={user?.id || ""}
                teacherName={teacherName || "اسم المعلم"}
                bio={profilePreview?.bio || "نبذة المعلم ستظهر هنا بعد الحفظ"}
                photoUrl={profilePreview?.photo_url || null}
                videoUrl={profilePreview?.video_url || null}
                coverImageUrl={profilePreview?.cover_image_url || null}
                professionalTitle={profilePreview?.professional_title || null}
                experienceYears={profilePreview?.experience_years || 0}
                qualifications={previewQualifications}
                achievements={previewAchievements}
                category="بطاقة المعلم"
                grades={[]}
                onSelect={() => undefined}
              />
            </CardContent>
          </Card>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border border-border/60 shadow-none"><CardContent className="p-5"><div className="flex items-center gap-3 mb-3"><Star className="h-5 w-5 text-primary" /><h2 className="font-bold">الانطباع الأول</h2></div><p className="text-sm text-muted-foreground">صورة غلاف + عنوان مهني + صورة شخصية تعطي الطالب ثقة أسرع قبل الاشتراك.</p></CardContent></Card>
          <Card className="border border-border/60 shadow-none"><CardContent className="p-5"><div className="flex items-center gap-3 mb-3"><GraduationCap className="h-5 w-5 text-primary" /><h2 className="font-bold">المصداقية</h2></div><p className="text-sm text-muted-foreground">أظهر المؤهلات والإنجازات وروابط التواصل والمعرض لإبراز خبرتك التعليمية بصورة احترافية.</p></CardContent></Card>
          <Card className="border border-border/60 shadow-none"><CardContent className="p-5"><div className="flex items-center gap-3 mb-3"><BookOpen className="h-5 w-5 text-primary" /><h2 className="font-bold">التحويل للاشتراك</h2></div><p className="text-sm text-muted-foreground">السيرة الجديدة تدعم الفيديو التعريفي والمحتوى البصري لتقوية قرار الطالب بالاختيار والاشتراك.</p></CardContent></Card>
        </div>

        <TeacherScheduleManager />
        <TeacherProfileEditor />
      </div>
    </TeacherSidebarLayout>
  );
}

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/15 bg-white/10 px-3 py-3 text-white backdrop-blur-sm">
      <div className="flex items-center gap-2 text-xs text-white/80">{icon}<span>{label}</span></div>
      <p className="mt-2 text-xl font-black">{value}</p>
    </div>
  );
}
