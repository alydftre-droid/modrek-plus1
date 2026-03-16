import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/student/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, BookOpen, Loader2, FileText, Trash2, Eye, Bot,
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, X, Sparkles
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface LibraryBook {
  id: string;
  title: string;
  file_url: string;
  page_count: number;
  created_at: string;
}

export default function MyLibraryPage() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedBook, setSelectedBook] = useState<LibraryBook | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (user) fetchBooks();
  }, [user]);

  const fetchBooks = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("content")
      .select("id, title, file_url, page_count, created_at")
      .eq("uploaded_by", user.id)
      .eq("type", "student_library")
      .order("created_at", { ascending: false });
    setBooks(data || []);
    setLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.name.endsWith(".pdf")) {
      toast.error("يرجى رفع ملف PDF فقط");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("حجم الملف يجب أن يكون أقل من 20 ميجابايت");
      return;
    }

    setUploading(true);
    try {
      const path = `library/${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("books").upload(path, file);
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("books").getPublicUrl(path);

      // Get page count
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pageCount = pdf.numPages;

      const { error: insertErr } = await supabase.from("content").insert({
        title: file.name.replace(".pdf", ""),
        file_url: urlData.publicUrl,
        type: "student_library",
        uploaded_by: user.id,
        page_count: pageCount,
        is_active: true,
        is_paid: false,
      });
      if (insertErr) throw insertErr;

      toast.success(`تم رفع "${file.name}" بنجاح (${pageCount} صفحة)`);
      fetchBooks();
    } catch (err) {
      console.error(err);
      toast.error("فشل رفع الكتاب");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (book: LibraryBook) => {
    if (!confirm(`هل تريد حذف "${book.title}"؟`)) return;
    await supabase.from("content").delete().eq("id", book.id);
    toast.success("تم الحذف");
    setBooks(books.filter(b => b.id !== book.id));
    if (selectedBook?.id === book.id) setSelectedBook(null);
  };

  const openBook = async (book: LibraryBook) => {
    setSelectedBook(book);
    setLoadingPages(true);
    setCurrentPage(0);
    setZoom(1);
    setPages([]);

    try {
      const pdf = await pdfjsLib.getDocument(book.file_url).promise;
      const rendered: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const scale = 2;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        rendered.push(canvas.toDataURL("image/jpeg", 0.85));
      }
      setPages(rendered);
    } catch (err) {
      console.error(err);
      toast.error("فشل تحميل صفحات الكتاب");
    } finally {
      setLoadingPages(false);
    }
  };

  // PDF Viewer Mode
  if (selectedBook) {
    return (
      <StudentLayout title={selectedBook.title}>
        <div className="flex flex-col h-[calc(100vh-3.5rem-3.5rem)] lg:h-[calc(100vh-3.5rem)]">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 py-2 bg-card border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedBook(null)}>
                <X className="h-4 w-4" />
              </Button>
              <span className="text-xs font-medium text-muted-foreground truncate max-w-[120px]">
                {selectedBook.title}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(3, z + 0.25))}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {pages.length > 0 ? `${currentPage + 1} / ${pages.length}` : "..."}
            </Badge>
          </div>

          {/* Pages */}
          <div className="flex-1 overflow-y-auto bg-muted/50 p-2">
            {loadingPages ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">جاري تحميل الصفحات...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-w-3xl mx-auto">
                {pages.map((pageUrl, i) => (
                  <div
                    key={i}
                    className="relative bg-white rounded-lg shadow-sm overflow-hidden"
                    id={`page-${i}`}
                  >
                    <div className="absolute top-2 left-2 z-10">
                      <Badge className="bg-black/60 text-white text-[9px] border-0">
                        {i + 1}
                      </Badge>
                    </div>
                    <img
                      src={pageUrl}
                      alt={`صفحة ${i + 1}`}
                      className="w-full h-auto"
                      style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Navigation */}
          {pages.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-card border-t border-border shrink-0">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 0}
                onClick={() => {
                  const prev = Math.max(0, currentPage - 1);
                  setCurrentPage(prev);
                  document.getElementById(`page-${prev}`)?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <ChevronRight className="h-4 w-4" />
                السابق
              </Button>
              <Button
                size="sm"
                className="bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0"
                onClick={() => {
                  // Navigate to AI chat with this book context
                  const url = `/subject-ai-chat?library_book=${selectedBook.id}&title=${encodeURIComponent(selectedBook.title)}`;
                  window.location.href = url;
                }}
              >
                <Bot className="h-4 w-4" />
                اشرح لي
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === pages.length - 1}
                onClick={() => {
                  const next = Math.min(pages.length - 1, currentPage + 1);
                  setCurrentPage(next);
                  document.getElementById(`page-${next}`)?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                التالي
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout title="مكتبتي">
      <div className="p-3 max-w-2xl mx-auto space-y-4">
        {/* Upload Section */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-0 bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-700 text-white overflow-hidden relative">
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-3xl" />
            <CardContent className="p-4 relative">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-xl bg-white/20">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-bold text-base">مكتبتي الشخصية</h2>
                  <p className="text-white/70 text-xs">ارفع كتبك واستخدم المساعد الذكي لشرحها</p>
                </div>
              </div>
              <Button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Upload className="h-4 w-4 ml-2" />}
                {uploading ? "جاري الرفع..." : "رفع كتاب PDF"}
              </Button>
              <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleUpload} />
            </CardContent>
          </Card>
        </motion.div>

        {/* Books List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-16 w-16 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">لا توجد كتب في مكتبتك</p>
            <p className="text-xs text-muted-foreground mt-1">ارفع كتاب PDF لبدء التعلم</p>
          </div>
        ) : (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-secondary" />
              كتبي ({books.length})
            </h3>
            {books.map((book, i) => (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="border border-border/50 hover:shadow-md transition-all">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 shrink-0">
                        <FileText className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{book.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                            {book.page_count} صفحة
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(book.created_at).toLocaleDateString("ar-EG")}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openBook(book)}>
                          <Eye className="h-4 w-4 text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(book)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        <div className="h-16 lg:hidden" />
      </div>
    </StudentLayout>
  );
}
