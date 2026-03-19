import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/student/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Upload, BookOpen, Loader2, Trash2, Bot, Sparkles } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  STUDENT_LIBRARY_BUCKET,
  buildStudentLibraryPath,
  extractStudentLibraryPath,
  getStudentLibrarySignedUrl,
} from "@/lib/studentLibrary";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface LibraryBook {
  id: string;
  title: string;
  file_url: string;
  page_count: number | null;
  created_at: string;
}

export default function MyLibraryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [covers, setCovers] = useState<Record<string, string>>({});

  const fetchBooks = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("content")
        .select("id, title, file_url, page_count, created_at")
        .eq("uploaded_by", user.id)
        .eq("type", "student_library")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const enrichedBooks = await Promise.all(
        ((data as LibraryBook[]) || []).map(async (book) => ({
          ...book,
          file_url: await getStudentLibrarySignedUrl(book.file_url),
        }))
      );

      setBooks(enrichedBooks);
    } catch (error: any) {
      console.error("Fetch library error:", error);
      toast.error(error?.message || "تعذر تحميل مكتبتك");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchBooks();
  }, [user, fetchBooks]);

  const generateCover = useCallback(async (bookId: string, fileUrl: string) => {
    try {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error("failed_to_fetch_pdf");
      const pdfData = await response.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.1 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: context, viewport } as any).promise;
      const coverDataUrl = canvas.toDataURL("image/jpeg", 0.86);
      setCovers((prev) => ({ ...prev, [bookId]: coverDataUrl }));
    } catch (error) {
      console.warn("Cover generation failed:", error);
    }
  }, []);

  useEffect(() => {
    books.forEach((book) => {
      if (book.file_url && !covers[book.id]) {
        void generateCover(book.id, book.file_url);
      }
    });
  }, [books, covers, generateCover]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("يرجى رفع ملف PDF فقط");
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      toast.error("حجم الملف يجب أن يكون أقل من 500 ميجابايت");
      return;
    }

    setUploading(true);
    const storagePath = buildStudentLibraryPath(user.id, file.name);
    let pageCount: number | null = null;

    try {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        pageCount = pdf.numPages;
      } catch (pdfError) {
        console.warn("PDF page count detection failed:", pdfError);
      }

      const { error: uploadError } = await supabase.storage
        .from(STUDENT_LIBRARY_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: "application/pdf",
        });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("content").insert({
        title: file.name.replace(/\.pdf$/i, ""),
        file_url: storagePath,
        type: "student_library",
        uploaded_by: user.id,
        page_count: pageCount,
        is_active: true,
        is_paid: false,
      });

      if (insertError) {
        await supabase.storage.from(STUDENT_LIBRARY_BUCKET).remove([storagePath]);
        throw insertError;
      }

      toast.success(pageCount ? `تم رفع الكتاب بنجاح (${pageCount} صفحة)` : "تم رفع الكتاب بنجاح");
      await fetchBooks();
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error(err?.message || "فشل رفع الكتاب");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (book: LibraryBook) => {
    if (!confirm(`هل تريد حذف "${book.title}"؟`)) return;

    try {
      const storagePath = extractStudentLibraryPath(book.file_url);
      const { error: deleteDbError } = await supabase.from("content").delete().eq("id", book.id);
      if (deleteDbError) throw deleteDbError;

      if (storagePath) {
        await supabase.storage.from(STUDENT_LIBRARY_BUCKET).remove([storagePath]);
      }

      setBooks((prev) => prev.filter((b) => b.id !== book.id));
      setCovers((prev) => {
        const next = { ...prev };
        delete next[book.id];
        return next;
      });
      toast.success("تم حذف الكتاب");
    } catch (error: any) {
      console.error("Delete library error:", error);
      toast.error(error?.message || "تعذر حذف الكتاب");
    }
  };

  const openBookStudio = (book: LibraryBook) => {
    navigate(`/subject-ai-chat?library_book=${book.id}&title=${encodeURIComponent(book.title)}`);
  };

  return (
    <StudentLayout title="مكتبتي">
      <div className="mx-auto max-w-5xl space-y-5 p-4 lg:p-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="overflow-hidden border-border/60 bg-card shadow-azhari">
            <CardContent className="relative p-5">
              <div className="absolute inset-y-0 left-0 w-24 bg-accent/60 blur-3xl" />
              <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2 text-right">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-foreground">مكتبتي الشخصية</h2>
                    <p className="text-sm text-muted-foreground">
                      ارفع كتبك بصيغة PDF وستظهر كرفوف مرتبة بشكل أنيق داخل حسابك.
                    </p>
                  </div>
                </div>

                <Button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="h-12 min-w-40 gap-2 rounded-2xl"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? "جاري الرفع..." : "رفع كتاب PDF"}
                </Button>
                <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleUpload} />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : books.length === 0 ? (
          <Card className="border-dashed border-border/80 bg-card/70">
            <CardContent className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-accent text-primary">
                <BookOpen className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-foreground">لا توجد كتب في المكتبة</h3>
              <p className="mt-2 text-sm text-muted-foreground">ابدأ برفع أول كتاب ليظهر هنا بشكل رف مكتبة منظم.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Sparkles className="h-4 w-4 text-secondary" />
              كتبي ({books.length})
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {books.map((book, index) => (
                <motion.div
                  key={book.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="group"
                >
                  <button
                    type="button"
                    onClick={() => openBookStudio(book)}
                    className="w-full overflow-hidden rounded-[1.5rem] border border-border/70 bg-card text-right shadow-sm transition-all hover:-translate-y-1 hover:shadow-azhari"
                  >
                    <div className="relative aspect-[3/4] overflow-hidden bg-accent/40">
                      {covers[book.id] ? (
                        <img src={covers[book.id]} alt={book.title} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
                          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                            <BookOpen className="h-8 w-8" />
                          </div>
                          <p className="line-clamp-2 text-xs font-bold text-foreground">{book.title}</p>
                        </div>
                      )}

                      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
                        <Badge className="rounded-full border-0 bg-background/90 text-foreground shadow-sm">
                          {book.page_count ?? "--"} صفحة
                        </Badge>
                        <span className="rounded-full bg-background/85 p-2 text-primary shadow-sm transition-transform group-hover:scale-110">
                          <Bot className="h-4 w-4" />
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 p-3">
                      <p className="truncate text-sm font-black text-foreground">{book.title}</p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(book.created_at).toLocaleDateString("ar-EG")}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDelete(book);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-destructive/10 text-destructive transition-colors hover:bg-destructive/15"
                          aria-label={`حذف ${book.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
