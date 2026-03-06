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
  Calendar,
  BookText,
  AlertTriangle,
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
  description: string | null;
  month_label: string | null;
  image_url: string | null;
  price: number;
  price_approved: boolean | null;
  section_name: string;
  subject_id: string;
  is_active: boolean;
  lesson_count: number | null;
  start_date: string | null;
  end_date: string | null;
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

type ViewStep = "groups_list" | "content_view";

const TeacherUploadContent = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { subjectId } = useParams();
  const [searchParams] = useSearchParams();

  const [allSubjects, setAllSubjects] = useState<SubjectRow[]>([]);
  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [content, setContent] = useState<ContentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // View step
  const [viewStep, setViewStep] = useState<ViewStep>("groups_list");
  const [selectedGroup, setSelectedGroup] = useState<GroupRow | null>(null);

  // Section targeting - only used during upload
  const [sectionTarget, setSectionTarget] = useState<string>("both");

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

  // Fetch subject variants (for section targeting)
  useEffect(() => {
    if (!subjectId) return;
    const fetchSubjectVariants = async () => {
      const { data: mainSubject } = await supabase
        .from("subjects")
        .select("id, name, stage, grade, section")
        .eq("id", subjectId)
        .maybeSingle();

      if (!mainSubject) return;
      setSubject(mainSubject as SubjectRow);

      const { data: variants } = await supabase
        .from("subjects")
        .select("id, name, stage, grade, section")
        .eq("name", subjectName || mainSubject.name)
        .eq("stage", mainSubject.stage)
        .eq("grade", mainSubject.grade)
        .eq("is_active", true);

      setAllSubjects((variants as SubjectRow[]) || [mainSubject as SubjectRow]);
    };
    fetchSubjectVariants();
  }, [subjectId, subjectName]);

  // Fetch groups
  const fetchGroups = async () => {
    if (!user || !subjectId) return;
    setIsLoading(true);
    try {
      const subjectIds = allSubjects.length > 0 ? allSubjects.map(s => s.id) : [subjectId];

      const { data: groupsData } = await supabase
        .from("content_groups")
        .select("*")
        .in("subject_id", subjectIds)
        .or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      setGroups((groupsData as GroupRow[]) || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (allSubjects.length > 0 || subjectId) {
      fetchGroups();
    }
  }, [allSubjects, subjectId, user?.id]);

  // Fetch content for selected group
  const fetchGroupContent = async (groupId: string) => {
    if (!user) return;
    try {
      const { data: contentData } = await supabase
        .from("content")
        .select("id, title, type, file_url, description, created_at, group_id")
        .eq("group_id", groupId)
        .eq("is_active", true)
        .eq("uploaded_by", user.id)
        .order("created_at", { ascending: false });

      // Deduplicate by file_url (in case of both-section uploads)
      const seen = new Set<string>();
      const deduped = (contentData || []).filter(c => {
        if (seen.has(c.file_url)) return false;
        seen.add(c.file_url);
        return true;
      });

      setContent(deduped as ContentRow[]);
    } catch (e) {
      console.error(e);
    }
  };

  const enterGroup = (group: GroupRow) => {
    setSelectedGroup(group);
    setViewStep("content_view");
    fetchGroupContent(group.id);
  };

  const goBackToGroups = () => {
    setViewStep("groups_list");
    setSelectedGroup(null);
    setContent([]);
    fetchGroups();
  };

  const videos = useMemo(() => content.filter((c) => c.type === "video"), [content]);
  const books = useMemo(() => content.filter((c) => c.type === "pdf"), [content]);
  const summaries = useMemo(() => content.filter((c) => c.type === "summary"), [content]);
  const exams = useMemo(() => content.filter((c) => c.type === "exam"), [content]);

  const hasSections = allSubjects.length > 1 && allSubjects.some(s => s.section);

  const openUpload = (type: ContentType) => {
    setUploadType(type);
    // Reset section target
    setSectionTarget(hasSections ? "both" : "scientific");
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
      if (selectedGroup) fetchGroupContent(selectedGroup.id);
    } catch (e) {
      console.error(e);
      toast({ title: "خطأ", description: "فشل حذف المحتوى", variant: "destructive" });
    }
  };

  // Get the target subject IDs based on section selection (for upload)
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

  const getActiveSubjectId = (): string => {
    if (sectionTarget === "scientific") {
      const sci = allSubjects.find(s => s.section === "scientific");
      return sci?.id || subjectId!;
    }
    if (sectionTarget === "literary") {
      const lit = allSubjects.find(s => s.section === "literary");
      return lit?.id || subjectId!;
    }
    return subjectId!;
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
          {items.map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`p-3 rounded-lg ${type === "video" ? "bg-primary text-primary-foreground" : "bg-accent"}`}>
                    {type === "video" ? <Play className="h-6 w-6" /> : <FileText className="h-6 w-6 text-primary" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{item.title}</h3>
                    {item.description && <p className="text-sm text-muted-foreground truncate">{item.description}</p>}
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

  // ========== GROUPS LIST VIEW ==========
  const renderGroupsList = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          المجموعات / الكورسات
        </h2>
        <TeacherGroupManager
          subjectId={subjectId!}
          sectionName="both"
          renderTriggerOnly
          onGroupCreated={fetchGroups}
        />
      </div>

      {groups.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="p-12 text-center">
            <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-bold mb-2">لا توجد مجموعات بعد</h3>
            <p className="text-muted-foreground mb-6">أنشئ مجموعة جديدة لتنظيم المحتوى وبيعه للطلاب</p>
            <TeacherGroupManager
              subjectId={subjectId!}
              sectionName="both"
              renderTriggerOnly
              onGroupCreated={fetchGroups}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Card
              key={group.id}
              className="overflow-hidden cursor-pointer hover:shadow-xl hover:border-primary/30 transition-all duration-300 group/card"
              onClick={() => enterGroup(group)}
            >
              {group.image_url && (
                <div className="h-36 bg-muted overflow-hidden">
                  <img src={group.image_url} alt={group.title} className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-300" />
                </div>
              )}
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-lg group-hover/card:text-primary transition-colors">{group.title}</h4>
                    {group.month_label && (
                      <Badge variant="outline" className="gap-1 text-xs mt-1">
                        <Calendar className="h-3 w-3" />
                        {group.month_label}
                      </Badge>
                    )}
                  </div>
                  <Badge className="bg-primary text-primary-foreground font-bold">{group.price} جنيه</Badge>
                </div>
                {group.description && <p className="text-sm text-muted-foreground line-clamp-2">{group.description}</p>}
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {group.lesson_count ? <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />{group.lesson_count} حصة</span> : null}
                  {group.start_date && <span>من: {group.start_date}</span>}
                  {group.end_date && <span>إلى: {group.end_date}</span>}
                </div>
                {group.price_approved === false && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    بانتظار موافقة السعر
                  </Badge>
                )}
                <p className="text-xs text-primary font-medium">اضغط للدخول ورفع المحتوى ←</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // ========== CONTENT VIEW (inside a group) ==========
  const renderContentView = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={goBackToGroups} className="gap-2">
          <ChevronLeft className="h-5 w-5 rotate-180" />
          رجوع للمجموعات
        </Button>
        {selectedGroup && (
          <div className="text-left">
            <h2 className="font-bold text-lg">{selectedGroup.title}</h2>
            {selectedGroup.month_label && (
              <Badge variant="outline" className="text-xs gap-1">
                <Calendar className="h-3 w-3" />
                {selectedGroup.month_label}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Section targeting info - appears above tabs during upload */}
      {hasSections && (
        <div className="p-3 rounded-lg border bg-accent/20 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">ملاحظة:</span> عند رفع محتوى جديد ستتمكن من اختيار القسم المستهدف (علمي / أدبي / القسمين معًا)
        </div>
      )}

      <Tabs defaultValue="lessons" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="lessons" className="gap-2">
            <Video className="h-4 w-4" />
            <span className="hidden sm:inline">شرح الدروس</span>
            <span className="text-xs bg-muted px-1.5 rounded">{videos.length}</span>
          </TabsTrigger>
          <TabsTrigger value="books" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">الكتب</span>
            <span className="text-xs bg-muted px-1.5 rounded">{books.length}</span>
          </TabsTrigger>
          <TabsTrigger value="summaries" className="gap-2">
            <BookText className="h-4 w-4" />
            <span className="hidden sm:inline">الملخصات</span>
            <span className="text-xs bg-muted px-1.5 rounded">{summaries.length}</span>
          </TabsTrigger>
          <TabsTrigger value="exams" className="gap-2">
            <FileQuestion className="h-4 w-4" />
            <span className="hidden sm:inline">الامتحانات</span>
            <span className="text-xs bg-muted px-1.5 rounded">{exams.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lessons">
          {renderContentList(videos, "video", <Video className="h-12 w-12 mx-auto text-muted-foreground mb-4" />, "لا توجد فيديوهات", () => openUpload("video"), "رفع فيديو جديد")}
        </TabsContent>
        <TabsContent value="books">
          {renderContentList(books, "pdf", <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />, "لا توجد كتب", () => openUpload("pdf"), "رفع كتاب PDF")}
        </TabsContent>
        <TabsContent value="summaries">
          {renderContentList(summaries, "pdf", <BookText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />, "لا توجد ملخصات", () => openUpload("summary"), "رفع ملخص جديد")}
        </TabsContent>
        <TabsContent value="exams">
          {renderContentList(exams, "pdf", <FileQuestion className="h-12 w-12 mx-auto text-muted-foreground mb-4" />, "لا توجد امتحانات", () => openUpload("exam"), "رفع امتحان جديد")}
        </TabsContent>
      </Tabs>
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
        <Button variant="ghost" className="mb-6 hover:bg-accent" onClick={() => viewStep === "content_view" ? goBackToGroups() : navigate(backTo)}>
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
          {viewStep === "content_view" ? "رجوع للمجموعات" : "رجوع للمواد"}
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">{subject.name}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>

        {viewStep === "groups_list" && renderGroupsList()}
        {viewStep === "content_view" && renderContentView()}
      </main>

      {/* Upload Dialog - with section targeting inside */}
      <ContentUpsertDialog
        mode="create"
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        subjectId={getActiveSubjectId()}
        type={uploadType}
        uploadedBy={user?.id}
        onSuccess={() => {
          if (selectedGroup) fetchGroupContent(selectedGroup.id);
        }}
        groups={selectedGroup ? [{ id: selectedGroup.id, title: selectedGroup.title }] : []}
        sectionTarget={sectionTarget}
        allSubjectIds={getUploadSubjectIds()}
        defaultGroupId={selectedGroup?.id}
        hasSections={hasSections}
        onSectionTargetChange={setSectionTarget}
      />

      {/* Edit Dialog */}
      {editItem && (
        <ContentUpsertDialog
          mode="edit"
          open={editOpen}
          onOpenChange={setEditOpen}
          subjectId={subjectId!}
          item={editItem}
          onSuccess={() => {
            if (selectedGroup) fetchGroupContent(selectedGroup.id);
          }}
        />
      )}
    </div>
  );
};

export default TeacherUploadContent;
