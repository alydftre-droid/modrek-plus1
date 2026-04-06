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
  MessageCircle,
  Send,
  Bot,
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

// ─── Reading progress helpers ───
function saveReadingProgress(bookId: string, page: number) {
  try { localStorage.setItem(`lib_progress_${bookId}`, String(page)); } catch {}
}
function loadReadingProgress(bookId: string): number {
  try {
    const v = localStorage.getItem(`lib_progress_${bookId}`);
    return v ? Math.max(1, parseInt(v, 10)) : 1;
  } catch { return 1; }
}

// ─── TTS Helper: wait for voices ───
function getArabicVoice(): Promise<SpeechSynthesisVoice | null> {
  return new Promise((resolve) => {
    const tryFind = () => {
      const voices = window.speechSynthesis.getVoices();
      const v =
        voices.find((v) => v.lang === "ar-SA") ||
        voices.find((v) => v.lang.startsWith("ar")) ||
        null;
      return v;
    };
    const found = tryFind();
    if (found) return resolve(found);
    // Wait for voices to load
    let attempts = 0;
    const interval = setInterval(() => {
      const v = tryFind();
      attempts++;
      if (v || attempts > 20) {
        clearInterval(interval);
        resolve(v);
      }
    }, 100);
    window.speechSynthesis.onvoiceschanged = () => {
      clearInterval(interval);
      resolve(tryFind());
    };
  });
}

