import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { toast } from "sonner";
import { ArrowRight, Plus, Trash2, GripVertical, Save, CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import type { ExamQuestion, ExamQuestionType } from "@/types/exam";

type DraftQuestion = {
  id?: string;
  tempId: string;
  question_type: ExamQuestionType;
  question_text: string;
  marks: number;
  explanation: string | null;
  correct_answer: string | null;
  image_url: string | null;
  options: Array<{ id?: string; tempId: string; option_text: string; is_correct: boolean }>;
};

const newOpt = (text = "", correct = false) => ({ tempId: crypto.randomUUID(), option_text: text, is_correct: correct });

const newQ = (type: ExamQuestionType = "mcq"): DraftQuestion => ({
  tempId: crypto.randomUUID(),
  question_type: type,
  question_text: "",
  marks: 1,
  explanation: null,
  correct_answer: null,
  image_url: null,
  options: type === "mcq" ? [newOpt(), newOpt(), newOpt(), newOpt()] : type === "true_false" ? [newOpt("صح", true), newOpt("خطأ", false)] : [],
});

export default function TeacherExamEditorPage() {
  const { examId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = !examId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [aiGen, setAiGen] = useState(false);
  const [tab, setTab] = useState("info");

  // Form state
  const [form, setForm] = useState({
    title: "",
    description: "",
    instructions: "",
    subject_id: params.get("subject_id") || "",
    group_id: params.get("group_id") || "",
    term: params.get("term") || "term1",
    duration_minutes: 30,
    pass_marks: 50,
    max_attempts: 1,
    difficulty: "medium" as "easy" | "medium" | "hard",
    start_at: "",
    end_at: "",
    shuffle_questions: false,
    shuffle_options: false,
    show_results_immediately: true,
    show_correct_answers: true,
    prevent_tab_switch: true,
    require_fullscreen: false,
    prevent_copy_paste: true,
    is_published: false,
    status: "draft" as "draft" | "published",
  });
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);

  // AI gen state
  const [aiTopic, setAiTopic] = useState("");
  const [aiCount, setAiCount] = useState(10);

  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user?.id;
      if (!uid) return;
      // subjects (any) and teacher's groups
      const [{ data: subs }, { data: grps }] = await Promise.all([
        supabase.from("subjects").select("id, name, category"),
        supabase.from("content_groups").select("id, title, subject_id").or(`teacher_id.eq.${uid},created_by.eq.${uid}`),
      ]);
      setSubjects(subs || []);
      setGroups(grps || []);

      if (!isNew) {
        const { data: exam } = await supabase.from("exams").select("*").eq("id", examId!).maybeSingle();
        if (exam) {
          setForm({
            title: exam.title || "",
            description: exam.description || "",
            instructions: exam.instructions || "",
            subject_id: exam.subject_id || "",
            group_id: exam.group_id || "",
            term: exam.term || "term1",
            duration_minutes: exam.duration_minutes,
            pass_marks: Number(exam.pass_marks),
            max_attempts: exam.max_attempts,
            difficulty: exam.difficulty,
            start_at: exam.start_at ? new Date(exam.start_at).toISOString().slice(0, 16) : "",
            end_at: exam.end_at ? new Date(exam.end_at).toISOString().slice(0, 16) : "",
            shuffle_questions: exam.shuffle_questions,
            shuffle_options: exam.shuffle_options,
            show_results_immediately: exam.show_results_immediately,
            show_correct_answers: exam.show_correct_answers,
            prevent_tab_switch: exam.prevent_tab_switch,
            require_fullscreen: exam.require_fullscreen,
            prevent_copy_paste: exam.prevent_copy_paste,
            is_published: exam.is_published,
            status: exam.status,
          });
        }
        const { data: qs } = await supabase.from("exam_questions").select("*, options:exam_question_options(*)").eq("exam_id", examId!).order("order_index");
        setQuestions((qs || []).map((q: any) => ({
          id: q.id, tempId: q.id,
          question_type: q.question_type, question_text: q.question_text,
          marks: Number(q.marks), explanation: q.explanation, correct_answer: q.correct_answer, image_url: q.image_url,
          options: (q.options || []).map((o: any) => ({ id: o.id, tempId: o.id, option_text: o.option_text, is_correct: o.is_correct })),
        })));
      }
      setLoading(false);
    })();
  }, [examId, isNew]);

  const addQ = (type: ExamQuestionType = "mcq") => setQuestions(qs => [...qs, newQ(type)]);
  const removeQ = (tempId: string) => setQuestions(qs => qs.filter(q => q.tempId !== tempId));
  const updateQ = (tempId: string, patch: Partial<DraftQuestion>) => setQuestions(qs => qs.map(q => q.tempId === tempId ? { ...q, ...patch } : q));

  const generateAI = async () => {
    if (!aiTopic.trim()) { toast.error("اكتب موضوع الامتحان"); return; }
    setAiGen(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-exam", {
        body: { subjectName: subjects.find(s => s.id === form.subject_id)?.name || "عام", lessonTitle: aiTopic, lessonText: aiTopic, questionCount: aiCount },
      });
      if (error) throw error;
      const raw = data?.questions || data || [];
      const gen = (Array.isArray(raw) ? raw : []).map((q: any): DraftQuestion => {
        const type: ExamQuestionType = q.type === "true_false" ? "true_false" : q.type === "essay" ? "essay" : "mcq";
        const opts = (q.options || []).map((t: string) => newOpt(t, t === q.correct_answer));
        return {
          tempId: crypto.randomUUID(),
          question_type: type,
          question_text: q.question,
          marks: q.points || 1,
          explanation: q.explanation || null,
          correct_answer: type === "essay" ? (q.model_answer || null) : null,
          image_url: null,
          options: opts,
        };
      });
      setQuestions(qs => [...qs, ...gen]);
      toast.success(`تم توليد ${gen.length} سؤال`);
      setTab("questions");
    } catch (e: any) {
      toast.error(e?.message || "فشل التوليد");
    } finally { setAiGen(false); }
  };

  const save = async (publish?: boolean) => {
    if (!form.title.trim()) { toast.error("ضع عنواناً للامتحان"); return; }
    if (!form.subject_id) { toast.error("اختر المادة"); return; }
    if (publish && questions.length === 0) { toast.error("أضف سؤالاً واحداً على الأقل"); return; }

    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user?.id;
      if (!uid) throw new Error("غير مسجل دخول");

      const totalMarks = questions.reduce((s, q) => s + Number(q.marks || 0), 0);
      const payload: any = {
        ...form,
        teacher_id: uid,
        total_marks: totalMarks,
        pass_marks: Math.min(form.pass_marks, totalMarks),
        is_published: publish ?? form.is_published,
        status: (publish ?? form.is_published) ? "published" : "draft",
        start_at: form.start_at || null,
        end_at: form.end_at || null,
        group_id: form.group_id || null,
      };

      let savedExamId = examId;
      if (isNew) {
        const { data, error } = await supabase.from("exams").insert(payload).select("id").single();
        if (error) throw error;
        savedExamId = data.id;
      } else {
        const { error } = await supabase.from("exams").update(payload).eq("id", examId!);
        if (error) throw error;
      }

      // Replace questions transactionally (delete then insert all)
      await supabase.from("exam_questions").delete().eq("exam_id", savedExamId!);
      if (questions.length > 0) {
        const { data: insertedQs, error: qErr } = await supabase.from("exam_questions").insert(
          questions.map((q, i) => ({
            exam_id: savedExamId!, order_index: i, question_type: q.question_type,
            question_text: q.question_text, marks: q.marks, explanation: q.explanation,
            correct_answer: q.correct_answer, image_url: q.image_url,
          }))
        ).select("id, order_index");
        if (qErr) throw qErr;

        const optsToInsert: any[] = [];
        (insertedQs || []).forEach((inserted: any) => {
          const draft = questions[inserted.order_index];
          (draft.options || []).forEach((o, i) => {
            optsToInsert.push({
              question_id: inserted.id, order_index: i,
              option_text: o.option_text, is_correct: o.is_correct,
            });
          });
        });
        if (optsToInsert.length > 0) {
          const { error: oErr } = await supabase.from("exam_question_options").insert(optsToInsert);
          if (oErr) throw oErr;
        }
      }

      qc.invalidateQueries({ queryKey: ["teacher-exams"] });
      toast.success(publish ? "تم النشر ✅" : "تم الحفظ");
      navigate("/teacher/exams");
    } catch (e: any) {
      toast.error(e?.message || "فشل الحفظ");
    } finally { setSaving(false); }
  };

  if (loading) return <TeacherSidebarLayout title="محرر الامتحان"><div className="p-4 max-w-3xl mx-auto"><Skeleton className="h-96" /></div></TeacherSidebarLayout>;

  return (
    <TeacherSidebarLayout title={isNew ? "امتحان جديد" : "تعديل امتحان"}>
      <div className="container mx-auto p-4 max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/teacher/exams")}><ArrowRight className="h-4 w-4 ml-1" />رجوع</Button>
          <div className="flex gap-2">
            <Button variant="outline" disabled={saving} onClick={() => save(false)}><Save className="h-4 w-4 ml-1" />حفظ كمسودة</Button>
            <Button disabled={saving} onClick={() => save(true)}><CheckCircle2 className="h-4 w-4 ml-1" />احفظ وانشر</Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="info">المعلومات</TabsTrigger>
            <TabsTrigger value="settings">الإعدادات</TabsTrigger>
            <TabsTrigger value="questions">الأسئلة ({questions.length})</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-3 mt-4">
            <Card><CardContent className="p-4 space-y-3">
              <div><Label>العنوان *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="مثال: امتحان شهر أكتوبر" /></div>
              <div><Label>الوصف</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
              <div><Label>تعليمات للطالب</Label><Textarea value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} rows={3} placeholder="اقرأ كل سؤال بدقة..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>المادة *</Label>
                  <Select value={form.subject_id} onValueChange={v => setForm({ ...form, subject_id: v })}>
                    <SelectTrigger><SelectValue placeholder="اختر مادة" /></SelectTrigger>
                    <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>المجموعة</Label>
                  <Select value={form.group_id || "none"} onValueChange={v => setForm({ ...form, group_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="بدون" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون مجموعة</SelectItem>
                      {groups.filter(g => g.subject_id === form.subject_id).map(g => <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>الترم</Label>
                  <Select value={form.term} onValueChange={v => setForm({ ...form, term: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="term1">الترم الأول</SelectItem>
                      <SelectItem value="term2">الترم الثاني</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>الصعوبة</Label>
                  <Select value={form.difficulty} onValueChange={v => setForm({ ...form, difficulty: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">سهل</SelectItem>
                      <SelectItem value="medium">متوسط</SelectItem>
                      <SelectItem value="hard">صعب</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-3 mt-4">
            <Card><CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div><Label>المدة (دقيقة)</Label><Input type="number" min={1} value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: +e.target.value })} /></div>
                <div><Label>درجة النجاح</Label><Input type="number" min={0} value={form.pass_marks} onChange={e => setForm({ ...form, pass_marks: +e.target.value })} /></div>
                <div><Label>عدد المحاولات</Label><Input type="number" min={1} value={form.max_attempts} onChange={e => setForm({ ...form, max_attempts: +e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>تاريخ البدء</Label><Input type="datetime-local" value={form.start_at} onChange={e => setForm({ ...form, start_at: e.target.value })} /></div>
                <div><Label>تاريخ الانتهاء</Label><Input type="datetime-local" value={form.end_at} onChange={e => setForm({ ...form, end_at: e.target.value })} /></div>
              </div>
              <div className="space-y-2 pt-2">
                <Toggle label="خلط ترتيب الأسئلة" v={form.shuffle_questions} on={v => setForm({ ...form, shuffle_questions: v })} />
                <Toggle label="خلط ترتيب الاختيارات" v={form.shuffle_options} on={v => setForm({ ...form, shuffle_options: v })} />
                <Toggle label="إظهار النتيجة فوراً بعد التسليم" v={form.show_results_immediately} on={v => setForm({ ...form, show_results_immediately: v })} />
                <Toggle label="السماح بمراجعة الإجابات الصحيحة" v={form.show_correct_answers} on={v => setForm({ ...form, show_correct_answers: v })} />
                <Toggle label="رصد تبديل التبويب (مكافحة الغش)" v={form.prevent_tab_switch} on={v => setForm({ ...form, prevent_tab_switch: v })} />
                <Toggle label="إجبار وضع ملء الشاشة" v={form.require_fullscreen} on={v => setForm({ ...form, require_fullscreen: v })} />
                <Toggle label="منع النسخ واللصق" v={form.prevent_copy_paste} on={v => setForm({ ...form, prevent_copy_paste: v })} />
              </div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="questions" className="space-y-3 mt-4">
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => addQ("mcq")}><Plus className="h-3 w-3 ml-1" />اختيار من متعدد</Button>
              <Button size="sm" variant="outline" onClick={() => addQ("true_false")}><Plus className="h-3 w-3 ml-1" />صح / خطأ</Button>
              <Button size="sm" variant="outline" onClick={() => addQ("short_answer")}><Plus className="h-3 w-3 ml-1" />إجابة قصيرة</Button>
              <Button size="sm" variant="outline" onClick={() => addQ("essay")}><Plus className="h-3 w-3 ml-1" />مقالي</Button>
              <Button size="sm" variant="outline" onClick={() => addQ("fill_blank")}><Plus className="h-3 w-3 ml-1" />فراغات</Button>
            </div>
            {questions.length === 0 ? (
              <Card className="text-center p-8 border-dashed text-muted-foreground">لا توجد أسئلة بعد — أضف الأول أو ولّد بالـ AI</Card>
            ) : questions.map((q, i) => (
              <Card key={q.tempId}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <Badge>{i + 1}</Badge>
                    <Badge variant="secondary">
                      {q.question_type === "mcq" ? "اختيار من متعدد" : q.question_type === "true_false" ? "صح / خطأ" : q.question_type === "short_answer" ? "إجابة قصيرة" : q.question_type === "essay" ? "مقالي" : "فراغات"}
                    </Badge>
                    <Input type="number" min={0} value={q.marks} onChange={e => updateQ(q.tempId, { marks: +e.target.value })} className="w-20 h-8" /><span className="text-xs">درجة</span>
                    <Button size="sm" variant="ghost" className="mr-auto text-destructive" onClick={() => removeQ(q.tempId)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <Textarea value={q.question_text} onChange={e => updateQ(q.tempId, { question_text: e.target.value })} placeholder="نص السؤال..." rows={2} />
                  {(q.question_type === "mcq" || q.question_type === "true_false") && (
                    <div className="space-y-2">
                      {q.options.map((o, oi) => (
                        <div key={o.tempId} className="flex items-center gap-2">
                          <Switch checked={o.is_correct} onCheckedChange={c => {
                            const newOpts = q.options.map((x, xi) => ({ ...x, is_correct: q.question_type === "mcq" ? (xi === oi ? c : false) : (xi === oi ? c : x.is_correct) }));
                            updateQ(q.tempId, { options: newOpts });
                          }} />
                          <Input value={o.option_text} onChange={e => updateQ(q.tempId, { options: q.options.map((x, xi) => xi === oi ? { ...x, option_text: e.target.value } : x) })} placeholder={`الخيار ${oi + 1}`} />
                          {q.question_type === "mcq" && q.options.length > 2 && (
                            <Button size="sm" variant="ghost" onClick={() => updateQ(q.tempId, { options: q.options.filter((_, xi) => xi !== oi) })}><Trash2 className="h-3 w-3" /></Button>
                          )}
                        </div>
                      ))}
                      {q.question_type === "mcq" && (
                        <Button size="sm" variant="outline" onClick={() => updateQ(q.tempId, { options: [...q.options, newOpt()] })}><Plus className="h-3 w-3 ml-1" />خيار جديد</Button>
                      )}
                    </div>
                  )}
                  {(q.question_type === "short_answer" || q.question_type === "fill_blank") && (
                    <div><Label className="text-xs">الإجابة الصحيحة</Label><Input value={q.correct_answer || ""} onChange={e => updateQ(q.tempId, { correct_answer: e.target.value })} /></div>
                  )}
                  {q.question_type === "essay" && (
                    <div><Label className="text-xs">إجابة نموذجية (للتصحيح)</Label><Textarea value={q.correct_answer || ""} onChange={e => updateQ(q.tempId, { correct_answer: e.target.value })} rows={3} /></div>
                  )}
                  <div><Label className="text-xs">شرح الإجابة (يظهر في المراجعة)</Label><Textarea value={q.explanation || ""} onChange={e => updateQ(q.tempId, { explanation: e.target.value })} rows={2} /></div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="ai" className="space-y-3 mt-4">
            <Card><CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-primary"><Sparkles className="h-5 w-5" /><h3 className="font-bold">توليد أسئلة بالذكاء الاصطناعي</h3></div>
              <div><Label>الموضوع / الدرس</Label><Textarea value={aiTopic} onChange={e => setAiTopic(e.target.value)} rows={4} placeholder="اكتب موضوع الامتحان أو الصق نص الدرس..." /></div>
              <div><Label>عدد الأسئلة</Label><Input type="number" min={1} max={30} value={aiCount} onChange={e => setAiCount(+e.target.value)} /></div>
              <Button onClick={generateAI} disabled={aiGen || !form.subject_id} className="w-full">
                {aiGen ? <><Loader2 className="h-4 w-4 ml-1 animate-spin" />جاري التوليد...</> : <><Sparkles className="h-4 w-4 ml-1" />ولّد الأسئلة</>}
              </Button>
              {!form.subject_id && <p className="text-xs text-muted-foreground">اختر المادة من تبويب المعلومات أولاً</p>}
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </TeacherSidebarLayout>
  );
}

function Toggle({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30">
      <Label className="text-sm cursor-pointer flex-1" onClick={() => on(!v)}>{label}</Label>
      <Switch checked={v} onCheckedChange={on} />
    </div>
  );
}
