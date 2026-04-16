import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ExamRow, ExamQuestion } from "./types";
import ExamEditorDialog from "./ExamEditorDialog";
import ExamStatsPanel from "./ExamStatsPanel";
import {
  Plus, Loader2, Edit, Trash2, Eye, EyeOff, Clock,
  FileText, BarChart3, Sparkles, BookOpen, CircleDot, ToggleLeft, FileEdit,
} from "lucide-react";

type Props = {
  groupId?: string;
  currentTerm?: string;
  subjectId: string;
  subjectName: string;
};

const TeacherExamPanel = ({ subjectId, subjectName, groupId, currentTerm }: Props) => {
  const { toast } = useToast();

  const [exams, setExams] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<ExamRow | null>(null);
  const [initialQuestions, setInitialQuestions] = useState<ExamQuestion[]>([]);
  const [isAiGenerated, setIsAiGenerated] = useState(false);

  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("exams" as any).select("*")
        .eq("subject_id", subjectId)
        .eq("group_id", groupId || "")
        .eq("term", currentTerm || "term1")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setExams((data as any as ExamRow[]) || []);
    } catch (e) {
      console.error("Error fetching exams:", e);
    } finally {
      setLoading(false);
    }
  }, [currentTerm, groupId, subjectId]);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  const handleCreateManual = () => {
    setEditingExam(null);
    setInitialQuestions([]);
    setIsAiGenerated(false);
    setEditorOpen(true);
  };

  const handleEdit = (exam: ExamRow) => {
    setEditingExam(exam);
    setInitialQuestions(exam.questions || []);
    setIsAiGenerated(exam.is_ai_generated);
    setEditorOpen(true);
  };

  const handleDelete = async (examId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الامتحان؟")) return;
    try {
      const { error } = await supabase.from("exams" as any).delete().eq("id", examId);
      if (error) throw error;
      toast({ title: "تم", description: "تم حذف الامتحان" });
      fetchExams();
    } catch (e) {
      toast({ title: "خطأ", description: "فشل حذف الامتحان", variant: "destructive" });
    }
  };

  const handleTogglePublish = async (exam: ExamRow) => {
    try {
      const { error } = await supabase
        .from("exams" as any)
        .update({ is_published: !exam.is_published } as any)
        .eq("id", exam.id);
      if (error) throw error;
      toast({ title: "تم", description: exam.is_published ? "تم إلغاء النشر" : "تم النشر للطلاب" });
      fetchExams();
    } catch (e) {
      toast({ title: "خطأ", description: "فشل تحديث حالة النشر", variant: "destructive" });
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("ar-EG", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const getQuestionCounts = (exam: ExamRow) => {
    const qs = exam.questions || [];
    return {
      mcq: qs.filter(q => q.type === "mcq").length,
      tf: qs.filter(q => q.type === "true_false").length,
      essay: qs.filter(q => q.type === "essay").length,
    };
  };

  return (
    <Tabs defaultValue="manage" className="space-y-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="manage" className="gap-2">
          <FileText className="h-4 w-4" />
          إدارة الامتحانات
        </TabsTrigger>
        <TabsTrigger value="stats" className="gap-2">
          <BarChart3 className="h-4 w-4" />
          إحصائيات الطلاب
        </TabsTrigger>
      </TabsList>

      <TabsContent value="manage">
        <div className="space-y-6">
          {/* Header Card */}
          <Card className="overflow-hidden">
            <div className="h-1 bg-gradient-to-l from-primary via-primary/60 to-secondary" />
            <CardContent className="p-6">
              <div className="flex items-center gap-4 mb-5">
                <div className="p-3 rounded-2xl bg-primary/10">
                  <BookOpen className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-foreground">إدارة الامتحانات</h2>
                  <p className="text-sm text-muted-foreground">أنشئ وأدر امتحانات {subjectName}</p>
                </div>
              </div>

              <Button onClick={handleCreateManual} className="gap-2 shadow-md" size="lg"
                style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(158 64% 35%))" }}>
                <Plus className="h-5 w-5" />
                إنشاء امتحان جديد
              </Button>
            </CardContent>
          </Card>

          {/* Exams List */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : exams.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-muted flex items-center justify-center mb-4">
                <FileText className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-bold mb-2">لا توجد امتحانات بعد</h3>
              <p className="text-muted-foreground">أنشئ أول امتحان لهذه المادة</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {exams.map((exam) => {
                const counts = getQuestionCounts(exam);
                return (
                  <Card key={exam.id} className="overflow-hidden hover:shadow-lg transition-all group">
                    <div className={`h-1 ${exam.is_published ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="font-bold text-foreground">{exam.title}</h3>
                            <Badge variant={exam.is_published ? "default" : "secondary"} className="text-xs">
                              {exam.is_published ? "✓ منشور" : "مسودة"}
                            </Badge>
                            {exam.is_ai_generated && (
                              <Badge variant="outline" className="gap-1 text-xs">
                                <Sparkles className="h-3 w-3" /> AI
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {exam.duration_minutes} دقيقة
                            </span>
                            {counts.mcq > 0 && (
                              <span className="flex items-center gap-1">
                                <CircleDot className="h-3 w-3 text-blue-500" /> {counts.mcq} اختياري
                              </span>
                            )}
                            {counts.tf > 0 && (
                              <span className="flex items-center gap-1">
                                <ToggleLeft className="h-3 w-3 text-amber-500" /> {counts.tf} صح/خطأ
                              </span>
                            )}
                            {counts.essay > 0 && (
                              <span className="flex items-center gap-1">
                                <FileEdit className="h-3 w-3 text-purple-500" /> {counts.essay} مقالي
                              </span>
                            )}
                          </div>

                          {(exam.start_at || exam.end_at) && (
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                              {exam.start_at && <span>من: {formatDate(exam.start_at)}</span>}
                              {exam.end_at && <span>إلى: {formatDate(exam.end_at)}</span>}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" onClick={() => handleTogglePublish(exam)}
                            title={exam.is_published ? "إلغاء النشر" : "نشر"} className="h-8 w-8">
                            {exam.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(exam)} className="h-8 w-8">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive h-8 w-8"
                            onClick={() => handleDelete(exam.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <ExamEditorDialog
            open={editorOpen}
            onOpenChange={setEditorOpen}
            subjectId={subjectId}
            subjectName={subjectName}
            editingExam={editingExam}
            initialQuestions={initialQuestions}
            isAiGenerated={isAiGenerated}
            groupId={groupId}
            currentTerm={currentTerm}
            onSuccess={fetchExams}
          />
        </div>
      </TabsContent>

      <TabsContent value="stats">
        <ExamStatsPanel subjectId={subjectId} />
      </TabsContent>
    </Tabs>
  );
};

export default TeacherExamPanel;
