import { useState, useEffect } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { resolveBunnyStorageUrl } from "@/lib/bunnyStorage";
import {
  BookOpen,
  ChevronLeft,
  User,
  Settings,
  LogOut,
  FileText,
  Video,
  Download,
  Play,
  Bot,
  Send,
  Loader2,
  FileQuestion,
  Upload,
  Plus,
  Trash2,
  Edit,
  Eye,
  File,
} from "lucide-react";

interface Subject {
  id: string;
  name: string;
  stage: string;
  grade: string;
  section: string | null;
  category: string;
}

interface Content {
  id: string;
  title: string;
  type: string;
  file_url: string;
  description: string | null;
  duration: string | null;
  page_count: number | null;
  created_at: string;
}

const AdminSubjectContent = () => {
  const navigate = useNavigate();
  const { subjectId } = useParams();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const stage = searchParams.get("stage") || "";
  const grade = searchParams.get("grade") || "";
  const section = searchParams.get("section") || "";

  const [subject, setSubject] = useState<Subject | null>(null);
  const [videos, setVideos] = useState<Content[]>([]);
  const [books, setBooks] = useState<Content[]>([]);
  const [summaries, setSummaries] = useState<Content[]>([]);
  const [exams, setExams] = useState<Content[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Upload state
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadType, setUploadType] = useState<"video" | "pdf" | "summary" | "exam">("video");
  const [uploadForm, setUploadForm] = useState({
    title: "",
    description: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (subjectId) {
      fetchSubject();
      fetchContent();
    }
  }, [subjectId]);

  const fetchSubject = async () => {
    try {
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .eq("id", subjectId)
        .single();

      if (error) throw error;
      setSubject(data);
    } catch (error) {
      console.error("Error fetching subject:", error);
    }
  };

  const fetchContent = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("content")
        .select("*")
        .eq("subject_id", subjectId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setVideos(data?.filter((c) => c.type === "video") || []);
      setBooks(data?.filter((c) => c.type === "pdf") || []);
      setSummaries(data?.filter((c) => c.type === "summary") || []);
      setExams(data?.filter((c) => c.type === "exam") || []);
    } catch (error) {
      console.error("Error fetching content:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getBucketName = (type: string) => {
    switch (type) {
      case "video":
        return "videos";
      case "pdf":
      case "summary":
        return "books";
      case "exam":
        return "exams";
      default:
        return "books";
    }
  };

  const getAcceptedFileTypes = (type: string) => {
    switch (type) {
      case "video":
        return "video/*";
      case "pdf":
      case "summary":
      case "exam":
        return ".pdf";
      default:
        return "*";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        toast({
          title: "خطأ",
          description: "حجم الملف كبير جداً (الحد الأقصى 100 ميجا)",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!uploadForm.title.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال عنوان المحتوى", variant: "destructive" });
      return;
    }

    if (!selectedFile) {
      toast({ title: "خطأ", description: "يرجى اختيار ملف للرفع", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const bucket = getBucketName(uploadType);
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${subjectId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      // Upload file to storage
      const { uploadFile } = await import("@/lib/storage");
      const stored = await uploadFile({
        scope: { kind: "main" },
        category: `content/${bucket}`,
        file: selectedFile,
        fileName,
      });

      clearInterval(progressInterval);

      // Save content metadata
      const { error: insertError } = await supabase.from("content").insert({
        title: uploadForm.title,
        type: uploadType,
        file_url: stored.url,
        subject_id: subjectId,
        description: uploadForm.description || null,
      });

      if (insertError) throw insertError;

      setUploadProgress(100);

      toast({ title: "تم بنجاح", description: "تم رفع المحتوى بنجاح" });
      setShowUploadDialog(false);
      setUploadForm({ title: "", description: "" });
      setSelectedFile(null);
      setUploadProgress(0);
      fetchContent();
    } catch (error) {
      console.error("Upload error:", error);
      toast({ title: "خطأ", description: "فشل في رفع الملف", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteContent = async (contentId: string, fileUrl: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا المحتوى؟")) return;

    try {
      // Extract file path from URL
      const urlParts = fileUrl.split("/storage/v1/object/public/");
      if (urlParts.length === 2) {
        const pathParts = urlParts[1].split("/");
        const bucket = pathParts[0];
        const filePath = pathParts.slice(1).join("/");

        // Delete from storage
        await supabase.storage.from(bucket).remove([filePath]);
      }

      // Mark as inactive in database
      const { error } = await supabase
        .from("content")
        .update({ is_active: false })
        .eq("id", contentId);

      if (error) throw error;

      toast({ title: "تم بنجاح", description: "تم حذف المحتوى" });
      fetchContent();
    } catch (error) {
      console.error("Delete error:", error);
      toast({ title: "خطأ", description: "فشل في حذف المحتوى", variant: "destructive" });
    }
  };

  const openUploadDialog = (type: "video" | "pdf" | "summary" | "exam") => {
    setUploadType(type);
    setUploadForm({ title: "", description: "" });
    setSelectedFile(null);
    setShowUploadDialog(true);
  };

  const getUploadTypeLabel = () => {
    switch (uploadType) {
      case "video":
        return "فيديو";
      case "pdf":
        return "كتاب PDF";
      case "summary":
        return "ملخص";
      case "exam":
        return "امتحان";
      default:
        return "";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* الهيدر */}
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to="/admin" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-mudrik shadow-mudrik">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient-mudrik">مدرك Plus - لوحة الرفع</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
              <Upload className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">وضع الرفع</span>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent">
              <User className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">أدمن</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        {/* زر الرجوع */}
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() =>
            navigate(`/admin/content-browser/subjects?stage=${stage}&grade=${grade}${section ? `&section=${section}` : ""}`)
          }
        >
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
          رجوع للمواد
        </Button>

        {/* معلومات المادة */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">{subject?.name}</h1>
          <p className="text-muted-foreground">إدارة محتوى المادة - رفع وحذف وتعديل</p>
        </div>

        {/* التبويبات */}
        <Tabs defaultValue="videos" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="videos" className="gap-2">
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
              <span className="hidden sm:inline">ملخصات</span>
              <span className="text-xs bg-muted px-1.5 rounded">{summaries.length}</span>
            </TabsTrigger>
            <TabsTrigger value="exams" className="gap-2">
              <File className="h-4 w-4" />
              <span className="hidden sm:inline">امتحانات</span>
              <span className="text-xs bg-muted px-1.5 rounded">{exams.length}</span>
            </TabsTrigger>
          </TabsList>

          {/* تبويب الفيديوهات */}
          <TabsContent value="videos">
            <div className="space-y-4">
              {/* زر الرفع */}
              <Button onClick={() => openUploadDialog("video")} className="gap-2">
                <Plus className="h-5 w-5" />
                رفع فيديو جديد
              </Button>

              {videos.length === 0 ? (
                <Card className="p-8 text-center">
                  <Video className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">لا توجد فيديوهات</h3>
                  <p className="text-muted-foreground">ابدأ برفع أول فيديو للمادة</p>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {videos.map((video, index) => (
                    <Card key={video.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-3 rounded-lg bg-primary text-primary-foreground">
                            <Play className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground">{video.title}</h3>
                            <p className="text-sm text-muted-foreground">
                              الدرس {index + 1} {video.description && `• ${video.description}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <a href={resolveBunnyStorageUrl(video.file_url)} target="_blank" rel="noopener noreferrer">
                              <Eye className="h-4 w-4 ml-1" />
                              مشاهدة
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteContent(video.id, video.file_url)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* تبويب الكتب */}
          <TabsContent value="books">
            <div className="space-y-4">
              <Button onClick={() => openUploadDialog("pdf")} className="gap-2">
                <Plus className="h-5 w-5" />
                رفع كتاب PDF
              </Button>

              {books.length === 0 ? (
                <Card className="p-8 text-center">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">لا توجد كتب</h3>
                  <p className="text-muted-foreground">ابدأ برفع أول كتاب للمادة</p>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {books.map((book) => (
                    <Card key={book.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-3 rounded-lg bg-accent">
                            <FileText className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground">{book.title}</h3>
                            <p className="text-sm text-muted-foreground">
                              {book.description || "كتاب PDF"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <a href={resolveBunnyStorageUrl(book.file_url)} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4 ml-1" />
                              تحميل
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteContent(book.id, book.file_url)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* تبويب الملخصات */}
          <TabsContent value="summaries">
            <div className="space-y-4">
              <Button onClick={() => openUploadDialog("summary")} className="gap-2">
                <Plus className="h-5 w-5" />
                رفع ملخص
              </Button>

              {summaries.length === 0 ? (
                <Card className="p-8 text-center">
                  <FileQuestion className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">لا توجد ملخصات</h3>
                  <p className="text-muted-foreground">ابدأ برفع أول ملخص للمادة</p>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {summaries.map((summary) => (
                    <Card key={summary.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-3 rounded-lg bg-gold/10">
                            <FileQuestion className="h-6 w-6 text-gold" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground">{summary.title}</h3>
                            <p className="text-sm text-muted-foreground">
                              {summary.description || "ملخص"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <a href={resolveBunnyStorageUrl(summary.file_url)} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4 ml-1" />
                              تحميل
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteContent(summary.id, summary.file_url)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* تبويب الامتحانات */}
          <TabsContent value="exams">
            <div className="space-y-4">
              <Button onClick={() => openUploadDialog("exam")} className="gap-2">
                <Plus className="h-5 w-5" />
                رفع امتحان
              </Button>

              {exams.length === 0 ? (
                <Card className="p-8 text-center">
                  <File className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">لا توجد امتحانات</h3>
                  <p className="text-muted-foreground">ابدأ برفع أول امتحان للمادة</p>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {exams.map((exam) => (
                    <Card key={exam.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-3 rounded-lg bg-destructive/10">
                            <File className="h-6 w-6 text-destructive" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground">{exam.title}</h3>
                            <p className="text-sm text-muted-foreground">
                              {exam.description || "امتحان"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <a href={resolveBunnyStorageUrl(exam.file_url)} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4 ml-1" />
                              تحميل
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteContent(exam.id, exam.file_url)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Dialog رفع المحتوى */}
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>رفع {getUploadTypeLabel()} جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>العنوان *</Label>
                <Input
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                  placeholder={`عنوان ${getUploadTypeLabel()}...`}
                />
              </div>
              <div>
                <Label>الوصف (اختياري)</Label>
                <Textarea
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                  placeholder="وصف مختصر..."
                />
              </div>
              <div>
                <Label>الملف *</Label>
                <div className="mt-2">
                  <Input
                    type="file"
                    accept={getAcceptedFileTypes(uploadType)}
                    onChange={handleFileChange}
                    className="cursor-pointer"
                  />
                  {selectedFile && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {selectedFile.name} ({formatFileSize(selectedFile.size)})
                    </p>
                  )}
                </div>
              </div>

              {isUploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>جاري الرفع...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} />
                </div>
              )}

              <Button
                onClick={handleUpload}
                disabled={isUploading || !uploadForm.title.trim() || !selectedFile}
                className="w-full"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    جاري الرفع...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 ml-2" />
                    رفع {getUploadTypeLabel()}
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default AdminSubjectContent;
