import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import ContentUpsertDialog, {
  ContentItem,
  ContentType,
  extractStoragePathFromPublicUrl,
} from "@/components/content/ContentUpsertDialog";
import TeacherGroupManager from "@/components/teacher/TeacherGroupManager";
import {
  BookOpen,
  ChevronLeft,
  Upload,
  FileText,
  Video,
  Download,
  Play,
  Loader2,
  FileQuestion,
  Plus,
  Trash2,
  Edit,
  Eye,
  Package,
} from "lucide-react";


type SubjectRow = {
  id: string;
  name: string;
  stage: string;
  grade: string;
  section: string | null;
};

type ContentRow = {
  id: string;
  title: string;
  type: string;
  file_url: string;
  description: string | null;
  created_at: string | null;
  group_id: string | null;
};

type GroupRow = {
  id: string;
  title: string;
};

function stageLabel(stage: string) {
  if (stage === "preparatory") return "المرحلة الإعدادية";
  if (stage === "secondary") return "المرحلة الثانوية";
  return "";
}

function gradeLabelFn(grade: string) {
  if (grade === "first") return "الصف الأول";
  if (grade === "second") return "الصف الثاني";
  if (grade === "third") return "الصف الثالث";
  return "";
}

const TeacherUploadContent = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { subjectId } = useParams();
  const [searchParams] = useSearchParams();

  // Section targeting state
  const [sectionTarget, setSectionTarget] = useState<string | null>(null);
  const [allSubjects, setAllSubjects] = useState<SubjectRow[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(subjectId || null);

  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [content, setContent] = useState<ContentRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialogs
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadType, setUploadType] = useState<ContentType>("video");
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<ContentItem | null>(null);

  const subjectName = searchParams.get("subjectName") || "";

  const backTo = useMemo(() => {
    const stage = searchParams.get("stage") || "";
    const grade = searchParams.get("grade") || "";
    const category = searchParams.get("category") || "";
    if (!stage || !grade || !category) return "/teacher";
    return `/teacher/subject?category=${encodeURIComponent(category)}&grade=${encodeURIComponent(grade)}&stage=${stage}`;
  }, [searchParams]);

  const videos = useMemo(() => content.filter((c) => c.type === "video"), [content]);
  const books = useMemo(() => content.filter((c) => c.type === "pdf"), [content]);
  const summaries = useMemo(() => content.filter((c) => c.type === "summary"), [content]);
  const exams = useMemo(() => content.filter((c) => c.type === "exam"), [content]);

  // Fetch all subjects with same name to allow section targeting
  useEffect(() => {
    if (!subjectId) return;
    const fetchSubjectVariants = async () => {
      const { data: mainSubject } = await supabase
        .from("subjects")
        .select("id, name, stage, grade, section")
        .eq("id", subjectId)
        .maybeSingle();
      
      if (!mainSubject) return;

      // Find all subjects with same name, stage, grade (different sections)
      const { data: variants } = await supabase
        .from("subjects")
        .select("id, name, stage, grade, section")
        .eq("name", subjectName || mainSubject.name)
        .eq("stage", mainSubject.stage)
        .eq("grade", mainSubject.grade)
        .eq("is_active", true);

      setAllSubjects((variants as SubjectRow[]) || [mainSubject as SubjectRow]);
      
      // If there are multiple sections, show section selector
      const sections = (variants || []).map(s => s.section).filter(Boolean);
      if (sections.length > 1) {
        // Default to "both"
        setSectionTarget("both");
      } else {
        setSectionTarget(null);
        setActiveSubjectId(subjectId);
      }
    };
    fetchSubjectVariants();
  }, [subjectId, subjectName]);

  const fetchAll = async () => {
    const targetId = activeSubjectId || subjectId;
    if (!targetId || !user) return;
    setIsLoading(true);
    try {
      // If section target is "both", fetch content from all subject variants
      const subjectIds = sectionTarget === "both" 
        ? allSubjects.map(s => s.id)
        : [targetId];

      const [{ data: subjectData }, { data: contentData }, { data: groupsData }] =
        await Promise.all([
          supabase.from("subjects").select("id, name, stage, grade, section").eq("id", subjectId!).maybeSingle(),
          supabase
            .from("content")
            .select("id, title, type, file_url, description, created_at, group_id")
            .in("subject_id", subjectIds)
            .eq("is_active", true)
            .eq("uploaded_by", user.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("content_groups")
            .select("id, title")
            .in("subject_id", subjectIds)
            .or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`)
            .eq("is_active", true)
            .order("created_at", { ascending: false }),
        ]);

      setSubject((subjectData as SubjectRow) || null);
      setContent((contentData as ContentRow[]) || []);
      setGroups((groupsData as GroupRow[]) || []);
    } catch (e) {
      console.error(e);
      toast({ title: "خطأ", description: "فشل تحميل محتوى المادة", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [activeSubjectId, subjectId, user?.id, sectionTarget]);

  // Update activeSubjectId when section target changes
  useEffect(() => {
    if (sectionTarget === "scientific") {
      const sci = allSubjects.find(s => s.section === "scientific");
      setActiveSubjectId(sci?.id || subjectId || null);
    } else if (sectionTarget === "literary") {
      const lit = allSubjects.find(s => s.section === "literary");
      setActiveSubjectId(lit?.id || subjectId || null);
    } else {
      setActiveSubjectId(subjectId || null);
    }
  }, [sectionTarget, allSubjects]);

  const openUpload = (type: ContentType) => {
    setUploadType(type);
    setUploadOpen(true);
  };

  const openEdit = (item: ContentRow) => {
    setEditItem({
      id: item.id,
      title: item.title,
      type: item.type,
      file_url: item.file_url,
      description: item.description,
    });
    setEditOpen(true);
  };

  const handleDelete = async (item: ContentRow) => {
    if (!confirm("هل أنت متأكد من حذف هذا المحتوى؟")) return;
    try {
      const parsed = extractStoragePathFromPublicUrl(item.file_url);
      if (parsed) await supabase.storage.from(parsed.bucket).remove([parsed.path]);
      const { error } = await supabase.from("content").update({ is_active: false }).eq("id", item.id).eq("uploaded_by", user?.id);
      if (error) throw error;
      toast({ title: "تم", description: "تم حذف المحتوى" });
      fetchAll();
    } catch (e) {
      console.error(e);
      toast({ title: "خطأ", description: "فشل حذف المحتوى", variant: "destructive" });
    }
  };

  // Get the target subject IDs for upload (based on section selection)
  const getUploadSubjectIds = (): string[] => {
    if (sectionTarget === "both") return allSubjects.map(s => s.id);
    if (sectionTarget === "scientific") {
      const s = allSubjects.find(s => s.section === "scientific");
      return s ? [s.id] : [subjectId!];
    }
    if (sectionTarget === "literary") {
      const s = allSubjects.find(s => s.section === "literary");
      return s ? [s.id] : [subjectId!];
    }
    return [subjectId!];
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <h2 className="text-lg font-semibold">المادة غير موجودة</h2>
            <p className="text-muted-foreground mt-2">تأكد من رابط المادة أو ارجع لقائمة المواد.</p>
            <Button className="mt-4" onClick={() => navigate("/teacher")}>رجوع</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const subtitle = `${stageLabel(subject.stage)} - ${gradeLabelFn(subject.grade)}`;
  const hasSections = allSubjects.length > 1 && allSubjects.some(s => s.section);

  const renderContentList = (items: ContentRow[], type: string, emptyIcon: any, emptyText: string, uploadFn: () => void, uploadLabel: string) => (
    <div className="space-y-4">
      <Button onClick={uploadFn} className="gap-2">
        <Plus className="h-5 w-5" />
        {uploadLabel}
      </Button>
      {items.length === 0 ? (
        <Card className="p-8 text-center">
          {emptyIcon}
          <h3 className="text-lg font-semibold mb-2">{emptyText}</h3>
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((item, idx) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`p-3 rounded-lg ${type === "video" ? "bg-primary text-primary-foreground" : "bg-accent"}`}>
                    {type === "video" ? <Play className="h-6 w-6" /> : <FileText className="h-6 w-6 text-primary" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{item.title}</h3>
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
                  <Button variant="outline" size="sm" asChild className="gap-2">
                    <a href={item.file_url} target="_blank" rel="noopener noreferrer">
                      {type === "video" ? <Eye className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                      {type === "video" ? "مشاهدة" : "تحميل"}
                    </a>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(item)}><Trash2 className="h-4 w-4" /></Button>
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
          <Link to="/teacher" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-azhari shadow-lg shadow-primary/20">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient-azhari">أزهاريون - لوحة المعلم</span>
          </Link>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <Upload className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">وضع الرفع</span>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        <Button variant="ghost" className="mb-6 hover:bg-accent" onClick={() => navigate(backTo)}>
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
          رجوع للمواد
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">{subject.name}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>

        {/* Section Targeting */}
        {hasSections && (
          <div className="mb-6 p-4 rounded-lg border bg-accent/30">
            <p className="font-bold mb-2">استهداف القسم:</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={sectionTarget === "scientific" ? "default" : "outline"}
                size="sm"
                onClick={() => setSectionTarget("scientific")}
              >
                القسم العلمي
              </Button>
              <Button
                variant={sectionTarget === "literary" ? "default" : "outline"}
                size="sm"
                onClick={() => setSectionTarget("literary")}
              >
                القسم الأدبي
              </Button>
              <Button
                variant={sectionTarget === "both" ? "default" : "outline"}
                size="sm"
                onClick={() => setSectionTarget("both")}
              >
                القسمين معًا
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {sectionTarget === "scientific" && "سيظهر المحتوى لطلاب القسم العلمي فقط"}
              {sectionTarget === "literary" && "سيظهر المحتوى لطلاب القسم الأدبي فقط"}
              {sectionTarget === "both" && "سيظهر المحتوى لطلاب القسمين العلمي والأدبي"}
            </p>
          </div>
        )}

        {/* Groups Manager */}
        <div className="mb-8">
          <TeacherGroupManager subjectId={activeSubjectId || subjectId!} sectionName={sectionTarget || "both"} />
        </div>

        <Tabs defaultValue="books" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="books" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">كتب</span>
              <span className="text-xs bg-muted px-1.5 rounded">{books.length}</span>
            </TabsTrigger>
            <TabsTrigger value="lessons" className="gap-2">
              <Video className="h-4 w-4" />
              <span className="hidden sm:inline">دروس</span>
              <span className="text-xs bg-muted px-1.5 rounded">{videos.length}</span>
            </TabsTrigger>
            <TabsTrigger value="summaries" className="gap-2">
              <FileQuestion className="h-4 w-4" />
              <span className="hidden sm:inline">ملخصات</span>
              <span className="text-xs bg-muted px-1.5 rounded">{summaries.length}</span>
            </TabsTrigger>
            <TabsTrigger value="exams" className="gap-2">
              <FileQuestion className="h-4 w-4" />
              <span className="hidden sm:inline">امتحانات</span>
              <span className="text-xs bg-muted px-1.5 rounded">{exams.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="books">
            {renderContentList(books, "pdf", <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />, "لا توجد كتب", () => openUpload("pdf"), "رفع كتاب PDF")}
          </TabsContent>
          <TabsContent value="lessons">
            {renderContentList(videos, "video", <Video className="h-12 w-12 mx-auto text-muted-foreground mb-4" />, "لا توجد فيديوهات", () => openUpload("video"), "رفع فيديو جديد")}
          </TabsContent>
          <TabsContent value="summaries">
            {renderContentList(summaries, "pdf", <FileQuestion className="h-12 w-12 mx-auto text-muted-foreground mb-4" />, "لا توجد ملخصات", () => openUpload("summary"), "رفع ملخص جديد")}
          </TabsContent>
          <TabsContent value="exams">
            {renderContentList(exams, "pdf", <FileQuestion className="h-12 w-12 mx-auto text-muted-foreground mb-4" />, "لا توجد امتحانات", () => openUpload("exam"), "رفع امتحان جديد")}
          </TabsContent>
        </Tabs>
      </main>

      {/* Upload Dialog - with group selection */}
      <ContentUpsertDialog
        mode="create"
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        subjectId={activeSubjectId || subjectId!}
        type={uploadType}
        uploadedBy={user?.id}
        onSuccess={fetchAll}
        groups={groups}
        sectionTarget={sectionTarget}
        allSubjectIds={getUploadSubjectIds()}
      />

      {/* Edit Dialog */}
      {editItem && (
        <ContentUpsertDialog
          mode="edit"
          open={editOpen}
          onOpenChange={setEditOpen}
          subjectId={activeSubjectId || subjectId!}
          item={editItem}
          onSuccess={fetchAll}
        />
      )}
    </div>
  );
};

export default TeacherUploadContent;