export default function LibraryBookStudio() {
  const navigate = useNavigate();
  const { bookId } = useParams();
  const { user } = useAuth();
  const pdfRef = useRef<any>(null);
  const spokenUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const narrationRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const pagesContainerRef = useRef<HTMLDivElement>(null);

  const [book, setBook] = useState<LibraryBook | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingBook, setLoadingBook] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [selectedPage, setSelectedPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pageImages, setPageImages] = useState<Record<number, string>>({});
  const [pdfReady, setPdfReady] = useState(false);
  const [renderingPages, setRenderingPages] = useState(false);

  const [narrationText, setNarrationText] = useState("");
  const [sending, setSending] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  // Chat overlay
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [chatSending, setChatSending] = useState(false);

  // ── Preload Arabic voice ──
  useEffect(() => {
    getArabicVoice().then((v) => { voiceRef.current = v; });
  }, []);

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

      // Clean text for speech
      const cleanText = text
        .replace(/[#*_`>\\-]/g, " ")
        .replace(/\n+/g, ". ")
        .replace(/\s+/g, " ")
        .trim();

      if (!cleanText) return;

      // Split into smaller chunks for reliable Arabic speech
      const chunks = cleanText.match(/[^.!؟،]+[.!؟،]?/g) || [cleanText];
      let chunkIndex = 0;

      const speakNext = () => {
        if (chunkIndex >= chunks.length) {
          setIsSpeaking(false);
          return;
        }
        const chunk = chunks[chunkIndex].trim();
        if (!chunk) { chunkIndex++; speakNext(); return; }

        const utterance = new SpeechSynthesisUtterance(chunk);
        if (voiceRef.current) {
          utterance.voice = voiceRef.current;
          utterance.lang = voiceRef.current.lang;
        } else {
          utterance.lang = "ar-SA";
        }
        utterance.rate = playbackSpeed;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        utterance.onend = () => { chunkIndex++; speakNext(); };
        utterance.onerror = () => { chunkIndex++; speakNext(); };
        spokenUtteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      };

      setIsSpeaking(true);
      speakNext();
    },
    [stopSpeaking, playbackSpeed]
  );

  // Live speed update
  useEffect(() => {
    if (isSpeaking && narrationText) {
      speak(narrationText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackSpeed]);

  // ── Fetch book ──
  const fetchBook = useCallback(async () => {
    if (!user || !bookId) return;
    setLoadingBook(true);
    setLoadProgress(0);

    const progressInterval = setInterval(() => {
      setLoadProgress((p) => (p >= 90 ? p : p + Math.random() * 20));
    }, 250);

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

      // Restore reading progress
      const savedPage = loadReadingProgress(bookId);
      setSelectedPage(savedPage);

      setLoadProgress(100);
    } catch (error: any) {
      console.error("Library book fetch error:", error);
      toast.error("تعذر فتح هذا الكتاب");
      navigate("/my-library");
    } finally {
      clearInterval(progressInterval);
      setTimeout(() => setLoadingBook(false), 300);
    }
  }, [bookId, navigate, user]);

  // ── Load PDF and render ALL pages ──
  const loadPdf = useCallback(async () => {
    if (!signedUrl) return;
    try {
      setPdfReady(false);
      setRenderingPages(true);
      const pdf = await pdfjsLib.getDocument({ url: signedUrl, useWorkerFetch: false, isEvalSupported: false }).promise;
      pdfRef.current = pdf;
      setTotalPages(pdf.numPages);
      setPdfReady(true);

      // Render pages in batches for performance
      const images: Record<number, string> = {};
      const batchSize = 3;
      for (let i = 1; i <= pdf.numPages; i += batchSize) {
        const batch = [];
        for (let j = i; j < i + batchSize && j <= pdf.numPages; j++) {
          batch.push(j);
        }
        await Promise.all(
          batch.map(async (pageNum) => {
            try {
              const page = await pdf.getPage(pageNum);
              const viewport = page.getViewport({ scale: 1.5 });
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d");
              if (!ctx) return;
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await page.render({ canvasContext: ctx, viewport } as any).promise;
              images[pageNum] = canvas.toDataURL("image/jpeg", 0.88);
            } catch {}
          })
        );
        setPageImages((prev) => ({ ...prev, ...images }));
      }
    } catch {
      toast.error("فشل فتح ملف الكتاب");
    } finally {
      setRenderingPages(false);
    }
  }, [signedUrl]);

  // ── AI explain page ──
  const explainPage = useCallback(
    async (pageNum: number) => {
      const pageImg = pageImages[pageNum];
      if (!pageImg || sending) return;
      setSending(true);
      setNarrationText("");
      stopSpeaking();

      try {
        const { data, error } = await supabase.functions.invoke("ai-chat", {
          body: {
            messages: [{ role: "user", content: "اشرح هذه الصفحة للطالب شرحاً بسيطاً وواضحاً باللهجة المصرية كأنك معلم جالس بجانبه." }],
            subjectName: "مكتبتي الشخصية",
            lessonTitle: book?.title || "كتاب الطالب",
            pageNumber: pageNum,
            pageTitle: `صفحة ${pageNum}`,
            pageImageUrl: pageImg,
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
    [book?.title, pageImages, sending, speak, stopSpeaking]
  );

  // ── Chat with assistant ──
  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || chatSending) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: msg }]);
    setChatSending(true);

    try {
      const pageImg = pageImages[selectedPage];
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          messages: [
            ...(narrationText ? [{ role: "assistant" as const, content: narrationText }] : []),
            ...chatMessages.map((m) => ({ role: m.role, content: m.text })),
            { role: "user" as const, content: msg },
          ],
          subjectName: "مكتبتي الشخصية",
          lessonTitle: book?.title || "كتاب الطالب",
          pageNumber: selectedPage,
          pageTitle: `صفحة ${selectedPage}`,
          pageImageUrl: pageImg || undefined,
          isLessonStudio: true,
        },
      });
      if (error) throw error;
      const reply = (data as any)?.response || "عذراً، لم أتمكن من الرد.";
      setChatMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", text: "حدث خطأ. حاول مرة أخرى." }]);
    } finally {
      setChatSending(false);
    }
  }, [chatInput, chatSending, chatMessages, narrationText, pageImages, selectedPage, book?.title]);

  useEffect(() => { if (user && bookId) void fetchBook(); }, [bookId, fetchBook, user]);
  useEffect(() => { if (signedUrl) void loadPdf(); }, [loadPdf, signedUrl]);
  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  // Save reading progress whenever page changes
  useEffect(() => {
    if (bookId && selectedPage > 0) {
      saveReadingProgress(bookId, selectedPage);
    }
  }, [bookId, selectedPage]);

  // Scroll narration
  useEffect(() => {
    narrationRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [narrationText]);

  const goPage = (dir: number) => {
    setSelectedPage((p) => {
      const next = p + dir;
      if (next < 1 || next > totalPages) return p;
      return next;
    });
  };

  const selectPage = (pageNum: number) => {
    if (pageNum === selectedPage && narrationText) return; // already explaining this page
    setSelectedPage(pageNum);
    stopSpeaking();
    setNarrationText("");
    setChatMessages([]);
    // Auto-explain the selected page
    setTimeout(() => {
      void explainPage(pageNum);
    }, 300);
  };

  const togglePlayPause = () => {
    if (isSpeaking) stopSpeaking();
    else if (narrationText) speak(narrationText);
    else void explainPage(selectedPage);
  };

  const cycleSpeed = () => {
    setPlaybackSpeed((s) => {
      const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
      const idx = speeds.indexOf(s);
      return speeds[(idx + 1) % speeds.length];
    });
  };

  // ── Loading screen ──
  if (loadingBook) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background" dir="rtl">
        <button
          onClick={() => navigate("/my-library")}
          className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-3"
        >
          <span className="text-xl font-extrabold text-primary">{Math.round(loadProgress)}%</span>
          <div className="h-1.5 w-52 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-primary"
              animate={{ width: `${loadProgress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <p className="text-xs text-muted-foreground">جاري تحميل الكتاب...</p>
        </motion.div>
      </div>
    );
  }

  if (!book) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-background select-none"
      dir="rtl"
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
    >
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between border-b border-border/40 bg-background px-3 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate("/my-library")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <h1 className="truncate text-xs font-bold text-foreground">{book.title}</h1>
        </div>
        <span className="shrink-0 flex h-6 min-w-6 items-center justify-center rounded-md bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
          {selectedPage}/{totalPages}
        </span>
      </div>

      {/* ── Main content area - scrollable pages ── */}
      <div ref={pagesContainerRef} className="flex-1 overflow-y-auto bg-accent/20 relative">
        {/* Watermark overlay */}
        <div className="pointer-events-none fixed inset-0 z-[210] flex items-center justify-center overflow-hidden" style={{ mixBlendMode: "multiply" }}>
          <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-24 -rotate-[30deg] opacity-[0.06]">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="text-foreground text-2xl font-extrabold whitespace-nowrap">أزهاريون</span>
            ))}
          </div>
        </div>

        {!pdfReady || renderingPages ? (
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">جاري تجهيز الصفحات...</p>
            </div>
          </div>
        ) : (
          <div className="py-2 space-y-3 px-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <div key={pageNum} className="relative">
                {/* Page number indicator on left */}
                <AnimatePresence>
                  {selectedPage === pageNum && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="absolute -left-0.5 top-2 z-10"
                    >
                      <div className="flex h-7 min-w-7 items-center justify-center rounded-r-lg bg-primary text-[10px] font-bold text-primary-foreground px-1.5 shadow-md">
                        {pageNum}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Floating page number that appears and fades */}
                {selectedPage !== pageNum && (
                  <div className="absolute -left-0.5 top-2 z-10">
                    <div className="flex h-6 min-w-6 items-center justify-center rounded-r-md bg-muted/80 text-[9px] font-bold text-muted-foreground px-1 backdrop-blur-sm">
                      {pageNum}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => selectPage(pageNum)}
                  className={`relative w-full overflow-hidden rounded-lg border-2 transition-all duration-200 ${
                    selectedPage === pageNum
                      ? "border-primary shadow-lg shadow-primary/15"
                      : "border-transparent hover:border-primary/20"
                  }`}
                >
                  {pageImages[pageNum] ? (
                    <img
                      src={pageImages[pageNum]}
                      alt={`صفحة ${pageNum}`}
                      className="w-full pointer-events-none"
                      loading="lazy"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center bg-muted">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Narration box (small overlay at bottom) ── */}
      <AnimatePresence>
        {(narrationText || sending) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="shrink-0 border-t border-border bg-card/95 backdrop-blur-sm"
          >
            <div
              ref={narrationRef}
              className="max-h-[18vh] overflow-y-auto px-3 py-2"
            >
              {sending ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">المساعد يشرح الصفحة...</span>
                </div>
              ) : (
                <p className="text-xs leading-6 text-foreground" dir="rtl">
                  {narrationText}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Audio controls bar ── */}
      <div className="shrink-0 border-t border-border bg-background">
        <div className="safe-area-bottom flex items-center justify-around px-2 py-1.5">
          {/* Speed */}
          <button
            onClick={cycleSpeed}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground active:bg-muted/70"
          >
            {playbackSpeed}x
          </button>

          {/* Previous */}
          <button
            onClick={() => goPage(-1)}
            disabled={selectedPage <= 1}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-30 active:bg-muted/70"
          >
            <SkipBack className="h-3.5 w-3.5" fill="currentColor" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={togglePlayPause}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25 active:opacity-80"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isSpeaking ? (
              <Pause className="h-4 w-4" fill="currentColor" />
            ) : (
              <Play className="h-4 w-4 translate-x-0.5" fill="currentColor" />
            )}
          </button>

          {/* Next */}
          <button
            onClick={() => goPage(1)}
            disabled={selectedPage >= totalPages}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-30 active:bg-muted/70"
          >
            <SkipForward className="h-3.5 w-3.5" fill="currentColor" />
          </button>

          {/* Chat / Ask assistant */}
          <button
            onClick={() => setChatOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground active:bg-muted/70 relative"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {chatMessages.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
            )}
          </button>
        </div>
      </div>

      {/* ── Chat overlay ── */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[300] flex flex-col bg-background"
            dir="rtl"
          >
            {/* Chat header */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-bold text-foreground">المساعد الذكي</p>
                  <p className="text-[9px] text-muted-foreground">صفحة {selectedPage} - {book.title}</p>
                </div>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {narrationText && (
                <div className="flex gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                  <div className="rounded-xl rounded-tr-sm bg-muted/60 px-3 py-2 max-w-[85%]">
                    <p className="text-[11px] leading-5 text-foreground">{narrationText}</p>
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  {msg.role === "assistant" && (
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Bot className="h-3 w-3 text-primary" />
                    </div>
                  )}
                  <div
                    className={`rounded-xl px-3 py-2 max-w-[85%] ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tl-sm"
                        : "bg-muted/60 text-foreground rounded-tr-sm"
                    }`}
                  >
                    <p className="text-[11px] leading-5">{msg.text}</p>
                  </div>
                </div>
              ))}
              {chatSending && (
                <div className="flex gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                  <div className="rounded-xl rounded-tr-sm bg-muted/60 px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  </div>
                </div>
              )}
            </div>

            {/* Chat input */}
            <div className="shrink-0 border-t border-border p-2">
              <div className="flex items-center gap-2">
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void sendChatMessage()}
                  placeholder="اسأل عن الصفحة..."
                  className="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                  dir="rtl"
                />
                <button
                  onClick={() => void sendChatMessage()}
                  disabled={!chatInput.trim() || chatSending}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
