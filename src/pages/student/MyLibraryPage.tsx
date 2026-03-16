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
import {
  Upload, BookOpen, Loader2, Trash2, Bot, Sparkles
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface LibraryBook {
  id: string;
  title: string;
  file_url: string;
  page_count: number;
  created_at: string;
  coverUrl?: string;
}

export default function MyLibraryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [covers, setCovers] = useState<Record<string, string>>({});

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
    setBooks((data as LibraryBook[]) || []);
    setLoading(false);
  };

  // Generate cover from PDF first page
  const generateCover = useCallback(async (bookId: string, fileUrl: string) => {
    try {
      const pdf = await pdfjsLib.getDocument(fileUrl).promise;
      const page = await pdf.getPage(1);
      const scale = 1.5;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const coverDataUrl = canvas.toDataURL("image/jpeg", 0.8);
      setCovers(prev => ({ ...prev, [bookId]: coverDataUrl }));
    } catch {
      // ignore cover generation failure
    }
  }, []);

  useEffect(() => {
    books.forEach(book => {
      if (!covers[book.id] && book.file_url) {
        generateCover(book.id, book.file_url);
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
    try {
      const safeName = file.name
        .replace(/[^\w.\-]/g, '_')
        .replace(/__+/g, '_')
        .replace(/^_|_$/g, '') || 'book';
      const path = `library/${user.id}/${Date.now()}_${safeName}`;

      // Upload to student-library bucket (has correct RLS policies)
      const { error: uploadErr } = await supabase.storage
        .from("student-library")
        .upload(path, file, { cacheControl: "3600" });
      if (uploadErr) throw uploadErr;

      // Since bucket is private, create a signed URL (1 year)
      const { data: signedData, error: signedErr } = await supabase.storage
        .from("student-library")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signedErr) throw signedErr;

      const fileUrl = signedData.signedUrl;

      // Get page count using chunked processing
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const pageCount = pdf.numPages;

      const { error: insertErr } = await supabase.from("content").insert({
        title: file.name.replace(/\.pdf$/i, ""),
        file_url: fileUrl,
        type: "student_library",
        uploaded_by: user.id,
        page_count: pageCount,
        is_active: true,
        is_paid: false,
      });
      if (insertErr) throw insertErr;

      toast.success(`تم رفع "${file.name}" بنجاح (${pageCount} صفحة)`);
      fetchBooks();
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
    await supabase.from("content").delete().eq("id", book.id);
    toast.success("تم الحذف");
    setBooks(books.filter(b => b.id !== book.id));
  };

  const openBookStudio = (book: LibraryBook) => {
    const url = `/subject-ai-chat?library_book=${book.id}&title=${encodeURIComponent(book.title)}`;
    navigate(url);
  };

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

        {/* Bookshelf */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-3">📚</div>
            <p className="text-muted-foreground font-medium">لا توجد كتب في مكتبتك</p>
            <p className="text-xs text-muted-foreground mt-1">ارفع كتاب PDF لبدء التعلم مع المساعد الذكي</p>
          </div>
        ) : (
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-secondary" />
              كتبي ({books.length})
            </h3>
            {/* Bookshelf grid - books side by side */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {books.map((book, i) => (
                <motion.div
                  key={book.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="group relative"
                >
                  <div
                    className="relative overflow-hidden rounded-xl border border-border/50 bg-card shadow-md hover:shadow-xl transition-all cursor-pointer"
                    onClick={() => openBookStudio(book)}
                  >
                    {/* Book cover */}
                    <div className="aspect-[3/4] overflow-hidden bg-gradient-to-br from-amber-50 to-orange-50 relative">
                      {covers[book.id] ? (
                        <img
                          src={covers[book.id]}
                          alt={book.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center p-2">
                            <div className="text-4xl mb-2">📖</div>
                            <p className="text-[10px] text-muted-foreground font-medium line-clamp-2">{book.title}</p>
                          </div>
                        </div>
                      )}
                      {/* Overlay on hover */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="bg-white/90 rounded-full p-2.5 shadow-lg">
                          <Bot className="h-5 w-5 text-violet-600" />
                        </div>
                      </div>
                    </div>
                    {/* Book info */}
                    <div className="p-2.5">
                      <p className="text-xs font-bold truncate">{book.title}</p>
                      <div className="flex items-center justify-between mt-1">
                        <Badge variant="secondary" className="text-[8px] px-1.5 py-0">
                          {book.page_count} صفحة
                        </Badge>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(book); }}
                          className="p-1 rounded-md hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="h-3 w-3 text-destructive/60" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        <div className="h-16 lg:hidden" />
      </div>
    </StudentLayout>
  );
}
