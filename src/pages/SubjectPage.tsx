import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { openUrlWithinAppContainer } from "@/lib/nativeNavigation";
import DocumentViewerDialog from "@/components/media/DocumentViewerDialog";
import { getPostSignOutPath } from "@/lib/devImpersonation";
import { toast } from "sonner";
import NotificationsDropdown from "@/components/student/NotificationsDropdown";
import {
  BookOpen,
  ChevronLeft,
  FileText,
  Video,
  Download,
  Play,
  Loader2,
  FileQuestion,
  Lock,
  Settings,
  LogOut,
  Info,
  MessageSquare,
} from "lucide-react";

type ContentRow = {
  id: string;
  title: string;
  type: string;
  file_url: string;
  description: string | null;
  created_at: string | null;
  is_paid: boolean;
  is_free_preview?: boolean;
  group_id: string | null;
  uploaded_by: string | null;
};

type SubjectRow = {
  id: string;
  name: string;
  stage: string;
  grade: string;
  section: string | null;
  category: string;
};

function stageLabel(stage: string) {
  if (stage === "preparatory") return "المرحلة الإعدادية";
  if (stage === "secondary") return "المرحلة الثانوية";
  return stage;
}

function gradeLabelFn(grade: string) {
  if (grade === "first") return "الصف الأول";
  if (grade === "second") return "الصف الثاني";
  if (grade === "third") return "الصف الثالث";
  return grade;
}

