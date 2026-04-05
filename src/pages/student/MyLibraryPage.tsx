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
      const viewport = page.getViewport({ scale: 0.8 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport } as any).promise;
      const coverDataUrl = canvas.toDataURL("image/jpeg", 0.82);
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

    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 18;
      });
    }, 400);

    try {
      // Skip page count detection for large files to speed up upload
      if (file.size < 50 * 1024 * 1024) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
          pageCount = pdf.numPages;
        } catch (pdfError) {
          console.warn("PDF page count detection failed:", pdfError);
        }
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
      }, 600);
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

  const getSavedPage = (bookId: string) => {
    try {
      const saved = localStorage.getItem(`lib_progress_${bookId}`);
      return saved ? parseInt(saved, 10) : null;
    } catch { return null; }
  };

  return (
    <StudentLayout title="مكتبتي">
      <div className="mx-auto max-w-5xl space-y-4 p-3 lg:p-6">

        {/* Upload area */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="rounded-2xl border-[2px] border-dashed border-primary/30 bg-gradient-to-b from-primary/[0.06] to-primary/[0.02] p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2.5">
              <Sparkles className="h-4.5 w-4.5 text-primary" />
              <h2 className="text-sm font-extrabold text-foreground">اجعل كتبك تفاعلية!</h2>
            </div>
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="h-11 w-full max-w-sm gap-2 rounded-xl text-sm font-bold shadow-md shadow-primary/15"
              size="lg"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "جاري الرفع..." : "رفع ملف PDF"}
            </Button>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleUpload} />
          </div>
        </motion.div>

        {/* Upload progress */}
        <AnimatePresence>
          {uploading && (
            <motion.div
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -6, height: 0 }}
              className="overflow-hidden rounded-xl border border-primary/20 bg-primary/[0.05] p-3"
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setUploading(false); setUploadProgress(0); }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xs font-bold text-foreground truncate">{uploadFileName}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                    <span>حجم الملف: {uploadFileSize}</span>
                    <span>{Math.round(uploadProgress)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-primary/15 overflow-hidden">
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
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : books.length === 0 ? (
          <div className="py-14 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-base font-bold text-foreground">لا توجد كتب في المكتبة</h3>
            <p className="mt-1.5 text-xs text-muted-foreground">ابدأ برفع أول كتاب ليظهر هنا.</p>
          </div>
        ) : (
          /* Books shelf */
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/50" />
              <span className="text-sm font-extrabold text-foreground">كتبي</span>
              <div className="h-px flex-1 bg-border/50" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {books.map((book, index) => {
                const savedPage = getSavedPage(book.id);
                return (
                  <motion.div
                    key={book.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="group"
                  >
                    <button
                      type="button"
                      onClick={() => openBookStudio(book)}
                      className="relative w-full text-right"
                    >
                      {/* Book cover with 3D spine effect */}
                      <div className="relative mx-auto" style={{ perspective: "600px" }}>
                        <div
                          className="relative overflow-hidden rounded-lg shadow-lg transition-all duration-300 group-hover:shadow-xl group-hover:-translate-y-1"
                          style={{
                            aspectRatio: "3/4",
                            transformStyle: "preserve-3d",
                          }}
                        >
                          {/* Spine shadow on left */}
                          <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/20 to-transparent z-10 pointer-events-none" />

                          {covers[book.id] ? (
                            <img
                              src={covers[book.id]}
                              alt={book.title}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/15 via-accent/40 to-primary/10 p-3">
                              <BookOpen className="h-8 w-8 text-primary/60" />
                              <p className="line-clamp-3 text-[11px] font-bold text-foreground/80 text-center leading-4">
                                {book.title}
                              </p>
                            </div>
                          )}

                          {/* Page count badge */}
                          {book.page_count && (
                            <div className="absolute top-1.5 right-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[9px] font-bold text-foreground shadow-sm backdrop-blur-sm">
                              {book.page_count} صفحة
                            </div>
                          )}

                          {/* Reading progress indicator */}
                          {savedPage && savedPage > 1 && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${Math.min(100, (savedPage / (book.page_count || savedPage)) * 100)}%` }}
                              />
                            </div>
                          )}

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDelete(book);
                            }}
                            className="absolute top-1.5 left-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-background/80 text-destructive opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
                            aria-label={`حذف ${book.title}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Title under the book */}
                      <div className="mt-2 px-0.5">
                        <p className="truncate text-[11px] font-bold text-foreground leading-4">{book.title}</p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          {new Date(book.created_at).toLocaleDateString("ar-EG")}
                          {savedPage && savedPage > 1 && (
                            <span className="text-primary mr-1">• صفحة {savedPage}</span>
                          )}
                        </p>
                      </div>
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
