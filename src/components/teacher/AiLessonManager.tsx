import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { BookOpen, FileImage, Loader2, Plus, Trash2, Upload, FileUp } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Lesson = {
  id: string;
  title: string;
  description: string | null;
  source_pdf_url: string | null;
  created_at: string;
};

type LessonPage = {
  id: string;
  page_number: number;
  title: string | null;
  image_url: string;
  notes: string | null;
};

interface AiLessonManagerProps {
  subjectId: string;
  groupId: string;
  subSubjectId?: string;
  subSubjectName?: string;
  userId: string;
}

export default function AiLessonManager({ subjectId, groupId, subSubjectId, subSubjectName, userId }: AiLessonManagerProps) {
  const [loading, setLoading] = useState(true);
  const [savingLesson, setSavingLesson] = useState(false);
  const [uploadingPage, setUploadingPage] = useState(false);
  const [pdfConverting, setPdfConverting] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [pages, setPages] = useState<LessonPage[]>([]);

  const [newLessonTitle, setNewLessonTitle] = useState("");
  const [newLessonDesc, setNewLessonDesc] = useState("");

  const [newPageNumber, setNewPageNumber] = useState("1");
  const [newPageTitle, setNewPageTitle] = useState("");
  const [newPageNotes, setNewPageNotes] = useState("");

  const selectedLesson = useMemo(
    () => lessons.find((l) => l.id === selectedLessonId) || null,
    [lessons, selectedLessonId]
  );

  const loadLessons = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("ai_lessons")
        .select("id, title, description, source_pdf_url, created_at")
        .eq("subject_id", subjectId)
        .eq("group_id", groupId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (subSubjectId) query = query.eq("sub_subject_id", subSubjectId);
      const { data, error } = await query;
      if (error) throw error;

      const lessonRows = (data || []) as Lesson[];
      setLessons(lessonRows);

      if (lessonRows.length > 0) {
        setSelectedLessonId((prev) => prev && lessonRows.some((l) => l.id === prev) ? prev : lessonRows[0].id);
      } else {
        setSelectedLessonId(null);
        setPages([]);
      }
    } catch (e) {
      console.error(e);
      toast.error("فشل تحميل دروس المساعد الذكي");
    } finally {
      setLoading(false);
    }
  };

  const loadPages = async (lessonId: string) => {
    try {
      const { data, error } = await supabase
        .from("ai_lesson_pages")
        .select("id, page_number, title, image_url, notes")
        .eq("lesson_id", lessonId)
        .order("page_number", { ascending: true });
      if (error) throw error;
      setPages((data || []) as LessonPage[]);
    } catch (e) {
      console.error(e);
      toast.error("فشل تحميل صفحات الدرس");
    }
  };

  useEffect(() => {
    if (!subjectId || !groupId) return;
    loadLessons();
  }, [subjectId, groupId, subSubjectId]);

  useEffect(() => {
    if (!selectedLessonId) {
      setPages([]);
      return;
    }
    loadPages(selectedLessonId);
  }, [selectedLessonId]);

  const handleCreateLesson = async () => {
    const title = newLessonTitle.trim();
    if (!title) return toast.error("اكتب عنوان الدرس أولاً");

    setSavingLesson(true);
    try {
      const { error } = await supabase.from("ai_lessons").insert({
        subject_id: subjectId,
        group_id: groupId,
        sub_subject_id: subSubjectId || null,
        title,
        description: newLessonDesc.trim() || null,
        created_by: userId,
      });
      if (error) throw error;

      setNewLessonTitle("");
      setNewLessonDesc("");
      toast.success("تم إنشاء درس جديد للمساعد الذكي");
      await loadLessons();
    } catch (e) {
      console.error(e);
      toast.error("فشل إنشاء الدرس");
    } finally {
      setSavingLesson(false);
    }
  };

  const handleUploadLessonPdf = async (file: File) => {
    if (!selectedLessonId) return;
    if (file.type !== "application/pdf") return toast.error("ارفع ملف PDF فقط");

    try {
      const { uploadDocument } = await import("@/lib/storage");
      const stored = await uploadDocument({
        scope: { kind: "user", id: userId },
        category: `ai-lessons/${subjectId}`,
        file,
      });
      const { error: dbError } = await supabase
        .from("ai_lessons")
        .update({ source_pdf_url: stored.url })
        .eq("id", selectedLessonId)
        .eq("created_by", userId);

      if (dbError) throw dbError;
      toast.success("تم ربط ملف PDF بالدرس");
      await loadLessons();
    } catch (e) {
      console.error(e);
      toast.error("فشل رفع PDF");
    }
  };

  const handleUploadPageImage = async (file: File, overridePageNumber?: number) => {
    if (!selectedLessonId) return toast.error("اختر درساً أولاً");
    if (!file.type.startsWith("image/")) return toast.error("ارفع صورة فقط");

    const { uploadImage } = await import("@/lib/storage");
    const stored = await uploadImage({
      scope: { kind: "user", id: userId },
      category: `lesson-pages/${subjectId}/${selectedLessonId}`,
      file,
    });
    const pageNumber = overridePageNumber ?? (Number(newPageNumber) > 0 ? Number(newPageNumber) : pages.length + 1);

    const { error: insertError } = await supabase.from("ai_lesson_pages").insert({
      lesson_id: selectedLessonId,
      page_number: pageNumber,
      title: newPageTitle.trim() || null,
      notes: newPageNotes.trim() || null,
      image_url: stored.url,
      created_by: userId,
    });

    if (insertError) throw insertError;
    return pageNumber;
  };

  const handleUploadMultipleImages = async (files: File[]) => {
    if (!selectedLessonId) return toast.error("اختر درساً أولاً");
    if (!files.length) return;

    setUploadingPage(true);
    const startNumber = Number(newPageNumber) > 0 ? Number(newPageNumber) : pages.length + 1;
    let successCount = 0;
    let failCount = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        try {
          await handleUploadPageImage(files[i], startNumber + i);
          successCount++;
        } catch (e) {
          console.error(e);
          failCount++;
        }
      }
      setNewPageTitle("");
      setNewPageNotes("");
      setNewPageNumber(String(startNumber + successCount));
      if (successCount > 0) toast.success(`تم رفع ${successCount} صفحة بنجاح${failCount ? ` (فشل ${failCount})` : ""}`);
      else toast.error("فشل رفع الصفحات");
      await loadPages(selectedLessonId);
    } finally {
      setUploadingPage(false);
    }
  };

  // Convert each PDF page to an image (client-side via pdf.js) and upload as ai_lesson_pages
  const handleConvertPdfToPages = async (file: File) => {
    if (!selectedLessonId) return toast.error("اختر درساً أولاً");
    if (file.type !== "application/pdf") return toast.error("ارفع ملف PDF فقط");

    setPdfConverting(true);
    setPdfProgress({ current: 0, total: 0 });
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const total = pdf.numPages;
      const startNumber = Number(newPageNumber) > 0 ? Number(newPageNumber) : pages.length + 1;
      let successCount = 0;

      setPdfProgress({ current: 0, total });

      for (let i = 1; i <= total; i++) {
        try {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2 }); // sharp output
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("canvas ctx");
          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

          const blob: Blob = await new Promise((resolve, reject) =>
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.85)
          );
          const imgFile = new File([blob], `page_${i}.jpg`, { type: "image/jpeg" });
          await handleUploadPageImage(imgFile, startNumber + (i - 1));
          successCount++;
        } catch (err) {
          console.error("page convert/upload failed", i, err);
        }
        setPdfProgress({ current: i, total });
      }

      setNewPageTitle("");
      setNewPageNotes("");
      setNewPageNumber(String(startNumber + successCount));
      if (successCount > 0) {
        toast.success(`تم تحويل ورفع ${successCount} صفحة من ${total}`);
      } else {
        toast.error("فشل تحويل صفحات الـ PDF");
      }
      await loadPages(selectedLessonId);
    } catch (e) {
      console.error(e);
      toast.error("فشل قراءة ملف PDF");
    } finally {
      setPdfConverting(false);
      setPdfProgress(null);
    }
  };

  const handleDeletePage = async (page: LessonPage) => {
    if (!confirm("حذف هذه الصفحة؟")) return;
    try {
      const { error } = await supabase.from("ai_lesson_pages").delete().eq("id", page.id).eq("created_by", userId);
      if (error) throw error;
      toast.success("تم حذف الصفحة");
      if (selectedLessonId) await loadPages(selectedLessonId);
    } catch (e) {
      console.error(e);
      toast.error("فشل حذف الصفحة");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">دروس المساعد الذكي {subSubjectName ? `- ${subSubjectName}` : ""}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={newLessonTitle} onChange={(e) => setNewLessonTitle(e.target.value)} placeholder="عنوان الدرس" />
          <Textarea value={newLessonDesc} onChange={(e) => setNewLessonDesc(e.target.value)} placeholder="ملخص سريع للدرس (اختياري)" className="min-h-[90px]" />
          <Button onClick={handleCreateLesson} disabled={savingLesson} className="w-full gap-2">
            {savingLesson ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            إضافة درس جديد
          </Button>

          <ScrollArea className="h-[360px] border rounded-md p-2">
            <div className="space-y-2">
              {loading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : lessons.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">لا توجد دروس بعد</p>
              ) : (
                lessons.map((lesson) => (
                  <button
                    key={lesson.id}
                    onClick={() => setSelectedLessonId(lesson.id)}
                    className={`w-full text-right p-3 rounded-md border transition-colors ${selectedLessonId === lesson.id ? "bg-primary/10 border-primary/30" : "hover:bg-accent"}`}
                  >
                    <p className="font-medium text-sm">{lesson.title}</p>
                    {lesson.source_pdf_url && <Badge variant="secondary" className="mt-2">PDF مرتبط</Badge>}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">إعداد صفحات الدرس المعروضة للطالب</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedLesson ? (
            <div className="text-center py-10 text-muted-foreground">
              <BookOpen className="h-10 w-10 mx-auto mb-2" />
              اختر درساً من اليمين لتبدأ إضافة الصفحات
            </div>
          ) : (
            <>
              <div className="p-3 rounded-md border bg-accent/30">
                <p className="font-semibold">{selectedLesson.title}</p>
                {selectedLesson.description && <p className="text-sm text-muted-foreground mt-1">{selectedLesson.description}</p>}
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <Input value={newPageNumber} onChange={(e) => setNewPageNumber(e.target.value)} placeholder="رقم الصفحة" />
                <Input value={newPageTitle} onChange={(e) => setNewPageTitle(e.target.value)} placeholder="عنوان الصفحة (اختياري)" />
              </div>

              <Textarea value={newPageNotes} onChange={(e) => setNewPageNotes(e.target.value)} placeholder="ملاحظات تساعد المساعد في الشرح (اختياري)" className="min-h-[90px]" />

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "application/pdf";
                    input.onchange = (e) => {
                      const f = (e.target as HTMLInputElement).files?.[0];
                      if (f) handleUploadLessonPdf(f);
                    };
                    input.click();
                  }}
                >
                  <Upload className="h-4 w-4" />
                  رفع PDF للدرس
                </Button>

                <Button
                  className="gap-2"
                  disabled={uploadingPage}
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*";
                    input.multiple = true;
                    input.onchange = (e) => {
                      const files = Array.from((e.target as HTMLInputElement).files || []);
                      if (files.length) void handleUploadMultipleImages(files);
                    };
                    input.click();
                  }}
                >
                  {uploadingPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />}
                  إضافة صور صفحات (متعدد)
                </Button>

                <Button
                  variant="secondary"
                  className="gap-2"
                  disabled={pdfConverting}
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "application/pdf";
                    input.onchange = (e) => {
                      const f = (e.target as HTMLInputElement).files?.[0];
                      if (f) void handleConvertPdfToPages(f);
                    };
                    input.click();
                  }}
                >
                  {pdfConverting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                  تحويل PDF تلقائياً لصفحات
                </Button>
              </div>

              {pdfConverting && pdfProgress && (
                <div className="rounded-md border p-3 space-y-2 bg-accent/30">
                  <div className="flex justify-between text-xs">
                    <span>جاري تحويل ورفع الصفحات...</span>
                    <span className="font-bold">{pdfProgress.current} / {pdfProgress.total}</span>
                  </div>
                  <Progress value={pdfProgress.total > 0 ? (pdfProgress.current / pdfProgress.total) * 100 : 0} className="h-2" />
                </div>
              )}

              <ScrollArea className="h-[280px] border rounded-md p-2">
                <div className="space-y-2">
                  {pages.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">لا توجد صفحات بعد</p>
                  ) : (
                    pages.map((page) => (
                      <div key={page.id} className="p-2 rounded-md border flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">صفحة {page.page_number}{page.title ? ` - ${page.title}` : ""}</p>
                          {page.notes && <p className="text-xs text-muted-foreground truncate">{page.notes}</p>}
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => handleDeletePage(page)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
