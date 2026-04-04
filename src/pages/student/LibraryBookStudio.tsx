import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getStudentLibrarySignedUrl } from "@/lib/studentLibrary";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Loader2,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type LibraryBook = {
  id: string;
  title: string;
  file_url: string;
  page_count: number | null;
  created_at: string;
};

export default function LibraryBookStudio() {
  const navigate = useNavigate();
  const { bookId } = useParams();
  const { user } = useAuth();
  const pdfRef = useRef<any>(null);
  const spokenUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastExplainedPageRef = useRef<number | null>(null);
  const narrationRef = useRef<HTMLDivElement>(null);

  const [book, setBook] = useState<LibraryBook | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingBook, setLoadingBook] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [renderingPage, setRenderingPage] = useState(false);
  const [selectedPage, setSelectedPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null);
  const [pdfReady, setPdfReady] = useState(false);

  const [narrationText, setNarrationText] = useState("");
  const [sending, setSending] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  // ── Speech ──
  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    spokenUtteranceRef.current = null;
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      stopSpeaking();

      const voices = window.speechSynthesis.getVoices();
      const voice =
        voices.find((v) => v.lang === "ar-SA") ||
        voices.find((v) => v.lang.startsWith("ar")) ||
        null;

      const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_`>-]/g, " "));
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = "ar-SA";
      }
      utterance.rate = playbackSpeed;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      spokenUtteranceRef.current = utterance;
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [stopSpeaking, playbackSpeed]
  );

  // ── Fetch book ──
  const fetchBook = useCallback(async () => {
    if (!user || !bookId) return;
    setLoadingBook(true);
    setLoadProgress(0);

    const progressInterval = setInterval(() => {
      setLoadProgress((p) => (p >= 90 ? p : p + Math.random() * 18));
    }, 300);

    try {
      const { data, error } = await supabase
        .from("content")
        .select("id, title, file_url, page_count, created_at")
        .eq("id", bookId)
        .eq("uploaded_by", user.id)
        .eq("type", "student_library")
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("book_not_found");

      setLoadProgress(70);
      const resolvedUrl = await getStudentLibrarySignedUrl(data.file_url);
      setBook(data as LibraryBook);
      setSignedUrl(resolvedUrl);
      setLoadProgress(100);
    } catch (error: any) {
      console.error("Library book fetch error:", error);
      toast.error("تعذر فتح هذا الكتاب");
      navigate("/my-library");
    } finally {
      clearInterval(progressInterval);
      setTimeout(() => setLoadingBook(false), 400);
    }
  }, [bookId, navigate, user]);

  // ── Load PDF ──
  const loadPdf = useCallback(async () => {
    if (!signedUrl) return;
    try {
      setPdfReady(false);
      const pdf = await pdfjsLib.getDocument({ url: signedUrl, useWorkerFetch: false, isEvalSupported: false }).promise;
      pdfRef.current = pdf;
      setTotalPages(pdf.numPages);
      setPdfReady(true);
      setSelectedPage((c) => Math.min(Math.max(c, 1), pdf.numPages));
    } catch {
      toast.error("فشل فتح ملف الكتاب");
    }
  }, [signedUrl]);

  // ── Render page ──
  const renderPage = useCallback(async (pageNumber: number) => {
    if (!pdfRef.current) return;
    setRenderingPage(true);
    try {
      const page = await pdfRef.current.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport } as any).promise;
      setPageImageUrl(canvas.toDataURL("image/jpeg", 0.92));
    } catch {
      toast.error("تعذر عرض صفحة الكتاب");
    } finally {
      setRenderingPage(false);
    }
  }, []);

  // ── AI explain ──
  const explainPage = useCallback(
    async (pageNum: number) => {
      if (!pageImageUrl || sending) return;
      setSending(true);
      setNarrationText("");

      try {
        const { data, error } = await supabase.functions.invoke("ai-chat", {
          body: {
            messages: [{ role: "user", content: "اشرح هذه الصفحة للطالب شرحاً بسيطاً وواضحاً باللهجة المصرية." }],
            subjectName: "مكتبتي الشخصية",
            lessonTitle: book?.title || "كتاب الطالب",
            pageNumber: pageNum,
            pageTitle: `صفحة ${pageNum}`,
            pageImageUrl,
            isLessonStudio: true,
          },
        });
        if (error) throw error;
        const txt = (data as any)?.response || "عذراً، لم أتمكن من شرح الصفحة الآن.";
        setNarrationText(txt);
        speak(txt);
      } catch {
        setNarrationText("حدث خطأ أثناء شرح هذه الصفحة.");
      } finally {
        setSending(false);
      }
    },
    [book?.title, pageImageUrl, sending, speak]
  );

  useEffect(() => { if (user && bookId) void fetchBook(); }, [bookId, fetchBook, user]);
  useEffect(() => { if (signedUrl) void loadPdf(); }, [loadPdf, signedUrl]);
  useEffect(() => { if (totalPages > 0) void renderPage(selectedPage); }, [renderPage, selectedPage, totalPages]);
  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  // Auto-explain on page change
  useEffect(() => {
    if (!pageImageUrl || renderingPage || selectedPage === lastExplainedPageRef.current) return;
    lastExplainedPageRef.current = selectedPage;
    void explainPage(selectedPage);
  }, [pageImageUrl, renderingPage, selectedPage, explainPage]);

  // Scroll narration to top when text changes
  useEffect(() => {
    narrationRef.current?.scrollTo({ top: 0 });
  }, [narrationText]);

  const goPage = (dir: number) => {
    setSelectedPage((p) => {
      const next = p + dir;
      if (next < 1 || next > totalPages) return p;
      return next;
    });
  };

  const togglePlayPause = () => {
    if (isSpeaking) stopSpeaking();
    else if (narrationText) speak(narrationText);
  };

  const cycleSpeed = () => {
    setPlaybackSpeed((s) => {
      const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
      const idx = speeds.indexOf(s);
      return speeds[(idx + 1) % speeds.length];
    });
  };

  // ── Loading screen (Nagwa style) ──
  if (loadingBook) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background" dir="rtl">
        <button
          onClick={() => navigate("/my-library")}
          className="absolute top-6 right-6 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <X className="h-5 w-5" />
        </button>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <span className="text-2xl font-extrabold text-[hsl(var(--primary))]">
            {Math.round(loadProgress)}%
          </span>
          <div className="h-1.5 w-64 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-[hsl(213,80%,45%)]"
              animate={{ width: `${loadProgress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </motion.div>
      </div>
    );
  }

  if (!book) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-background" dir="rtl">
      {/* ── Top section: PDF page content ── */}
      <div className="flex-1 overflow-y-auto relative">
        {/* Page number badge + Close button */}
        <div className="sticky top-0 z-10 flex items-center justify-end gap-3 p-3">
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => navigate("/my-library")}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-muted/80 text-muted-foreground shadow-sm backdrop-blur-sm"
            >
              <X className="h-5 w-5" />
            </button>
            <span className="flex h-9 min-w-9 items-center justify-center rounded-full border border-border bg-background px-2 text-sm font-bold text-foreground shadow-sm">
              {selectedPage}
            </span>
          </div>
        </div>

        {/* PDF page image */}
        <div className="px-2 pb-4">
          {renderingPage || !pageImageUrl || !pdfReady ? (
            <div className="flex min-h-[60vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <motion.img
              key={selectedPage}
              src={pageImageUrl}
              alt={`${book.title} - صفحة ${selectedPage}`}
              className="mx-auto w-full max-w-2xl rounded-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            />
          )}
        </div>
      </div>

      {/* ── Bottom: Narration text + Audio controls ── */}
      <div className="shrink-0 border-t border-border bg-background">
        {/* Narration area */}
        <div
          ref={narrationRef}
          className="max-h-[30vh] overflow-y-auto border-b border-border/50"
        >
          {sending ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : narrationText ? (
            <div className="px-5 py-4">
              <p className="text-base leading-8 text-foreground" dir="rtl">
                {narrationText}
              </p>
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              اختر صفحة للاستماع للشرح
            </div>
          )}
        </div>

        {/* Audio controls bar - Nagwa style */}
        <div className="safe-area-bottom flex items-center justify-around px-4 py-3">
          {/* Speed */}
          <button
            onClick={cycleSpeed}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground transition-colors active:bg-muted/70"
          >
            {playbackSpeed}x
          </button>

          {/* Previous page */}
          <button
            onClick={() => goPage(-1)}
            disabled={selectedPage <= 1}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-foreground transition-colors disabled:opacity-30 active:bg-muted/70"
          >
            <SkipBack className="h-6 w-6" fill="currentColor" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={togglePlayPause}
            disabled={!narrationText && !sending}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-foreground transition-colors disabled:opacity-30 active:bg-muted/70"
          >
            {isSpeaking ? (
              <Pause className="h-8 w-8" fill="currentColor" />
            ) : (
              <Play className="h-8 w-8 translate-x-0.5" fill="currentColor" />
            )}
          </button>

          {/* Next page */}
          <button
            onClick={() => goPage(1)}
            disabled={selectedPage >= totalPages}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-foreground transition-colors disabled:opacity-30 active:bg-muted/70"
          >
            <SkipForward className="h-6 w-6" fill="currentColor" />
          </button>

          {/* Close */}
          <button
            onClick={() => navigate("/my-library")}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-foreground transition-colors active:bg-muted/70"
          >
            <X className="h-6 w-6" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
