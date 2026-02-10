import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import ContentUpsertDialog, { ContentItem, ContentType, extractStoragePathFromPublicUrl } from "@/components/content/ContentUpsertDialog";
import PaywallDialog from "@/components/subscription/PaywallDialog";
// TeacherBanner moved to Subjects page (category level)
import {
  BookOpen,
  ChevronLeft,
  Settings,
  LogOut,
  Info,
  MessageSquare,
  FileText,
  Video,
  Download,
  Play,
  Bot,
  Loader2,
  FileQuestion,
  Plus,
  Trash2,
  Edit,
  Eye,
  Lock,
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
};

function stageLabel(stage: string) {
  if (stage === "preparatory") return "المرحلة الإعدادية";
  if (stage === "secondary") return "المرحلة الثانوية";
  return "";
}

function gradeLabel(grade: string) {
  if (grade === "first") return "الصف الأول";
  if (grade === "second") return "الصف الثاني";
  if (grade === "third") return "الصف الثالث";
  return "";
}

function sectionLabel(section: string | null) {
  if (section === "scientific") return "علمي";
  if (section === "literary") return "أدبي";
  return "";
}

const SubjectPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, role, signOut } = useAuth();
  const { subjectId } = useParams();
  const [searchParams] = useSearchParams();
  const { hasActiveSubscription } = useSubscription(subjectId);

  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [content, setContent] = useState<ContentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);
  const [_chosenTeacherId, setChosenTeacherId] = useState<string | null>(null);
  const [_chosenTeacherName, setChosenTeacherName] = useState<string | null>(null);

  // dialogs
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadType, setUploadType] = useState<ContentType>("video");
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<ContentItem | null>(null);

  const isSubscribed = hasActiveSubscription(subjectId);


  const backTo = useMemo(() => {
    const stage = searchParams.get("stage");
    const grade = searchParams.get("grade");
    const section = searchParams.get("section");
    if (!stage || !grade) return "/subjects";
    return `/subjects?stage=${stage}&grade=${grade}${section ? `&section=${section}` : ""}`;
  }, [searchParams]);

  const videos = useMemo(() => content.filter((c) => c.type === "video"), [content]);
  const books = useMemo(() => content.filter((c) => c.type === "pdf"), [content]);
  const summaries = useMemo(() => content.filter((c) => c.type === "summary"), [content]);
  const exams = useMemo(() => content.filter((c) => c.type === "exam"), [content]);

  const fetchAll = async () => {
    if (!subjectId) return;
    setIsLoading(true);
    try {
      // 1. Fetch subject with category
      const { data: subjectData, error: subjectError } = await supabase
        .from("subjects")
        .select("id, name, stage, grade, section, category")
        .eq("id", subjectId)
        .maybeSingle();

      if (subjectError) throw subjectError;
      setSubject((subjectData as SubjectRow) || null);

      // 2. Get teacher choice for student (content isolation)
      let teacherId: string | null = null;
      if (user && role !== "admin" && subjectData) {
        const { data: choiceData } = await supabase
          .from("student_teacher_choices")
          .select("teacher_id")
          .eq("student_id", user.id)
          .eq("category", subjectData.category)
          .eq("stage", subjectData.stage)
          .eq("grade", subjectData.grade)
          .maybeSingle();

        if (choiceData) {
          teacherId = choiceData.teacher_id;
          setChosenTeacherId(choiceData.teacher_id);

          // Get teacher name for paywall
          const { data: teacherProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", choiceData.teacher_id)
            .maybeSingle();

          setChosenTeacherName(teacherProfile?.full_name || null);
        } else {
          setChosenTeacherId(null);
          setChosenTeacherName(null);
        }
      }

      // 3. Fetch content (filtered by chosen teacher for students, or all for browsing)
      let contentQuery = supabase
        .from("content")
        .select("id, title, type, file_url, description, created_at")
        .eq("subject_id", subjectId)
        .eq("is_active", true);

      // If student chose a teacher, only show that teacher's content
      if (teacherId && role !== "admin") {
        contentQuery = contentQuery.eq("uploaded_by", teacherId);
      }

      const { data: contentData, error: contentError } = await contentQuery
        .order("created_at", { ascending: false });

      if (contentError) throw contentError;
      setContent((contentData as ContentRow[]) || []);
    } catch (e) {
      console.error(e);
      toast({ title: "خطأ", description: "فشل تحميل محتوى المادة", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const _handleTeacherSelected = (teacherId: string) => {
    setChosenTeacherId(teacherId);
    fetchAll();
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  useEffect(() => {
    if (!subjectId) return;

    const channel = supabase
      .channel(`subject-content-${subjectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "content", filter: `subject_id=eq.${subjectId}` },
        () => {
          // Any change => refresh
          fetchAll();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

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
    if (role !== "admin") return;
    if (!confirm("هل أنت متأكد من حذف هذا المحتوى؟")) return;

    try {
      const parsed = extractStoragePathFromPublicUrl(item.file_url);
      if (parsed) {
        await supabase.storage.from(parsed.bucket).remove([parsed.path]);
      }

      const { error } = await supabase.from("content").update({ is_active: false }).eq("id", item.id);
      if (error) throw error;

      toast({ title: "تم", description: "تم حذف المحتوى" });
      fetchAll();
    } catch (e) {
      console.error(e);
      toast({ title: "خطأ", description: "فشل حذف المحتوى", variant: "destructive" });
    }
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
            <Button className="mt-4" onClick={() => navigate(backTo)}>
              رجوع
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const subtitle = `${stageLabel(subject.stage)} - ${gradeLabel(subject.grade)}${subject.section ? ` - ${sectionLabel(subject.section)}` : ""}`;

  const isAdmin = role === "admin";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-azhari shadow-azhari">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient-azhari">أزهاريون</span>
          </Link>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/about-platform">
                <Info className="h-5 w-5" />
              </Link>
            </Button>

            <Button variant="ghost" size="icon" asChild>
              <Link to="/support">
                <MessageSquare className="h-5 w-5" />
              </Link>
            </Button>

            {isAdmin && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
                <span className="text-sm font-medium text-primary">وضع الرفع</span>
              </div>
            )}

            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>

            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        <Button variant="ghost" className="mb-6" onClick={() => navigate(backTo)}>
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
          رجوع للمواد
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">{subject.name}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>

        {/* Teacher selection moved to Subjects page (category level) */}

        <Tabs defaultValue="books" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="books" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">كتب المادة</span>
              <span className="text-xs bg-muted px-1.5 rounded">{books.length}</span>
            </TabsTrigger>
            <TabsTrigger value="lessons" className="gap-2">
              <Video className="h-4 w-4" />
              <span className="hidden sm:inline">شرح الدروس</span>
              <span className="text-xs bg-muted px-1.5 rounded">{videos.length}</span>
            </TabsTrigger>
            <TabsTrigger value="resources" className="gap-2">
              <FileQuestion className="h-4 w-4" />
              <span className="hidden sm:inline">ملخصات وامتحانات</span>
              <span className="text-xs bg-muted px-1.5 rounded">{summaries.length + exams.length}</span>
            </TabsTrigger>
            <TabsTrigger 
              value="ai" 
              className="gap-2"
              onClick={(e) => {
                e.preventDefault();
                navigate(`/subject/${subjectId}/ai-chat`);
              }}
            >
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">المساعد الذكي</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="books">
            <div className="space-y-4">
              {isAdmin && (
                <Button onClick={() => openUpload("pdf")} className="gap-2">
                  <Plus className="h-5 w-5" />
                  رفع كتاب PDF
                </Button>
              )}

              {books.length === 0 ? (
                <Card className="p-8 text-center">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">لا توجد كتب</h3>
                  <p className="text-muted-foreground">لم يتم رفع كتب لهذه المادة بعد</p>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {books.map((book) => (
                    <Card key={book.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="p-3 rounded-lg bg-accent">
                            <FileText className="h-6 w-6 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground truncate">{book.title}</h3>
                            {book.description && <p className="text-sm text-muted-foreground truncate">{book.description}</p>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="gap-2"
                            onClick={(e) => {
                              if (!isSubscribed) {
                                e.preventDefault();
                                setShowPaywall(true);
                              } else {
                                window.open(book.file_url, "_blank");
                              }
                            }}
                          >
                            {isSubscribed ? <Download className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            {isSubscribed ? "تحميل" : "مدفوع"}
                          </Button>

                          {isAdmin && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => openEdit(book)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDelete(book)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="lessons">
            <div className="space-y-4">
              {isAdmin && (
                <Button onClick={() => openUpload("video")} className="gap-2">
                  <Plus className="h-5 w-5" />
                  رفع فيديو جديد
                </Button>
              )}

              {videos.length === 0 ? (
                <Card className="p-8 text-center">
                  <Video className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">لا توجد فيديوهات</h3>
                  <p className="text-muted-foreground">لم يتم رفع فيديوهات لهذه المادة بعد</p>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {videos.map((video, index) => (
                    <Card key={video.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="p-3 rounded-lg bg-primary text-primary-foreground">
                            <Play className="h-6 w-6" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground truncate">{video.title}</h3>
                            <p className="text-sm text-muted-foreground truncate">
                              الدرس {index + 1} {video.description ? `• ${video.description}` : ""}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="gap-2"
                            onClick={(e) => {
                              if (!isSubscribed) {
                                e.preventDefault();
                                setShowPaywall(true);
                              } else {
                                window.open(video.file_url, "_blank");
                              }
                            }}
                          >
                            {isSubscribed ? <Eye className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            {isSubscribed ? "مشاهدة" : "مدفوع"}
                          </Button>

                          {isAdmin && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => openEdit(video)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDelete(video)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="resources">
            <div className="space-y-8">
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">الملخصات</h2>
                  {isAdmin && (
                    <Button variant="outline" size="sm" onClick={() => openUpload("summary")} className="gap-2">
                      <Plus className="h-4 w-4" />
                      رفع ملخص
                    </Button>
                  )}
                </div>

                {summaries.length === 0 ? (
                  <Card className="p-6 text-center">
                    <FileQuestion className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">لا توجد ملخصات</p>
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {summaries.map((s) => (
                      <Card key={s.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="p-3 rounded-lg bg-gold/10">
                              <FileQuestion className="h-6 w-6 text-gold" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-semibold text-foreground truncate">{s.title}</h3>
                              {s.description && <p className="text-sm text-muted-foreground truncate">{s.description}</p>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="gap-2"
                              onClick={(e) => {
                                if (!isSubscribed) {
                                  e.preventDefault();
                                  setShowPaywall(true);
                                } else {
                                  window.open(s.file_url, "_blank");
                                }
                              }}
                            >
                              {isSubscribed ? <Download className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                              {isSubscribed ? "تحميل" : "مدفوع"}
                            </Button>

                            {isAdmin && (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleDelete(s)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">الامتحانات</h2>
                  {isAdmin && (
                    <Button variant="outline" size="sm" onClick={() => openUpload("exam")} className="gap-2">
                      <Plus className="h-4 w-4" />
                      رفع امتحان
                    </Button>
                  )}
                </div>

                {exams.length === 0 ? (
                  <Card className="p-6 text-center">
                    <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">لا توجد امتحانات</p>
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {exams.map((ex) => (
                      <Card key={ex.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="p-3 rounded-lg bg-accent">
                              <FileText className="h-6 w-6 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-semibold text-foreground truncate">{ex.title}</h3>
                              {ex.description && <p className="text-sm text-muted-foreground truncate">{ex.description}</p>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="gap-2"
                              onClick={(e) => {
                                if (!isSubscribed) {
                                  e.preventDefault();
                                  setShowPaywall(true);
                                } else {
                                  window.open(ex.file_url, "_blank");
                                }
                              }}
                            >
                              {isSubscribed ? <Download className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                              {isSubscribed ? "تحميل" : "مدفوع"}
                            </Button>

                            {isAdmin && (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => openEdit(ex)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleDelete(ex)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </TabsContent>

          {/* AI Tab redirects to dedicated page */}
        </Tabs>
      </main>

      {subjectId && isAdmin && (
        <ContentUpsertDialog
          mode="create"
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          subjectId={subjectId}
          type={uploadType}
          uploadedBy={user?.id}
          onSuccess={fetchAll}
        />
      )}

      {subjectId && isAdmin && editItem && (
        <ContentUpsertDialog
          mode="edit"
          open={editOpen}
          onOpenChange={setEditOpen}
          subjectId={subjectId}
          item={editItem}
          onSuccess={fetchAll}
        />
      )}

      {/* Paywall Dialog */}
      {subject && user && (
        <PaywallDialog
          open={showPaywall}
          onOpenChange={setShowPaywall}
          subjectName={subject.name}
          grade={subject.grade}
          stage={subject.stage}
          section={subject.section}
          studentId={user.id}
          teacherName={_chosenTeacherName}
        />
      )}
    </div>
  );
};

export default SubjectPage;

