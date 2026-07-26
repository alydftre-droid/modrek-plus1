import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/student/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FolderOpen, BookOpen, ChevronLeft, User as UserIcon } from "lucide-react";
import { motion } from "framer-motion";
import { getCurrentTermForStageGrade } from "@/lib/termSystem";

interface SubscribedGroup {
  id: string;
  group_id: string;
  group_title: string;
  group_image?: string | null;
  subject_name: string;
  subject_id: string;
  subject_stage?: string;
  subject_grade?: string;
  subject_section?: string | null;
  subject_category?: string;
  teacher_name: string;
  teacher_avatar?: string | null;
  month_label?: string | null;
  purchased_at: string;
}


export default function MyCoursesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState<SubscribedGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data: purchases } = await supabase
          .from("student_group_purchases")
          .select("id, group_id, purchased_at")
          .eq("student_id", user.id)
          .order("purchased_at", { ascending: false });

        if (!purchases?.length) { setLoading(false); return; }

        const groupIds = purchases.map(p => p.group_id);
        const { data: grps } = await supabase
          .from("content_groups")
          .select("id, title, image_url, month_label, subject_id, teacher_id, created_by, term")
          .in("id", groupIds);

        if (grps) {
          const subjectIds = [...new Set(grps.map(g => g.subject_id))];
          const { data: subjects } = await supabase.from("subjects").select("id, name, stage, grade, section, category").in("id", subjectIds);

          const activeTermBySubjectId = new Map<string, string>(
            await Promise.all(
              (subjects || []).map(async (subject) => [
                subject.id,
                await getCurrentTermForStageGrade(subject.stage, subject.grade),
              ] as const)
            )
          );

          const visibleGroups = grps.filter((group) => {
            const activeTerm = activeTermBySubjectId.get(group.subject_id) || "term1";
            return (group.term || "term1") === activeTerm;
          });

          const teacherIds = [...new Set(grps.map(g => g.teacher_id || g.created_by).filter(Boolean))];

          const [{ data: teachers }, { data: teacherProfiles }, { data: teacherPhotos }, { data: teacherDetails }] = teacherIds.length > 0
            ? await Promise.all([
                supabase.from("public_teacher_profiles" as any).select("id, full_name, avatar_url").in("id", teacherIds),
                supabase.from("teacher_directory" as any).select("id, full_name, avatar_url").in("id", teacherIds),
                supabase.from("teacher_profiles").select("teacher_id, photo_url").in("teacher_id", teacherIds).eq("is_approved", true),
                supabase.rpc("get_student_purchased_group_teacher_details" as any, { _student_id: user.id, _group_ids: groupIds }),
              ])
            : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

          const subjectMap = Object.fromEntries((subjects || []).map(s => [s.id, s]));
          const normalizeName = (name?: string | null) => (name || "").trim();
          const teacherMap = Object.fromEntries((teachers || []).map((t: any) => [t.id, { name: normalizeName(t.full_name), avatar: t.avatar_url }]));
          const profileTeacherMap = Object.fromEntries((teacherProfiles || []).map((t: any) => [t.id, { name: normalizeName(t.full_name), avatar: t.avatar_url }]));
          const teacherDetailsMap = Object.fromEntries(((teacherDetails as any[]) || []).map((t: any) => [t.group_id, { name: normalizeName(t.teacher_name), avatar: t.teacher_avatar }]));
          const teacherPhotoMap = Object.fromEntries((teacherPhotos || []).map((t: any) => [t.teacher_id, t.photo_url]));

          const enriched: SubscribedGroup[] = purchases.map(p => {
            const g = visibleGroups.find(gr => gr.id === p.group_id);
            const subj = subjectMap[g?.subject_id || ""];
            const teacherId = g?.teacher_id || g?.created_by || "";
            const details = teacherDetailsMap[p.group_id];
            const t = teacherMap[teacherId] || profileTeacherMap[teacherId];
            return {
              id: p.id,
              group_id: p.group_id,
              group_title: g?.title || "",
              group_image: g?.image_url,
              subject_name: subj?.name || "",
              subject_id: g?.subject_id || "",
              subject_stage: subj?.stage,
              subject_grade: subj?.grade,
              subject_section: subj?.section,
              subject_category: subj?.category,
              teacher_name: details?.name || t?.name || "اسم المعلم غير متاح",
              teacher_avatar: details?.avatar || teacherPhotoMap[teacherId] || t?.avatar || null,
              month_label: g?.month_label,
              purchased_at: p.purchased_at,
            };
          }).filter(g => g.group_title);


          setGroups(enriched);
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [user]);

  const gradientColors = [
    "from-blue-500 via-blue-600 to-indigo-700",
    "from-emerald-500 via-emerald-600 to-teal-700",
    "from-purple-500 via-purple-600 to-violet-700",
    "from-amber-500 via-amber-600 to-orange-700",
    "from-rose-500 via-rose-600 to-pink-700",
    "from-cyan-500 via-cyan-600 to-blue-700",
  ];

  return (
    <StudentLayout title="دروسي المشترك بها">
      <div className="p-4 lg:p-6 max-w-4xl mx-auto" dir="rtl">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-muted flex items-center justify-center">
              <FolderOpen className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">لا توجد اشتراكات حتى الآن</h3>
            <p className="text-muted-foreground text-sm">اشترك في مجموعة دراسية من صفحة المواد</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm mb-4">لديك {groups.length} مجموعة مشترك بها</p>
            {groups.map((group, i) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card
                  className="cursor-pointer border-0 overflow-hidden group hover:shadow-xl transition-all duration-300"
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (group.subject_stage) params.set("stage", group.subject_stage);
                    if (group.subject_grade) params.set("grade", group.subject_grade);
                    if (group.subject_section) params.set("section", group.subject_section);
                    if (group.subject_category) params.set("category", group.subject_category);
                    if (group.subject_name) params.set("subject_name", group.subject_name);
                    navigate(`/student-subject?${params.toString()}`);
                  }}

                >
                  <CardContent className="p-0 flex items-stretch">
                    {/* Side gradient strip */}
                    <div className={`w-2 bg-gradient-to-b ${gradientColors[i % gradientColors.length]} flex-shrink-0`} />
                    <div className="flex-1 p-4 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-foreground text-base truncate">{group.group_title}</h3>
                          <div className="flex items-center gap-2 mt-1.5">
                            <BookOpen className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                            <span className="text-sm text-muted-foreground truncate">{group.subject_name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            {group.teacher_avatar ? (
                              <img
                                src={group.teacher_avatar}
                                alt={group.teacher_name}
                                className="h-5 w-5 rounded-full object-cover border border-primary/20 flex-shrink-0"
                                loading="lazy"
                              />
                            ) : (
                              <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <UserIcon className="h-3 w-3 text-primary" />
                              </div>
                            )}
                            <span className="text-xs text-muted-foreground truncate">المعلم: {group.teacher_name}</span>
                          </div>

                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {group.month_label && (
                            <Badge variant="secondary" className="text-[10px] px-2">{group.month_label}</Badge>
                          )}
                          <ChevronLeft className="h-4 w-4 text-muted-foreground mt-1" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
