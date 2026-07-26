import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Upload,
  Video,
  FileText,
  Loader2,
  Trash2,
  Plus,
  BookOpen,
} from "lucide-react";

type Subject = {
  id: string;
  name: string;
  stage: string;
  grade: string;
};

type Content = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  file_url: string;
  subject_id: string | null;
  duration: string | null;
  page_count: number | null;
  created_at: string | null;
};

const ContentPage = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [contents, setContents] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [contentType, setContentType] = useState<"video" | "book" | "exam">("video");

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    subjectId: "",
    duration: "",
    pageCount: "",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [subjectsRes, contentsRes] = await Promise.all([
        supabase.from("subjects").select("id, name, stage, grade").eq("is_active", true),
        supabase.from("content").select("*").order("created_at", { ascending: false }),
      ]);

      if (subjectsRes.error) throw subjectsRes.error;
      if (contentsRes.error) throw contentsRes.error;

      setSubjects(subjectsRes.data || []);
      setContents(contentsRes.data || []);
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !formData.title || !formData.subjectId) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    setUploading(true);
    try {
      const bucket = contentType === "video" ? "videos" : contentType === "book" ? "books" : "exams";
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Upload file
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);

      // Save to database
      const { error: dbError } = await supabase.from("content").insert({
        title: formData.title,
        description: formData.description || null,
        type: contentType,
        file_url: urlData.publicUrl,
        subject_id: formData.subjectId,
        duration: contentType === "video" ? formData.duration : null,
        page_count: contentType !== "video" ? parseInt(formData.pageCount) || null : null,
      });

      if (dbError) throw dbError;

      toast.success("تم رفع المحتوى بنجاح");
      setShowUploadDialog(false);
      setFormData({ title: "", description: "", subjectId: "", duration: "", pageCount: "" });
      setSelectedFile(null);
      loadData();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("خطأ في رفع الملف");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (content: Content) => {
    if (!confirm("هل أنت متأكد من حذف هذا المحتوى؟")) return;

    const { deleteContentBunnyAssets, writeDeletionAudit } = await import("@/lib/bunnyCleanup");
    const startedAt = performance.now();
    let bunnyResults: Awaited<ReturnType<typeof deleteContentBunnyAssets>> = [];
    let auditError: string | null = null;

    try {
      // 1) Delete media from Bunny (Stream + Storage) BEFORE removing the DB row,
      //    because bunny-* edge functions authorize deletion by row lookup.
      bunnyResults = await deleteContentBunnyAssets({
        file_url: content.file_url,
        thumbnail_url: (content as unknown as { thumbnail_url?: string | null }).thumbnail_url,
      });

      // 2) Best-effort cleanup of any legacy Supabase Storage object.
      if (content.file_url && !content.file_url.startsWith("bunny://") && !content.file_url.startsWith("bstorage://")) {
        const bucket = content.type === "video" ? "videos" : content.type === "book" ? "books" : "exams";
        const fileName = content.file_url.split("/").pop();
        if (fileName) {
          await supabase.storage.from(bucket).remove([fileName]);
        }
      }

      // 3) Delete from database
      const { error } = await supabase.from("content").delete().eq("id", content.id);
      if (error) throw error;

      toast.success("تم حذف المحتوى");
      loadData();
    } catch (error) {
      auditError = error instanceof Error ? error.message : String(error);
      console.error("Delete error:", error);
      toast.error("خطأ في حذف المحتوى");
    } finally {
      await writeDeletionAudit({
        actionType: "content_delete",
        targetId: content.id,
        targetLabel: content.title,
        targetMeta: { type: content.type, file_url: content.file_url },
        bunnyResults,
        startedAt,
        error: auditError,
      });
    }
  };


  const getSubjectName = (subjectId: string | null) => {
    if (!subjectId) return "-";
    const subject = subjects.find((s) => s.id === subjectId);
    return subject ? subject.name : "-";
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "video":
        return <Video className="h-4 w-4" />;
      case "book":
        return <BookOpen className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case "video":
        return "فيديو";
      case "book":
        return "كتاب";
      case "exam":
        return "امتحان";
      default:
        return type;
    }
  };

  const videos = contents.filter((c) => c.type === "video");
  const books = contents.filter((c) => c.type === "book");
  const exams = contents.filter((c) => c.type === "exam");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Upload className="h-6 w-6" />
          إدارة المحتوى
        </h2>
        <Button onClick={() => setShowUploadDialog(true)}>
          <Plus className="h-4 w-4 ml-2" />
          رفع محتوى جديد
        </Button>
      </div>

      <Tabs defaultValue="videos">
        <TabsList>
          <TabsTrigger value="videos" className="gap-2">
            <Video className="h-4 w-4" />
            الفيديوهات ({videos.length})
          </TabsTrigger>
          <TabsTrigger value="books" className="gap-2">
            <BookOpen className="h-4 w-4" />
            الكتب ({books.length})
          </TabsTrigger>
          <TabsTrigger value="exams" className="gap-2">
            <FileText className="h-4 w-4" />
            الامتحانات ({exams.length})
          </TabsTrigger>
        </TabsList>

        {["videos", "books", "exams"].map((tab) => {
          const tabContents = tab === "videos" ? videos : tab === "books" ? books : exams;
          return (
            <TabsContent key={tab} value={tab}>
              <Card>
                <CardContent className="pt-6">
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : tabContents.length === 0 ? (
                    <p className="text-center text-muted-foreground py-12">
                      لا يوجد محتوى
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">العنوان</TableHead>
                          <TableHead className="text-right">المادة</TableHead>
                          <TableHead className="text-right">
                            {tab === "videos" ? "المدة" : "الصفحات"}
                          </TableHead>
                          <TableHead className="text-right">إجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tabContents.map((content) => (
                          <TableRow key={content.id}>
                            <TableCell className="font-medium flex items-center gap-2">
                              {getTypeIcon(content.type)}
                              {content.title}
                            </TableCell>
                            <TableCell>{getSubjectName(content.subject_id)}</TableCell>
                            <TableCell>
                              {tab === "videos" ? content.duration || "-" : content.page_count || "-"}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => handleDelete(content)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Dialog الرفع */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>رفع محتوى جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>نوع المحتوى</Label>
              <Select value={contentType} onValueChange={(v: any) => setContentType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">فيديو</SelectItem>
                  <SelectItem value="book">كتاب PDF</SelectItem>
                  <SelectItem value="exam">امتحان</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>العنوان *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="عنوان المحتوى"
              />
            </div>

            <div>
              <Label>الوصف</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="وصف مختصر..."
                rows={2}
              />
            </div>

            <div>
              <Label>المادة *</Label>
              <Select
                value={formData.subjectId}
                onValueChange={(v) => setFormData({ ...formData, subjectId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر المادة" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id}>
                      {subject.name} - {subject.stage} {subject.grade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {contentType === "video" ? (
              <div>
                <Label>المدة</Label>
                <Input
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  placeholder="مثال: 45:30"
                />
              </div>
            ) : (
              <div>
                <Label>عدد الصفحات</Label>
                <Input
                  type="number"
                  value={formData.pageCount}
                  onChange={(e) => setFormData({ ...formData, pageCount: e.target.value })}
                  placeholder="عدد الصفحات"
                />
              </div>
            )}

            <div>
              <Label>الملف *</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept={contentType === "video" ? "video/*" : ".pdf"}
                onChange={handleFileChange}
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground mt-1">
                  تم اختيار: {selectedFile.name}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              إلغاء
            </Button>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              رفع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContentPage;
