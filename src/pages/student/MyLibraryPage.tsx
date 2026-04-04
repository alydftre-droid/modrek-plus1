import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/student/StudentLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, BookOpen, Loader2, Trash2, Sparkles, X, FileText } from "lucide-react";
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadFileSize, setUploadFileSize] = useState("");
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

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
    return `${(bytes / 1024).toFixed(0)}KB`;
  };

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
    setUploadProgress(0);
    setUploadFileName(file.name);
    setUploadFileSize(formatFileSize(file.size));

    const storagePath = buildStudentLibraryPath(user.id, file.name);
    let pageCount: number | null = null;

    // Simulate progress
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 500);

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

      setUploadProgress(95);

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

      setUploadProgress(100);
      toast.success(pageCount ? `تم رفع الكتاب بنجاح (${pageCount} صفحة)` : "تم رفع الكتاب بنجاح");
      await fetchBooks();
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error(err?.message || "فشل رفع الكتاب");
    } finally {
      clearInterval(progressInterval);
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
        setUploadFileName("");
      }, 800);
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
    navigate(`/my-library/book/${book.id}`);
  };

  return (
    <StudentLayout title="مكتبتي">
      <div className="mx-auto max-w-5xl space-y-5 p-4 lg:p-6">

        {/* Upload area - Nagwa style dashed border */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="rounded-2xl border-[2.5px] border-dashed border-primary/40 bg-primary/[0.04] p-5 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-base font-extrabold text-foreground">اجعل كتبك تفاعلية!</h2>
            </div>
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="h-12 w-full max-w-md gap-2 rounded-2xl text-base font-bold shadow-lg shadow-primary/20"
              size="lg"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
              {uploading ? "جاري الرفع..." : "رفع ملف PDF"}
            </Button>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleUpload} />
          </div>
        </motion.div>

        {/* Upload progress bar - Nagwa style */}
        <AnimatePresence>
          {uploading && (
            <motion.div
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              className="overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.06] p-4"
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setUploading(false);
                    setUploadProgress(0);
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <span className="text-sm font-bold text-foreground truncate">{uploadFileName}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span>حجم الملف: {uploadFileSize}</span>
                    <span>{Math.round(uploadProgress)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-primary/15 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-l from-primary to-primary/80"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : books.length === 0 ? (
          /* Empty state */
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <BookOpen className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-lg font-bold text-foreground">لا توجد كتب في المكتبة</h3>
            <p className="mt-2 text-sm text-muted-foreground">ابدأ برفع أول كتاب ليظهر هنا.</p>
          </div>
        ) : (
          /* Books grid - Nagwa style */
          <div className="space-y-4">
            {/* Category header */}
            <div className="flex items-center justify-between">
              <div className="h-px flex-1 bg-border/60" />
              <span className="px-4 text-base font-extrabold text-foreground">كتبي</span>
              <div className="h-px flex-1 bg-border/60" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {books.map((book, index) => (
                <motion.div
                  key={book.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.04 }}
                  className="group"
                >
                  <button
                    type="button"
                    onClick={() => openBookStudio(book)}
                    className="relative w-full overflow-hidden rounded-2xl border border-border/50 bg-card text-right shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10"
                  >
                    {/* Cover */}
                    <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-b from-accent/60 to-accent/30">
                      {covers[book.id] ? (
                        <img
                          src={covers[book.id]}
                          alt={book.title}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <BookOpen className="h-7 w-7" />
                          </div>
                          <p className="line-clamp-2 text-xs font-bold text-foreground">{book.title}</p>
                        </div>
                      )}

                      {/* Page count badge */}
                      {book.page_count && (
                        <div className="absolute top-2 right-2 rounded-lg bg-background/90 px-2 py-0.5 text-[10px] font-bold text-foreground shadow-sm backdrop-blur-sm">
                          {book.page_count} صفحة
                        </div>
                      )}

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDelete(book);
                        }}
                        className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/85 text-destructive opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
                        aria-label={`حذف ${book.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Title */}
                    <div className="p-2.5">
                      <p className="truncate text-xs font-bold text-foreground">{book.title}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(book.created_at).toLocaleDateString("ar-EG")}
                      </p>
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