const SubjectPage = () => {
  const navigate = useNavigate();
  const { subjectId } = useParams();
  const [searchParams] = useSearchParams();
  const { user, signOut } = useAuth();

  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [content, setContent] = useState<ContentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [purchasedGroupIds, setPurchasedGroupIds] = useState<Set<string>>(new Set());
  const [activeDocument, setActiveDocument] = useState<ContentRow | null>(null);

  const hasAccess = (item: ContentRow) => {
    if (!item.is_paid) return true;
    if (item.is_free_preview) return true;
    if (hasSubscription) return true;
    if (item.group_id && purchasedGroupIds.has(item.group_id)) return true;
    return false;
  };

  const stage = searchParams.get("stage") || "";
  const grade = searchParams.get("grade") || "";
  const section = searchParams.get("section") || "";
  const category = searchParams.get("category") || "";

  const backUrl = `/subjects?stage=${stage}&grade=${grade}${section ? `&section=${section}` : ""}&category=${category}`;

  const videos = useMemo(() => content.filter((c) => c.type === "video"), [content]);
  const books = useMemo(() => content.filter((c) => c.type === "pdf"), [content]);
  const summaries = useMemo(() => content.filter((c) => c.type === "summary"), [content]);
  const exams = useMemo(() => content.filter((c) => c.type === "exam"), [content]);

  useEffect(() => {
    if (!subjectId || !user) return;
    fetchData();
  }, [subjectId, user?.id]);

  const fetchData = async () => {
    if (!subjectId || !user) return;
    setIsLoading(true);
    try {
      const contentQuery = (includeFreePreview: boolean) => (supabase.from("content") as any)
        .select(includeFreePreview
          ? "id, title, type, file_url, description, created_at, is_paid, is_free_preview, group_id, uploaded_by"
          : "id, title, type, file_url, description, created_at, is_paid, group_id, uploaded_by")
        .eq("subject_id", subjectId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      const [subjectRes, initialContentRes, subRes, groupPurchasesRes] = await Promise.all([
        supabase.from("subjects").select("*").eq("id", subjectId).maybeSingle(),
        contentQuery(true),
        supabase
          .from("subscriptions")
          .select("id")
          .eq("student_id", user.id)
          .eq("subject_id", subjectId)
          .eq("is_active", true)
          .gt("end_date", new Date().toISOString())
          .limit(1),
        supabase
          .from("student_group_purchases")
          .select("group_id, content_groups!inner(subject_id)")
          .eq("student_id", user.id)
          .eq("content_groups.subject_id", subjectId),
      ]);

      let contentRes = initialContentRes;
      if (contentRes.error && String(contentRes.error.message || "").includes("is_free_preview")) {
        console.warn("[content] is_free_preview unavailable; retrying legacy content query", contentRes.error);
        const legacyRes = await contentQuery(false);
        contentRes = {
          ...legacyRes,
          data: ((legacyRes.data || []) as any[]).map((row) => ({ ...row, is_free_preview: false })),
        } as typeof initialContentRes;
      }

      if (subjectRes.error) throw subjectRes.error;
      if (contentRes.error) throw contentRes.error;

      setSubject(subjectRes.data as SubjectRow | null);
      setContent(((contentRes.data || []) as unknown as ContentRow[]));
      setHasSubscription((subRes.data?.length || 0) > 0);
      setPurchasedGroupIds(new Set((groupPurchasesRes.data || []).map((p: any) => p.group_id)));
    } catch (e) {
      console.error("Error fetching subject data:", e);
      toast.error("خطأ في تحميل بيانات المادة");
    } finally {
      setIsLoading(false);
    }
  };

  const handleContentClick = (item: ContentRow) => {
    if (!hasAccess(item)) {
      toast.error("يجب الاشتراك أولًا لمشاهدة هذا المحتوى");
      return;
    }
    if (!item.file_url) {
      toast.error("رابط الملف غير متاح حاليًا");
      return;
    }
    setActiveDocument(item);
  };

  const handleSignOut = async () => {
    const nextPath = getPostSignOutPath("/");
    await signOut();
    navigate(nextPath, { replace: true });
  };

  if (isLoading) {
    return (
      <div className="mobile-app-page flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="mobile-app-page flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <h2 className="text-lg font-semibold">المادة غير موجودة</h2>
            <p className="text-muted-foreground mt-2">تأكد من رابط المادة أو ارجع لقائمة المواد.</p>
            <Button className="mt-4" onClick={() => navigate(backUrl)}>رجوع</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const subtitle = `${stageLabel(subject.stage)} - ${gradeLabelFn(subject.grade)}`;

  const renderContentList = (items: ContentRow[], icon: React.ReactNode, emptyMsg: string) => {
    if (items.length === 0) {
      return (
        <Card className="p-8 text-center">
          <div className="mx-auto mb-4 text-muted-foreground">{icon}</div>
          <h3 className="text-lg font-semibold mb-2">لا يوجد محتوى</h3>
          <p className="text-muted-foreground">{emptyMsg}</p>
        </Card>
      );
    }

    return (
      <div className="grid gap-4">
        {items.map((item) => (
          <Card
            key={item.id}
            className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => handleContentClick(item)}
          >
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-4 min-w-0">
                <div className="p-3 rounded-lg bg-accent">
                  {item.type === "video" ? (
                    <Play className="h-6 w-6 text-primary" />
                  ) : (
                    <FileText className="h-6 w-6 text-primary" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 dir="auto" className="font-semibold text-foreground line-clamp-2 break-words [overflow-wrap:anywhere]">{item.title}</h3>
                  {item.description && (
                    <p dir="auto" className="text-sm text-muted-foreground line-clamp-2 break-words [overflow-wrap:anywhere]">{item.description}</p>
                  )}
                </div>

              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!hasAccess(item) ? (
                  <Badge variant="secondary" className="gap-1">
                    <Lock className="h-3 w-3" />
                    مدفوع
                  </Badge>
                ) : (
                  <Button variant="outline" size="sm" className="gap-2">
                    {item.type === "video" ? (
                      <>
                        <Play className="h-4 w-4" />
                        مشاهدة
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        تحميل
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="mobile-app-page bg-gradient-to-br from-background via-background to-accent/20">
      {/* Header */}
      <header className="mobile-app-header sticky z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mobile-app-header-inner flex items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-mudrik shadow-lg shadow-primary/20">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient-mudrik">مدرك Plus</span>
          </Link>
          <div className="flex items-center gap-2">
            <NotificationsDropdown />
            <Button variant="ghost" size="icon" asChild>
              <Link to="/about-platform"><Info className="h-5 w-5" /></Link>
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link to="/support"><MessageSquare className="h-5 w-5" /></Link>
            </Button>
            <Button variant="ghost" size="icon"><Settings className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" onClick={handleSignOut}><LogOut className="h-5 w-5" /></Button>
          </div>
        </div>
      </header>

      <main className="mobile-page-content">
        <Button variant="ghost" className="mb-6" onClick={() => navigate(backUrl)}>
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
          رجوع للمواد
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">{subject.name}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
          {!hasSubscription && purchasedGroupIds.size === 0 && (
            <Badge variant="destructive" className="mt-2 gap-1">
              <Lock className="h-3 w-3" />
              يجب الاشتراك لمشاهدة المحتوى المدفوع
            </Badge>
          )}
        </div>

        <Tabs defaultValue="books" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="books" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">الكتب</span>
              <span className="text-xs bg-muted px-1.5 rounded">{books.length}</span>
            </TabsTrigger>
            <TabsTrigger value="lessons" className="gap-2">
              <Video className="h-4 w-4" />
              <span className="hidden sm:inline">الدروس</span>
              <span className="text-xs bg-muted px-1.5 rounded">{videos.length}</span>
            </TabsTrigger>
            <TabsTrigger value="summaries" className="gap-2">
              <FileQuestion className="h-4 w-4" />
              <span className="hidden sm:inline">الملخصات</span>
              <span className="text-xs bg-muted px-1.5 rounded">{summaries.length}</span>
            </TabsTrigger>
            <TabsTrigger value="exams" className="gap-2">
              <FileQuestion className="h-4 w-4" />
              <span className="hidden sm:inline">الامتحانات</span>
              <span className="text-xs bg-muted px-1.5 rounded">{exams.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="books">
            {renderContentList(books, <FileText className="h-12 w-12" />, "لم يتم رفع كتب لهذه المادة بعد")}
          </TabsContent>
          <TabsContent value="lessons">
            {renderContentList(videos, <Video className="h-12 w-12" />, "لم يتم رفع فيديوهات لهذه المادة بعد")}
          </TabsContent>
          <TabsContent value="summaries">
            {renderContentList(summaries, <FileQuestion className="h-12 w-12" />, "لم يتم رفع ملخصات لهذه المادة بعد")}
          </TabsContent>
          <TabsContent value="exams">
            {renderContentList(exams, <FileQuestion className="h-12 w-12" />, "لم يتم رفع امتحانات لهذه المادة بعد")}
          </TabsContent>
        </Tabs>
      </main>

      {activeDocument?.file_url && (
        <DocumentViewerDialog
          open
          fileUrl={activeDocument.file_url}
          title={activeDocument.title}
          onClose={() => setActiveDocument(null)}
        />
      )}
    </div>
  );
};

export default SubjectPage;
