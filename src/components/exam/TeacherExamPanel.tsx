import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ExamRow, ExamQuestion } from "./types";
import ExamEditorDialog from "./ExamEditorDialog";
import ExamStatsPanel from "./ExamStatsPanel";
import {
  Plus,
  Bot,
  Loader2,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Clock,
  FileText,
  BarChart3,
} from "lucide-react";

type Props = {
  subjectId: string;
  subjectName: string;
};

const TeacherExamPanel = ({ subjectId, subjectName }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [exams, setExams] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor dialog state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<ExamRow | null>(null);
  const [initialQuestions, setInitialQuestions] = useState<ExamQuestion[]>([]);
  const [isAiGenerated, setIsAiGenerated] = useState(false);

  // AI generation
  const [showAiForm, setShowAiForm] = useState(false);
  const [aiCount, setAiCount] = useState("10");
  const [aiDifficulty, setAiDifficulty] = useState("متوسط");
  const [generating, setGenerating] = useState(false);

  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("exams" as any)
        .select("*")
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setExams((data as any as ExamRow[]) || []);
    } catch (e) {
      console.error("Error fetching exams:", e);
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  const handleCreateManual = () => {
    setEditingExam(null);
    setInitialQuestions([]);
    setIsAiGenerated(false);
    setEditorOpen(true);
  };

  const handleGenerateAi = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const response = await supabase.functions.invoke("generate-exam", {
        body: {
          subjectName,
          lessonTitle: subjectName,
          questionCount: parseInt(aiCount),
          difficulty: aiDifficulty,
        },
      });

      if (response.error) throw new Error(response.error.message || "فشل توليد الأسئلة");

      let data = response.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          throw new Error("تنسيق الاستجابة غير صحيح");
        }
      }

      if (!data?.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error("لم يتم استلام أسئلة صالحة");
      }

      setEditingExam(null);
      setInitialQuestions(data.questions);
      setIsAiGenerated(true);
      setShowAiForm(false);
      setEditorOpen(true);

      toast({ title: "تم", description: `تم توليد ${data.questions.length} سؤال. راجعها قبل النشر.` });
    } catch (e: any) {
      console.error("AI generation error:", e);
      toast({ title: "خطأ", description: e.message || "فشل توليد الأسئلة", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
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
      console.error(e);
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
      toast({
        title: "تم",
        description: exam.is_published ? "تم إلغاء نشر الامتحان" : "تم نشر الامتحان للطلاب",
      });
      fetchExams();
    } catch (e) {
      console.error(e);
      toast({ title: "خطأ", description: "فشل تحديث حالة النشر", variant: "destructive" });
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
      {/* Action Buttons */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">إدارة الامتحانات</h2>
              <p className="text-sm text-muted-foreground">أنشئ امتحانات يدوية أو استخدم الذكاء الاصطناعي</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleCreateManual} className="gap-2">
              <Plus className="h-4 w-4" />
              إنشاء امتحان يدوي
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setShowAiForm(!showAiForm)}
            >
              <Bot className="h-4 w-4" />
              توليد امتحان بالذكاء الاصطناعي
            </Button>
          </div>

          {/* AI Generation Form */}
          {showAiForm && (
            <div className="mt-4 p-4 rounded-lg border bg-muted/30 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>عدد الأسئلة</Label>
                  <Select value={aiCount} onValueChange={setAiCount}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 أسئلة</SelectItem>
                      <SelectItem value="10">10 أسئلة</SelectItem>
                      <SelectItem value="15">15 سؤال</SelectItem>
                      <SelectItem value="20">20 سؤال</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>مستوى الصعوبة</Label>
                  <Select value={aiDifficulty} onValueChange={setAiDifficulty}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="سهل">سهل</SelectItem>
                      <SelectItem value="متوسط">متوسط</SelectItem>
                      <SelectItem value="صعب">صعب</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleGenerateAi} disabled={generating} className="w-full gap-2">
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جاري التوليد...
                  </>
                ) : (
                  <>
                    <Bot className="h-4 w-4" />
                    توليد الأسئلة
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exams List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : exams.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">لا توجد امتحانات</h3>
          <p className="text-muted-foreground">أنشئ أول امتحان لهذه المادة</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => (
            <Card key={exam.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-foreground">{exam.title}</h3>
                      <Badge variant={exam.is_published ? "default" : "secondary"}>
                        {exam.is_published ? "منشور" : "مسودة"}
                      </Badge>
                      {exam.is_ai_generated && (
                        <Badge variant="outline" className="gap-1">
                          <Bot className="h-3 w-3" />
                          AI
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      <span>{exam.questions?.length || 0} سؤال</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {exam.duration_minutes} دقيقة
                      </span>
                      {exam.start_at && <span>من: {formatDate(exam.start_at)}</span>}
                      {exam.end_at && <span>إلى: {formatDate(exam.end_at)}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleTogglePublish(exam)}
                      title={exam.is_published ? "إلغاء النشر" : "نشر"}
                    >
                      {exam.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(exam)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(exam.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Editor Dialog */}
      <ExamEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        subjectId={subjectId}
        editingExam={editingExam}
        initialQuestions={initialQuestions}
        isAiGenerated={isAiGenerated}
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
