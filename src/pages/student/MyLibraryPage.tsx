import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/student/StudentLayout";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { BookOpen, Loader2 } from "lucide-react";
import { resolveBunnyStorageUrl } from "@/lib/bunnyStorage";
import StoredImage from "@/components/common/StoredImage";
import {
  educationMatchesBook,
  fetchLibraryTaxonomy,
  libraryGradeCodeFromProfile,
  libraryStageCodeFromProfile,
  trackMatchesStudent,
  type LibraryGradeRow,
  type LibrarySectionRow,
  type LibraryStageRow,
  type LibraryTrackRow,
} from "@/lib/libraryTaxonomy";

interface LibraryBook {
  id: string;
  title: string;
  cover_url: string | null;
  pdf_path: string | null;
  page_count: number | null;
  subject_id: string | null;
  subject_name_ar: string | null;
  education_type: string;
  stage_id: string | null;
  grade_id: string | null;
  section_id: string | null;
  track_id: string | null;
  created_at: string;
}

export default function MyLibraryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentContext, setStudentContext] = useState<{ education_type?: string | null; stage?: string | null; grade?: string | null; section?: string | null } | null>(null);

  const fetchBooks = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // RLS enforces stage/grade/section/track visibility. This client-side
      // filter keeps the request narrow and uses the real profile primary key.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("education_type,stage,grade,section")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      const student = (profile || {}) as { education_type?: string | null; stage?: string | null; grade?: string | null; section?: string | null };
      setStudentContext(student);

      let q = supabase
        .from("library_books")
        .select("id,title,cover_url,pdf_path,page_count,subject_id,subject_name_ar,education_type,stage_id,grade_id,section_id,track_id,created_at")
        .eq("status", "ready")
        .eq("access_tier", "free")
        .order("subject_name_ar", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (student.education_type && (student.education_type === "عام" || student.education_type === "أزهر")) {
        q = q.in("education_type", [student.education_type, "both"]);
      }

      const [{ data, error }, taxonomy] = await Promise.all([q, fetchLibraryTaxonomy()]);
      if (error) throw error;
      const stageById = new Map(taxonomy.stages.map((row: LibraryStageRow) => [row.id, row]));
      const gradeById = new Map(taxonomy.grades.map((row: LibraryGradeRow) => [row.id, row]));
      const sectionById = new Map(taxonomy.sections.map((row: LibrarySectionRow) => [row.id, row]));
      const trackById = new Map(taxonomy.tracks.map((row: LibraryTrackRow) => [row.id, row]));
      const studentStageCode = libraryStageCodeFromProfile(student.stage);
      const studentGradeCode = libraryGradeCodeFromProfile(student.stage, student.grade);

      const scopedBooks = ((data as LibraryBook[]) || []).filter((book) => {
        if (!educationMatchesBook(book.education_type, student.education_type)) return false;
        const bookStageCode = book.stage_id ? stageById.get(book.stage_id)?.code : null;
        if (bookStageCode && studentStageCode && bookStageCode !== studentStageCode) return false;
        const bookGradeCode = book.grade_id ? gradeById.get(book.grade_id)?.code : null;
        if (bookGradeCode && studentGradeCode && bookGradeCode !== studentGradeCode) return false;
        const bookSectionCode = book.section_id ? sectionById.get(book.section_id)?.code : null;
        if (bookSectionCode && bookSectionCode !== "shared") {
          if (student.education_type === "عام" && bookSectionCode !== "general") return false;
          if (student.education_type === "أزهر" && bookSectionCode !== "azhar") return false;
        }
        const bookTrackCode = book.track_id ? trackById.get(book.track_id)?.code : null;
        return trackMatchesStudent(bookTrackCode, student.section);
      });
      setBooks(scopedBooks);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "تعذر تحميل المكتبة");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void fetchBooks(); }, [fetchBooks]);

  const grouped = useMemo(() => {
    const map = new Map<string, LibraryBook[]>();
    for (const b of books) {
      const key = b.subject_name_ar || "بدون مادة";
      const arr = map.get(key) || [];
      arr.push(b);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [books]);

  const openBook = (b: LibraryBook) => navigate(`/my-library/book/${b.id}`);

  const getSavedPage = (bookId: string) => {
    try {
      const saved = localStorage.getItem(`lib_progress_${bookId}`);
      return saved ? parseInt(saved, 10) : null;
    } catch { return null; }
  };

  return (
    <StudentLayout title="مكتبتي">
      <div className="mx-auto max-w-5xl space-y-5 p-3 lg:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : books.length === 0 ? (
          <div className="py-14 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-base font-bold text-foreground">لا توجد كتب في مكتبتك بعد</h3>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {studentContext?.stage && studentContext?.grade
                ? "لا توجد كتب منشورة لهذا الصف حاليًا."
                : "أكمل بيانات المرحلة والصف أولًا لعرض الكتب المناسبة."}
            </p>
          </div>
        ) : (
          grouped.map(([subject, list], idx) => (
            <div key={subject} className="space-y-3">
              {/* Subject divider */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-sm font-extrabold text-foreground px-2">{subject}</span>
                <div className="h-px flex-1 bg-border/50" />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {list.map((book, index) => {
                  const savedPage = getSavedPage(book.id);
                  return (
                    <motion.div
                      key={book.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: (idx * 0.05) + (index * 0.03) }}
                      className="group"
                    >
                      <button
                        type="button"
                        onClick={() => openBook(book)}
                        className="relative w-full text-right"
                      >
                        <div className="relative mx-auto" style={{ perspective: "600px" }}>
                          <div
                            className="relative overflow-hidden rounded-lg shadow-lg transition-all duration-300 group-hover:shadow-xl group-hover:-translate-y-1"
                            style={{ aspectRatio: "3/4", transformStyle: "preserve-3d" }}
                          >
                            <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/20 to-transparent z-10 pointer-events-none" />
                            {book.cover_url ? (
                              <StoredImage source={book.cover_url} alt={book.title} className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/15 via-accent/40 to-primary/10 p-3">
                                <BookOpen className="h-8 w-8 text-primary/60" />
                                <p className="line-clamp-3 text-[11px] font-bold text-foreground/80 text-center leading-4">
                                  {book.title}
                                </p>
                              </div>
                            )}
                            {book.page_count && (
                              <div className="absolute top-1.5 right-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[9px] font-bold text-foreground shadow-sm backdrop-blur-sm">
                                {book.page_count} صفحة
                              </div>
                            )}
                            {savedPage && savedPage > 1 && (
                              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10">
                                <div
                                  className="h-full bg-primary rounded-full"
                                  style={{ width: `${Math.min(100, (savedPage / (book.page_count || savedPage)) * 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
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
          ))
        )}
      </div>
    </StudentLayout>
  );
}
