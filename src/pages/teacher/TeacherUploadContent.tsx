import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ContentUpsertDialog, { ContentItem, ContentType, extractStoragePathFromPublicUrl } from "@/components/content/ContentUpsertDialog";
import TeacherExamPanel from "@/components/exam/TeacherExamPanel";
import {
  BookOpen, ChevronLeft, Plus, Trash2, Edit, Video, FileText,
  Loader2, FileQuestion, Upload,
} from "lucide-react";

type SubjectRow = {
  id: string;
  name: string;
  stage: string;
  grade: string;
  section: string | null;
  category: string;
};

type ContentRow = {
  id: string;
  title: string;
  type: string;
  file_url: string;
  description: string | null;
  created_at: string | null;
  group_id: string | null;
  is_paid: boolean;
  order_index: number | null;
};

type ContentGroup = {
  id: string;
  title: string;
  section_name: string;
  price: number;
};

const TeacherUploadContent = () => {
  const { subjectId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [content, setContent] = useState<ContentRow[]>([]);
  const [groups, setGroups] = useState<ContentGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadType, setUploadType] = useState<ContentType>("video");
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<ContentItem | null>(null);

  const backTo = `/teacher/subject?category=${searchParams.get("category") || ""}&grade=${searchParams.get("grade") || ""}&stage=${searchParams.get("stage") || ""}`;

  const fetchAll = useCallback(async () => {
    if (!subjectId || !user) return;
    setIsLoading(true);
    try {
      const [{ data: subjectData }, { data: contentData }, { data: groupsData }] = await Promise.all([
        supabase.from("subjects").select("id, name, stage, grade, section, category").eq("id", subjectId).maybeSingle(),
        supabase.from("content").select("id, title, type, file_url, description, created_at, group_id, is_paid, order_index")
          .eq("subject_id", subjectId).eq("is_active", true).eq("uploaded_by", user.id)
          .order("created_at", { ascending: false }),
        supabase.from("content_groups" as any).select("id, title, section_name, price")
          .eq("subject_id", subjectId).eq("is_active", true),
      ]);

      setSubject(subjectData as SubjectRow);
      setContent((contentData as ContentRow[]) || []);
      setGroups((groupsData as any as ContentGroup[]) || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [subjectId, user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDelete = async (item: ContentRow) => {
    if (!confirm("هل أنت متأكد من حذف هذا المحتوى؟")) return;
    try {
      const parsed = extractStoragePathFromPublicUrl(item.file_url);
      if (parsed) await supabase.storage.from(parsed.bucket).remove([parsed.path]);
      await supabase.from("content").update({ is_active: false }).eq("id", item.id);
      fetchAll();
    } catch (e) {
      console.error(e);
    }
  };

  const openUpload = (type: ContentType) => { setUploadType(type); setUploadOpen(true); };
  const openEdit = (item: ContentRow) => {
    setEditItem({ id: item.id, title: item.title, type: item.type, file_url: item.file_url, description: item.description });
    setEditOpen(true);
  };

  const videos = content.filter((c) => c.type === "video");
  const books = content.filter((c) => c.type === "pdf");
  const summaries = content.filter((c) => c.type === "summary");

  const getGroupName = (groupId: string | null) => {
    if (!groupId) return null;
    const g = groups.find((g) => g.id === groupId);
    return g ? `${g.title} (${g.section_name})` : null;
  };

  const renderContentList = (items: ContentRow[], icon: React.ReactNode, type: ContentType, label: string) => (
    <div className="space-y-4">
      <Button onClick={() => openUpload(type)} className="gap-2">
        <Plus className="h-4 w-4" />
        رفع {label} جديد
      </Button>

      {items.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">لا يوجد محتوى بعد</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="p-3 rounded-lg bg-accent">{icon}</div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{item.title}</h3>
                    {item.description && <p className="text-sm text-muted-foreground truncate">{item.description}</p>}
                    {getGroupName(item.group_id) && (
                      <Badge variant="outline" className="mt-1 text-xs">{getGroupName(item.group_id)}</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(item)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to="/teacher" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">أزهاريون - رفع المحتوى</span>
          </Link>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <Upload className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">وضع الرفع</span>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        <Button variant="ghost" className="mb-6" onClick={() => navigate(backTo)}>
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
          رجوع للمواد
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">{subject?.name}</h1>
        </div>

        <Tabs defaultValue="lessons" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="lessons" className="gap-2">
              <Video className="h-4 w-4" />
              <span className="hidden sm:inline">شرح الدروس</span>
              <span className="text-xs bg-muted px-1.5 rounded">{videos.length}</span>
            </TabsTrigger>
            <TabsTrigger value="books" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">كتب المادة</span>
              <span className="text-xs bg-muted px-1.5 rounded">{books.length}</span>
            </TabsTrigger>
            <TabsTrigger value="summaries" className="gap-2">
              <FileQuestion className="h-4 w-4" />
              <span className="hidden sm:inline">الملخصات</span>
              <span className="text-xs bg-muted px-1.5 rounded">{summaries.length}</span>
            </TabsTrigger>
            <TabsTrigger value="exams" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">الامتحانات</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lessons">
            {renderContentList(videos, <Video className="h-5 w-5 text-primary" />, "video", "فيديو")}
          </TabsContent>

          <TabsContent value="books">
            {renderContentList(books, <FileText className="h-5 w-5 text-primary" />, "pdf", "كتاب")}
          </TabsContent>

          <TabsContent value="summaries">
            {renderContentList(summaries, <FileQuestion className="h-5 w-5 text-primary" />, "summary", "ملخص")}
          </TabsContent>

          <TabsContent value="exams">
            {subject && <TeacherExamPanel subjectId={subject.id} subjectName={subject.name} />}
          </TabsContent>
        </Tabs>

        {/* Upload Dialog */}
        {subjectId && (
          <>
            <ContentUpsertDialog
              mode="create"
              open={uploadOpen}
              onOpenChange={setUploadOpen}
              subjectId={subjectId}
              type={uploadType}
              uploadedBy={user?.id}
              onSuccess={fetchAll}
            />
            {editItem && (
              <ContentUpsertDialog
                mode="edit"
                open={editOpen}
                onOpenChange={setEditOpen}
                subjectId={subjectId}
                item={editItem}
                onSuccess={fetchAll}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default TeacherUploadContent;

