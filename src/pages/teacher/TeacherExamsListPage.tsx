import { useTeacherExams } from "@/hooks/useExams";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { Plus, Settings, Users, BarChart3, Trash2, Eye, EyeOff, Sparkles, ClipboardList } from "lucide-react";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function TeacherExamsListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: exams = [], isLoading } = useTeacherExams();
  const [tab, setTab] = useState("published");

  const filtered = exams.filter((e: any) => {
    if (tab === "draft") return e.status === "draft" || !e.is_published;
    if (tab === "published") return e.is_published && e.status === "published";
    if (tab === "archived") return e.status === "archived";
    return true;
  });

  const togglePublish = async (e: any) => {
    const next = !e.is_published;
    const { error } = await supabase.from("exams").update({
      is_published: next, status: next ? "published" : "draft"
    }).eq("id", e.id);
    if (error) toast.error(error.message);
    else { toast.success(next ? "تم النشر" : "تم إلغاء النشر"); qc.invalidateQueries({ queryKey: ["teacher-exams"] }); }
  };

  const removeExam = async (id: string) => {
    const { error } = await supabase.from("exams").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["teacher-exams"] }); }
  };

  return (
    <TeacherSidebarLayout title="الامتحانات">
      <div className="container mx-auto p-4 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold">امتحاناتي</h1>
            <p className="text-sm text-muted-foreground">{exams.length} امتحان إجمالاً</p>
          </div>
          <Button onClick={() => navigate("/teacher/exams/new")} className="gap-2">
            <Plus className="h-4 w-4" />امتحان جديد
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="published">منشور</TabsTrigger>
            <TabsTrigger value="draft">مسودة</TabsTrigger>
            <TabsTrigger value="archived">مؤرشف</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="space-y-3 mt-4">
            {isLoading ? (
              [...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)
            ) : filtered.length === 0 ? (
              <Card className="text-center p-12 border-dashed">
                <ClipboardList className="h-16 w-16 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-4">لا توجد امتحانات في هذا القسم</p>
                <Button onClick={() => navigate("/teacher/exams/new")}><Plus className="h-4 w-4 ml-1" />أنشئ امتحان</Button>
              </Card>
            ) : (
              filtered.map((exam: any) => (
                <Card key={exam.id} className="hover:shadow-mudrik transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold truncate">{exam.title}</h3>
                          {exam.is_ai_generated && <Badge variant="outline" className="text-[10px] gap-1"><Sparkles className="h-3 w-3" />AI</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{exam.subjects?.name} • {exam.duration_minutes} د • {exam.total_attempts_count || 0} محاولة</div>
                      </div>
                      <Badge variant={exam.is_published ? "default" : "secondary"}>{exam.is_published ? "منشور" : "مسودة"}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/exams/${exam.id}/edit`)}>
                        <Settings className="h-3 w-3 ml-1" />تعديل
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/exams/${exam.id}/attempts`)}>
                        <Users className="h-3 w-3 ml-1" />المحاولات
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/exams/${exam.id}/analytics`)}>
                        <BarChart3 className="h-3 w-3 ml-1" />تحليلات
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => togglePublish(exam)}>
                        {exam.is_published ? <><EyeOff className="h-3 w-3 ml-1" />إخفاء</> : <><Eye className="h-3 w-3 ml-1" />نشر</>}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive"><Trash2 className="h-3 w-3" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>حذف الامتحان؟</AlertDialogTitle>
                            <AlertDialogDescription>سيتم حذف كل المحاولات والإجابات المرتبطة. لا يمكن التراجع.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>إلغاء</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeExam(exam.id)}>احذف</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </TeacherSidebarLayout>
  );
}
