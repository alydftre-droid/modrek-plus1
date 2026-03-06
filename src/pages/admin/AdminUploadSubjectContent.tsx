import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import ContentUpsertDialog, { ContentItem, ContentType, extractStoragePathFromPublicUrl } from "@/components/content/ContentUpsertDialog";
import AdminAiChat from "@/components/admin/AdminAiChat";
import TeacherGroupManager from "@/components/teacher/TeacherGroupManager";
import {
  BookOpen, ChevronLeft, Settings, LogOut, User, Upload, FileText, Video, Download,
  Play, Loader2, FileQuestion, Plus, Trash2, Edit, Eye, Bot, GraduationCap, Package,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type SubjectRow = { id: string; name: string; stage: string; grade: string; section: string | null; };
type ContentRow = { id: string; title: string; type: string; file_url: string; description: string | null; created_at: string | null; group_id: string | null; };
type TeacherOption = { id: string; name: string; photo_url: string | null; };
type GroupRow = { id: string; title: string; };

function stageLabel(s: string) { return s === "preparatory" ? "المرحلة الإعدادية" : s === "secondary" ? "المرحلة الثانوية" : ""; }
function gradeLabel(g: string) { return g === "first" ? "الصف الأول" : g === "second" ? "الصف الثاني" : g === "third" ? "الصف الثالث" : ""; }
function sectionLabel(s: string | null) { return s === "scientific" ? "علمي" : s === "literary" ? "أدبي" : ""; }

const AdminUploadSubjectContent = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signOut, user } = useAuth();
  const [searchParams] = useSearchParams();

  const subjectId = searchParams.get("subjectId") || "";
  const stageParam = searchParams.get("stage") || "";
  const gradeParam = searchParams.get("grade") || "";
  const sectionParam = searchParams.get("section") || "";
  const categoryParam = searchParams.get("category") || "";

  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [content, setContent] = useState<ContentRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Teacher selection for admin
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [loadingTeachers, setLoadingTeachers] = useState(true);

  // Section targeting
  const [sectionTarget, setSectionTarget] = useState<string | null>(sectionParam || null);
  const [allSubjects, setAllSubjects] = useState<SubjectRow[]>([]);

  // Dialogs
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadType, setUploadType] = useState<ContentType>("video");
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<ContentItem | null>(null);
  const [aiSourcesCount, setAiSourcesCount] = useState(0);

  const backTo = useMemo(() => {
    if (!stageParam || !gradeParam || !categoryParam) return "/admin/upload";
    return `/admin/upload/subjects?stage=${stageParam}&grade=${gradeParam}${sectionParam ? `&section=${sectionParam}` : ""}&category=${categoryParam}`;
  }, [searchParams]);

  const videos = useMemo(() => content.filter(c => c.type === "video"), [content]);
  const books = useMemo(() => content.filter(c => c.type === "pdf"), [content]);
  const summaries = useMemo(() => content.filter(c => c.type === "summary"), [content]);
  const exams = useMemo(() => content.filter(c => c.type === "exam"), [content]);

  // Fetch teachers for this subject's category
  useEffect(() => {
    const fetchTeachers = async () => {
      if (!categoryParam || !stageParam || !gradeParam) return;
      setLoadingTeachers(true);
      try {
        const { data: assignments } = await supabase
          .from("teacher_assignments")
          .select("teacher_id")
          .eq("category", categoryParam)
          .eq("stage", stageParam)
          .eq("grade", gradeParam);
        if (!assignments?.length) { setTeachers([]); setLoadingTeachers(false); return; }
        const teacherIds = [...new Set(assignments.map(a => a.teacher_id))];
        const [{ data: profiles }, { data: tProfiles }] = await Promise.all([
          supabase.from("profiles").select("id, full_name").in("id", teacherIds),
          supabase.from("teacher_profiles").select("teacher_id, photo_url").in("teacher_id", teacherIds),
        ]);
        const photoMap = new Map((tProfiles || []).map(t => [t.teacher_id, t.photo_url]));
        setTeachers((profiles || []).map(p => ({
          id: p.id,
          name: p.full_name,
          photo_url: photoMap.get(p.id) || null,
        })));
      } catch (e) { console.error(e); }
      finally { setLoadingTeachers(false); }
    };
    fetchTeachers();
  }, [categoryParam, stageParam, gradeParam]);

  // Fetch subject variants for section targeting
  useEffect(() => {
    if (!subjectId) return;
    const fetch = async () => {
      const { data: main } = await supabase
        .from("subjects").select("id, name, stage, grade, section").eq("id", subjectId).maybeSingle();
      if (!main) return;
      const { data: variants } = await supabase
        .from("subjects").select("id, name, stage, grade, section")
        .eq("name", main.name).eq("stage", main.stage).eq("grade", main.grade).eq("is_active", true);
      setAllSubjects((variants as SubjectRow[]) || [main as SubjectRow]);
      const sections = (variants || []).map(s => s.section).filter(Boolean);
      if (sections.length > 1 && !sectionTarget) setSectionTarget("both");
    };
    fetch();
  }, [subjectId]);

  // Fetch content
  const fetchAll = async () => {
    if (!subjectId || !selectedTeacherId) return;
    setIsLoading(true);
    try {
      const subjectIds = sectionTarget === "both" ? allSubjects.map(s => s.id) : [subjectId];
      const [{ data: subjectData }, { data: contentData }, { data: groupsData }] = await Promise.all([
        supabase.from("subjects").select("id, name, stage, grade, section").eq("id", subjectId).maybeSingle(),
        supabase.from("content").select("id, title, type, file_url, description, created_at, group_id")
          .in("subject_id", subjectIds).eq("is_active", true).eq("uploaded_by", selectedTeacherId)
          .order("created_at", { ascending: false }),
        supabase.from("content_groups").select("id, title")
          .in("subject_id", subjectIds)
          .or(`teacher_id.eq.${selectedTeacherId},created_by.eq.${selectedTeacherId}`)
          .eq("is_active", true),
      ]);
      setSubject((subjectData as SubjectRow) || null);
      setContent((contentData as ContentRow[]) || []);
      setGroups((groupsData as GroupRow[]) || []);
    } catch (e) {
      console.error(e);
      toast({ title: "خطأ", description: "فشل تحميل المحتوى", variant: "destructive" });
    } finally { setIsLoading(false); }
  };

  useEffect(() => {
    if (selectedTeacherId && subjectId) fetchAll();
  }, [selectedTeacherId, subjectId, sectionTarget]);

  useEffect(() => {
    if (!subjectId) return;
    supabase.from("ai_sources").select("id", { count: "exact", head: true }).eq("subject_id", subjectId)
      .then(({ count }) => setAiSourcesCount(count || 0));
  }, [subjectId]);

  const handleSignOut = async () => { await signOut(); navigate("/"); };
  const openUpload = (type: ContentType) => { setUploadType(type); setUploadOpen(true); };
  const openEdit = (item: ContentRow) => {
    setEditItem({ id: item.id, title: item.title, type: item.type, file_url: item.file_url, description: item.description });
    setEditOpen(true);
  };
  const handleDelete = async (item: ContentRow) => {
    if (!confirm("هل أنت متأكد؟")) return;
    try {
      const parsed = extractStoragePathFromPublicUrl(item.file_url);
      if (parsed) await supabase.storage.from(parsed.bucket).remove([parsed.path]);
      await supabase.from("content").update({ is_active: false }).eq("id", item.id);
      toast({ title: "تم", description: "تم حذف المحتوى" });
      fetchAll();
    } catch (e) { console.error(e); toast({ title: "خطأ", description: "فشل الحذف", variant: "destructive" }); }
  };

  const hasSections = allSubjects.length > 1 && allSubjects.some(s => s.section);
  const subtitle = subject ? `${stageLabel(subject.stage)} - ${gradeLabel(subject.grade)}${subject.section ? ` - ${sectionLabel(subject.section)}` : ""}` : "";

  // If no teacher selected yet, show teacher picker
  if (!selectedTeacherId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
        <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="container flex h-16 items-center justify-between px-4">
            <Link to="/admin" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-azhari shadow-lg shadow-primary/20">
                <BookOpen className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-gradient-azhari">أزهاريون - رفع المحتوى</span>
            </Link>
          </div>
        </header>
        <main className="container px-4 py-8">
          <Button variant="ghost" className="mb-6" onClick={() => navigate(backTo)}>
            <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
            رجوع للمواد
          </Button>
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold mb-2">اختر المعلم لرفع المحتوى</h1>
            <p className="text-muted-foreground">اختر المعلم الذي سيتم رفع المحتوى على حسابه</p>
          </div>
          {loadingTeachers ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : teachers.length === 0 ? (
            <Card className="max-w-md mx-auto border-2 border-dashed">
              <CardContent className="p-8 text-center">
                <GraduationCap className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-bold mb-2">لا يوجد معلمين</h3>
                <p className="text-muted-foreground">لم يتم تعيين معلمين لهذه المادة</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {teachers.map(t => (
                <Card
                  key={t.id}
                  className="cursor-pointer hover:shadow-xl hover:border-primary/30 transition-all duration-300"
                  onClick={() => setSelectedTeacherId(t.id)}
                >
                  <CardContent className="p-6 text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary/20 to-accent flex items-center justify-center overflow-hidden">
                      {t.photo_url ? (
                        <img src={t.photo_url} alt={t.name} className="w-full h-full object-cover" />
                      ) : (
                        <GraduationCap className="h-10 w-10 text-primary/50" />
                      )}
                    </div>
                    <h3 className="font-bold text-lg">{t.name}</h3>
                    <Button className="mt-3 w-full">اختيار</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (!subject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full"><CardContent className="p-6 text-center">
          <h2 className="text-lg font-semibold">المادة غير موجودة</h2>
          <Button className="mt-4" onClick={() => navigate(backTo)}>رجوع</Button>
        </CardContent></Card>
      </div>
    );
  }

  const renderContentList = (items: ContentRow[], type: string, emptyText: string, uploadFn: () => void, uploadLabel: string) => (
    <div className="space-y-4">
      <Button onClick={uploadFn} className="gap-2"><Plus className="h-5 w-5" />{uploadLabel}</Button>
      {items.length === 0 ? (
        <Card className="p-8 text-center"><p className="text-muted-foreground">{emptyText}</p></Card>
      ) : (
        <div className="grid gap-4">
          {items.map(item => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`p-3 rounded-lg ${type === "video" ? "bg-primary text-primary-foreground" : "bg-accent"}`}>
                    {type === "video" ? <Play className="h-6 w-6" /> : <FileText className="h-6 w-6 text-primary" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{item.title}</h3>
                    <div className="flex items-center gap-2">
                      {item.description && <p className="text-sm text-muted-foreground truncate">{item.description}</p>}
                      {item.group_id && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          <Package className="h-3 w-3 ml-1" />
                          {groups.find(g => g.id === item.group_id)?.title || "مجموعة"}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" asChild><a href={item.file_url} target="_blank" rel="noopener noreferrer">
                    {type === "video" ? <Eye className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                  </a></Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(item)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to="/admin" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-azhari shadow-lg shadow-primary/20">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient-azhari">أزهاريون - رفع المحتوى</span>
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <GraduationCap className="h-3 w-3" />
              {teachers.find(t => t.id === selectedTeacherId)?.name || "معلم"}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => setSelectedTeacherId(null)}>تغيير المعلم</Button>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        <Button variant="ghost" className="mb-6" onClick={() => navigate(backTo)}>
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />رجوع للمواد
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">{subject.name}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>

        {/* Section Targeting */}
        {hasSections && (
          <div className="mb-6 p-4 rounded-lg border bg-accent/30">
            <p className="font-bold mb-2">استهداف القسم:</p>
            <div className="flex flex-wrap gap-2">
              <Button variant={sectionTarget === "scientific" ? "default" : "outline"} size="sm" onClick={() => setSectionTarget("scientific")}>العلمي</Button>
              <Button variant={sectionTarget === "literary" ? "default" : "outline"} size="sm" onClick={() => setSectionTarget("literary")}>الأدبي</Button>
              <Button variant={sectionTarget === "both" ? "default" : "outline"} size="sm" onClick={() => setSectionTarget("both")}>القسمين معًا</Button>
            </div>
          </div>
        )}

        {/* Groups Manager */}
        <div className="mb-8">
          <TeacherGroupManager
            subjectId={subjectId}
            sectionName={sectionTarget || "both"}
            teacherIdOverride={selectedTeacherId}
          />
        </div>

        <Tabs defaultValue="books" className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-8">
            <TabsTrigger value="books" className="gap-2"><FileText className="h-4 w-4" /><span className="hidden sm:inline">كتب</span><span className="text-xs bg-muted px-1.5 rounded">{books.length}</span></TabsTrigger>
            <TabsTrigger value="lessons" className="gap-2"><Video className="h-4 w-4" /><span className="hidden sm:inline">دروس</span><span className="text-xs bg-muted px-1.5 rounded">{videos.length}</span></TabsTrigger>
            <TabsTrigger value="summaries" className="gap-2"><FileQuestion className="h-4 w-4" /><span className="hidden sm:inline">ملخصات</span><span className="text-xs bg-muted px-1.5 rounded">{summaries.length}</span></TabsTrigger>
            <TabsTrigger value="exams" className="gap-2"><FileQuestion className="h-4 w-4" /><span className="hidden sm:inline">امتحانات</span><span className="text-xs bg-muted px-1.5 rounded">{exams.length}</span></TabsTrigger>
            <TabsTrigger value="ai" className="gap-2"><Bot className="h-4 w-4" /><span className="hidden sm:inline">الذكاء</span><span className="text-xs bg-muted px-1.5 rounded">{aiSourcesCount}</span></TabsTrigger>
          </TabsList>

          <TabsContent value="books">{renderContentList(books, "pdf", "لا توجد كتب", () => openUpload("pdf"), "رفع كتاب PDF")}</TabsContent>
          <TabsContent value="lessons">{renderContentList(videos, "video", "لا توجد فيديوهات", () => openUpload("video"), "رفع فيديو")}</TabsContent>
          <TabsContent value="summaries">{renderContentList(summaries, "pdf", "لا توجد ملخصات", () => openUpload("summary"), "رفع ملخص")}</TabsContent>
          <TabsContent value="exams">{renderContentList(exams, "pdf", "لا توجد امتحانات", () => openUpload("exam"), "رفع امتحان")}</TabsContent>
          <TabsContent value="ai">
            <AdminAiChat subjectId={subjectId} subjectName={subject?.name || ""} stage={stageParam} grade={gradeParam} section={sectionParam || null} />
          </TabsContent>
        </Tabs>
      </main>

      <ContentUpsertDialog
        mode="create"
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        subjectId={subjectId}
        type={uploadType}
        onSuccess={fetchAll}
        uploadedBy={selectedTeacherId || undefined}
        groups={groups}
      />
      {editItem && (
        <ContentUpsertDialog
          mode="edit"
          open={editOpen}
          onOpenChange={setEditOpen}
          subjectId={subjectId}
          type={editItem.type as ContentType}
          item={editItem}
          onSuccess={fetchAll}
          uploadedBy={selectedTeacherId || undefined}
          groups={groups}
        />
      )}
    </div>
  );
};

export default AdminUploadSubjectContent;
