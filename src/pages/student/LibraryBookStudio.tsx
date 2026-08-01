import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchLibraryPdfBlob } from "@/lib/studentLibrary";
import { libraryCache } from "@/lib/libraryCache";
import { invokeEdgeFunctionJson } from "@/lib/aiStream";
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
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Search,
  BookOpen,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { lockOrientation as lockNativeOrientation, unlockOrientation as unlockNativeOrientation } from "@/lib/screenOrientation";
import { getTextToSpeechErrorMessage, speakText, stopTextToSpeech } from "@/lib/textToSpeech";
import AnnotationOverlay from "@/features/interactive-tutor/AnnotationOverlay";
import SmartWhiteboard from "@/features/interactive-tutor/SmartWhiteboard";
import TutorPlaybackBar, { type PlaybackSpeed } from "@/features/interactive-tutor/TutorPlaybackBar";
import TheaterStage from "@/features/interactive-tutor/TheaterStage";
import { parseTutorResponse } from "@/features/interactive-tutor/parseTutorResponse";
import type { AnnotationShape, WhiteboardStep } from "@/features/interactive-tutor/types";
import PageZoomViewer, { type PageZoomViewerHandle } from "@/features/library/PageZoomViewer";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;


type LibraryBook = {
  id: string;
  title: string;
  file_url: string;
  page_count: number | null;
  created_at: string;
};

type LibraryRecommendation = {
  kind: string;
  title: string;
  book_id: string;
  page_number: number | null;
  reason: string | null;
};

// ─── Reading progress helpers ───
function saveReadingProgress(bookId: string, page: number) {
  try { localStorage.setItem(`lib_progress_${bookId}`, String(page)); } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
}
function loadReadingProgress(bookId: string): number {
  try {
    const v = localStorage.getItem(`lib_progress_${bookId}`);
    return v ? Math.max(1, parseInt(v, 10)) : 1;
  } catch { return 1; }
}

export default function LibraryBookStudio() {
  const navigate = useNavigate();
  const { bookId } = useParams();
  const { user } = useAuth();
  const pdfRef = useRef<any>(null);
  const narrationRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const zoomControlsRef = useRef<PageZoomViewerHandle | null>(null);

  const [book, setBook] = useState<LibraryBook | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
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
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; text: string; sources?: Array<{ page_number: number; snippet: string }> }[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [chatScope, setChatScope] = useState<"page" | "book">("page");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [bookIndex, setBookIndex] = useState<Array<{ id: string; title: string; kind: string; page_start: number; page_end: number; summary: string | null }>>([]);
  const [recommendations, setRecommendations] = useState<LibraryRecommendation[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{ pages: Array<{ page_number: number; snippet: string }>; index: Array<{ id: string; title: string; page_start: number; page_end: number; kind: string }> }>({ pages: [], index: [] });
  const [zoom, setZoom] = useState(1);
  const [hiResPage, setHiResPage] = useState<{ page: number; url: string } | null>(null);
  const [pageExplainFailed, setPageExplainFailed] = useState(false);
  const [lastExplainError, setLastExplainError] = useState<string | null>(null);
  const autoAdvanceAfterSpeechRef = useRef(false);
  const activePageRef = useRef<number>(1);

  // Interactive tutor state
  const [annotations, setAnnotations] = useState<AnnotationShape[]>([]);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [whiteboardSteps, setWhiteboardSteps] = useState<WhiteboardStep[]>([]);
  const [whiteboardTitle, setWhiteboardTitle] = useState<string | undefined>(undefined);
  const [theaterMode, setTheaterMode] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const lastNarrationRef = useRef<string>("");

  // ── Force landscape orientation while reading (native + web) ──
  useEffect(() => {
    void lockNativeOrientation("landscape");
    return () => { void unlockNativeOrientation(); };
  }, []);

  // Zoom/pan is fully owned by <PageZoomViewer /> (matrix transform, clamped
  // bounds, pinch/double-tap/wheel). Here we only mirror the level for the
  // badge and to decide when a crisper page render is worth the memory.


  // ── Speech ──
  const stopSpeaking = useCallback(() => {
    autoAdvanceAfterSpeechRef.current = false;
    void stopTextToSpeech();
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!text) return;
      stopSpeaking();

      try {
        await speakText({
          text,
          rate: playbackSpeed,
          subjectId: null,
          stage: "library",
          grade: "personal-library",
          section: null,
          lesson: book?.title ? `${book.title} - صفحة ${selectedPage}` : `صفحة ${selectedPage}`,
          onStart: () => setIsSpeaking(true),
          onEnd: () => {
            setIsSpeaking(false);
            if (autoAdvanceAfterSpeechRef.current && selectedPage < totalPages) {
              autoAdvanceAfterSpeechRef.current = false;
              setTimeout(() => setSelectedPage((p) => Math.min(totalPages, p + 1)), 450);
            }
          },
          onError: () => setIsSpeaking(false),
        });
      } catch (error) {
        const message = getTextToSpeechErrorMessage(error);
        console.warn("Library OpenRouter TTS failed", { message, error });
        setIsSpeaking(false);
        toast.error(message);
      }
    },
    [stopSpeaking, playbackSpeed, selectedPage, totalPages, bookId, book?.title]
  );

  const handleReplay = useCallback(() => {
    const n = lastNarrationRef.current;
    if (!n) return;
    void stopTextToSpeech();
    setReplayKey((k) => k + 1);
    if (whiteboardSteps.length > 0) {
      setWhiteboardOpen(false);
      setTimeout(() => setWhiteboardOpen(true), 60);
    }
    setTimeout(() => speak(n), 80);
  }, [speak, whiteboardSteps.length]);

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
    setLoadProgress(5);

    try {
      const { data: libBook, error: libError } = await supabase
        .from("library_books")
        .select("id,title,pdf_path,page_count,created_at,cover_url")
        .eq("id", bookId)
        .eq("status", "ready")
        .eq("access_tier", "free")
        .maybeSingle();
      if (libError) throw libError;
      if (!libBook?.pdf_path) throw new Error("book_not_found");

      const bookRow = {
        id: libBook.id,
        title: libBook.title,
        file_url: libBook.pdf_path,
        page_count: libBook.page_count,
        created_at: libBook.created_at,
      };
      const fileUri = libBook.pdf_path;

      setBook(bookRow as LibraryBook);
      setLoadProgress(25);

      // IndexedDB caches the PDF bytes only after the source row is verified
      // from library_books, so authorization and metadata always come from DB.
      let blob = await libraryCache.getPdf(bookId);
      if (blob) {
        setLoadProgress(85);
      } else {
        setLoadProgress(40);
        blob = await fetchLibraryPdfBlob(fileUri!);
        setLoadProgress(80);
        void libraryCache.putPdf(bookId, blob);
      }
      setPdfBlob(blob);

      const savedPage = loadReadingProgress(bookId);
      setSelectedPage(savedPage);
      activePageRef.current = savedPage;

      setLoadProgress(100);
    } catch (error: any) {
      console.error("Library book fetch error:", error);
      toast.error("تعذر فتح هذا الكتاب");
      navigate("/my-library");
    } finally {
      setTimeout(() => setLoadingBook(false), 200);
    }
  }, [bookId, navigate, user]);

  // ── Lazy PDF renderer: only renders pages that are actually needed. ──
  // Persists rendered page JPEGs in IndexedDB so re-opening a book skips
  // pdf.js entirely for the pages the student already visited.
  const renderPromisesRef = useRef<Record<number, Promise<string | null>>>({});

  const renderPage = useCallback(
    (pageNum: number): Promise<string | null> => {
      const pdf = pdfRef.current;
      if (!pdf || pageNum < 1 || pageNum > pdf.numPages) return Promise.resolve(null);
      const cached = pageImages[pageNum];
      if (cached) return Promise.resolve(cached);
      const inflight = renderPromisesRef.current[pageNum];
      if (inflight) return inflight;

      const task = (async () => {
        try {
          // Persistent cache hit — skip pdf.js altogether.
          if (bookId) {
            const persisted = await libraryCache.getPage(bookId, pageNum);
            if (persisted) {
              setPageImages((prev) => (prev[pageNum] ? prev : { ...prev, [pageNum]: persisted }));
              return persisted;
            }
          }
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) return null;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx, viewport } as any).promise;
          const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
          setPageImages((prev) => (prev[pageNum] ? prev : { ...prev, [pageNum]: dataUrl }));
          if (bookId) void libraryCache.putPage(bookId, pageNum, dataUrl);
          return dataUrl;
        } catch (err) {
          console.debug("[library] render page failed", pageNum, err);
          return null;
        } finally {
          delete renderPromisesRef.current[pageNum];
        }
      })();
      renderPromisesRef.current[pageNum] = task;
      return task;
    },
    [pageImages, bookId],
  );

  // ── High-resolution re-render for deep zoom ──
  // The base page is rasterized at scale 1.5 (fast, low memory). Once the
  // student zooms past ~1.6x we render that single page at a much higher scale
  // so text stays razor sharp instead of pixelating. Only one hi-res bitmap is
  // ever kept in memory, and it is dropped when zoom returns to fit.
  const hiResTaskRef = useRef<number | null>(null);

  const renderHiRes = useCallback(async (pageNum: number, scale: number) => {
    const pdf = pdfRef.current;
    if (!pdf || pageNum < 1 || pageNum > pdf.numPages) return;
    if (hiResTaskRef.current === pageNum) return;
    hiResTaskRef.current = pageNum;
    try {
      const page = await pdf.getPage(pageNum);
      const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
      // Cap total pixels so big books never blow up device memory.
      const base = page.getViewport({ scale: 1 });
      const target = Math.min(4.5, 1.5 * Math.max(2, Math.min(3, scale)) * dpr);
      const maxPixels = 12_000_000;
      const safeScale = Math.min(target, Math.sqrt(maxPixels / (base.width * base.height)));
      const viewport = page.getViewport({ scale: Math.max(1.5, safeScale) });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: ctx, viewport } as any).promise;
      const url = canvas.toDataURL("image/jpeg", 0.92);
      canvas.width = 0;
      canvas.height = 0;
      if (hiResTaskRef.current === pageNum) setHiResPage({ page: pageNum, url });
    } catch (err) {
      console.debug("[library] hi-res render failed", pageNum, err);
    }
  }, []);

  const handleScaleChange = useCallback(
    (scale: number) => {
      setZoom(scale);
      if (scale > 1.6) {
        if (!hiResPage || hiResPage.page !== selectedPage) void renderHiRes(selectedPage, scale);
      } else if (hiResPage) {
        hiResTaskRef.current = null;
        setHiResPage(null);
      }
    },
    [hiResPage, selectedPage, renderHiRes],
  );

  // Dropping the hi-res bitmap on page change keeps memory flat in long books.
  useEffect(() => {
    hiResTaskRef.current = null;
    setHiResPage(null);
  }, [selectedPage]);


  const loadPdf = useCallback(async () => {
    if (!pdfBlob) return;
    try {
      setPdfReady(false);
      setRenderingPages(true);
      const data = new Uint8Array(await pdfBlob.arrayBuffer());
      const pdf = await pdfjsLib.getDocument({ data, useWorkerFetch: false }).promise;
      pdfRef.current = pdf;
      setTotalPages(pdf.numPages);
      setPdfReady(true);
      // Render only the current page immediately; hide overlay right after.
      const first = activePageRef.current || 1;
      await renderPage(first);
    } catch {
      toast.error("فشل فتح ملف الكتاب");
    } finally {
      setRenderingPages(false);
    }
  }, [pdfBlob, renderPage]);


  // Ensure the currently selected page is rendered, and preload the next one.
  useEffect(() => {
    if (!pdfReady || !pdfRef.current) return;
    void renderPage(selectedPage);
    // Preload neighbours (idle) so navigation feels instant without doing all pages upfront.
    const preload = () => {
      void renderPage(selectedPage + 1);
      void renderPage(selectedPage - 1);
    };
    const w = typeof window !== "undefined" ? (window as any) : null;
    if (w?.requestIdleCallback) w.requestIdleCallback(preload, { timeout: 800 });
    else setTimeout(preload, 250);
  }, [selectedPage, pdfReady, renderPage]);


  // ── AI explain page ──
  const explainPage = useCallback(
    async (pageNum: number) => {
      if (sending) return;
      activePageRef.current = pageNum;
      setSending(true);
      setNarrationText("");
      setAnnotations([]);
      setWhiteboardOpen(false);
      setPageExplainFailed(false);
      setLastExplainError(null);
      stopSpeaking();

      try {
        // Give the tutor the actual page image so it can read scanned pages,
        // diagrams, tables and equations instead of relying on extracted text.
        let pageImage = pageImages[pageNum] || null;
        if (!pageImage) pageImage = await renderPage(pageNum);
        if (activePageRef.current !== pageNum) return;

        const data = await invokeEdgeFunctionJson("library-explain", {
          book_id: book?.id,
          page_number: pageNum,
          variant: "default",
          with_audio: false,
          page_image_base64: pageImage || null,
          page_image_mime: "image/jpeg",
        });
        // Race-condition guard: ignore stale responses
        if (activePageRef.current !== pageNum) return;

        const rawText = (data as any)?.text || (data as any)?.response || "عذراً، لم أتمكن من شرح الصفحة الآن.";
        const parsed = parseTutorResponse(rawText);
        const narration = parsed.narration || rawText;

        setNarrationText(narration);
        lastNarrationRef.current = narration;
        setReplayKey((k) => k + 1);
        setAnnotations(Array.isArray(parsed.annotations) ? parsed.annotations : []);
        if (parsed.mode === "whiteboard" && parsed.whiteboard?.steps?.length) {
          setWhiteboardTitle(parsed.whiteboard.title);
          setWhiteboardSteps(parsed.whiteboard.steps);
          setWhiteboardOpen(true);
        }
        autoAdvanceAfterSpeechRef.current = true;
        speak(narration);
      } catch (error: any) {
        if (activePageRef.current !== pageNum) return;
        setNarrationText("تعذر تشغيل الشرح الآن. اضغط إعادة المحاولة لتشغيله من جديد.");
        setPageExplainFailed(true);
        setLastExplainError(error?.message || "تعذر تشغيل الشرح");
      } finally {
        setSending(false);
      }
    },
    [book?.id, sending, speak, stopSpeaking, pageImages, renderPage]
  );

  // ── Chat with assistant ──
  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || chatSending) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: msg }]);
    setChatSending(true);

    try {
      const data = await invokeEdgeFunctionJson<any>("library-chat", {
        book_id: book?.id,
        message: msg,
        scope: chatScope,
        page_number: chatScope === "book" ? null : selectedPage,
        conversation_id: conversationId,
        with_audio: false,
      });
      if (data?.conversation_id) setConversationId(data.conversation_id);
      const reply = data?.reply || "عذراً، لم أتمكن من الرد.";
      const parsed = parseTutorResponse(reply);
      const narration = parsed.narration || reply;
      setChatMessages((prev) => [...prev, { role: "assistant", text: narration, sources: data?.sources }]);
      if (Array.isArray(parsed.annotations) && parsed.annotations.length) setAnnotations(parsed.annotations);
      if (parsed.mode === "whiteboard" && parsed.whiteboard?.steps?.length) {
        setWhiteboardTitle(parsed.whiteboard.title);
        setWhiteboardSteps(parsed.whiteboard.steps);
        setWhiteboardOpen(true);
      }
      speak(narration);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", text: "حدث خطأ. حاول مرة أخرى." }]);
    } finally {
      setChatSending(false);
    }
  }, [chatInput, chatSending, selectedPage, book?.id, chatScope, conversationId, speak]);

  // ── Search inside the book ──
  const runSearch = useCallback(async (q: string) => {
    if (!book?.id || !q.trim()) {
      setSearchResults({ pages: [], index: [] });
      return;
    }
    setSearching(true);
    try {
      const data = await invokeEdgeFunctionJson<any>("library-search", { book_id: book.id, q: q.trim() });
      setSearchResults({ pages: data?.pages || [], index: data?.index || [] });
    } catch {
      setSearchResults({ pages: [], index: [] });
    } finally {
      setSearching(false);
    }
  }, [book?.id]);

  // ── Load live DB data: TOC, conversation, and recommendations ──
  useEffect(() => {
    if (!book?.id || !user) return;
    let cancelled = false;
    (async () => {
      const [{ data: idx }, { data: conv }, recData] = await Promise.all([
        supabase.from("library_book_index").select("id,title,kind,page_start,page_end,summary").eq("book_id", book.id).order("order_index"),
        supabase.from("library_book_conversations").select("id").eq("book_id", book.id).eq("student_id", user.id).maybeSingle(),
        invokeEdgeFunctionJson<{ items?: LibraryRecommendation[] }>("library-recommendations", { book_id: book.id, limit: 6 }).catch(() => ({ items: [] })),
      ]);
      if (cancelled) return;
      setBookIndex(Array.isArray(idx) ? idx : []);
      setRecommendations(Array.isArray(recData?.items) ? recData.items : []);
      if (conv?.id) {
        setConversationId(conv.id);
        // Load last 20 messages so the student sees prior chat with the book
        const { data: msgs } = await supabase
          .from("library_conversation_messages")
          .select("role,content")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: true })
          .limit(20);
        if (!cancelled && Array.isArray(msgs) && msgs.length) {
          setChatMessages(msgs.map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", text: m.content })));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [book?.id, user]);

  useEffect(() => { if (user && bookId) void fetchBook(); }, [bookId, fetchBook, user]);
  useEffect(() => { if (pdfBlob) void loadPdf(); }, [loadPdf, pdfBlob]);
  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  // Auto-explain the current page once its image is rendered
  const autoExplainedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!pageImages[selectedPage]) return;
    if (autoExplainedRef.current === selectedPage) return;
    autoExplainedRef.current = selectedPage;
    const t = setTimeout(() => { void explainPage(selectedPage); }, 400);
    return () => clearTimeout(t);
  }, [selectedPage, pageImages, explainPage]);

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
    activePageRef.current = pageNum;
    setSelectedPage(pageNum);
    stopSpeaking();
    setNarrationText("");
    setAnnotations([]);
    setWhiteboardOpen(false);
    setChatMessages([]);
    // Auto-explain the selected page
    setTimeout(() => {
      void explainPage(pageNum);
    }, 300);
  };

  const togglePlayPause = () => {
    if (isSpeaking) stopSpeaking();
    else if (narrationText) {
      autoAdvanceAfterSpeechRef.current = false;
      speak(narrationText);
    }
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
      className="fixed inset-0 z-[200] flex flex-row bg-muted select-none overflow-hidden"
      dir="rtl"
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
    >
      <div className="order-2 flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="mobile-app-header-inner flex items-center justify-between border-b border-border/40 bg-background px-3">
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

        <div className="relative flex-1 overflow-hidden bg-card p-2">
          <div className="absolute top-2 left-2 z-[215] flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => zoomControlsRef.current?.zoomIn()}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-foreground shadow-sm border border-border"
            aria-label="تكبير"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => zoomControlsRef.current?.zoomOut()}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-foreground shadow-sm border border-border"
            aria-label="تصغير"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => zoomControlsRef.current?.reset()}
            className="flex h-8 min-w-[52px] items-center justify-center rounded-full bg-card px-2 text-[11px] font-bold text-primary shadow-sm border border-border"
            aria-label="إعادة ضبط التكبير"
          >
            {Math.round(zoom * 100)}%
          </button>
          </div>
        {/* Watermark overlay */}
        <div className="pointer-events-none fixed inset-0 z-[210] flex items-center justify-center overflow-hidden" style={{ mixBlendMode: "multiply" }}>
          <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-24 -rotate-[30deg] opacity-[0.06]">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="text-foreground text-2xl font-extrabold whitespace-nowrap">مدرك Plus</span>
            ))}
          </div>
        </div>

        {!pdfReady || (renderingPages && !pageImages[selectedPage]) ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">جاري تجهيز الصفحة...</p>
            </div>
          </div>

        ) : (
          <div className="h-full w-full">
            {pageImages[selectedPage] ? (
              <PageZoomViewer
                src={pageImages[selectedPage]}
                hiResSrc={hiResPage?.page === selectedPage ? hiResPage.url : null}
                alt={`صفحة ${selectedPage}`}
                controlsRef={zoomControlsRef}
                onScaleChange={handleScaleChange}
                onSwipe={(dir) => goPage(dir === "next" ? 1 : -1)}
                overlay={
                  annotations.length > 0 ? (
                    <AnnotationOverlay key={replayKey} annotations={annotations} speed={playbackSpeed} playing />
                  ) : null
                }
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-border bg-background">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
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

          <button
            onClick={() => void explainPage(selectedPage)}
            className={`flex h-9 w-9 items-center justify-center rounded-full ${pageExplainFailed ? "bg-destructive text-destructive-foreground" : "bg-muted text-foreground"} active:opacity-80`}
            title={lastExplainError || "إعادة شرح الصفحة"}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${sending ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      </div>

      <div className="order-1 flex h-full w-[180px] shrink-0 flex-col overflow-hidden border-l border-border bg-muted sm:w-[220px]">
        <div className="bg-white rounded-lg m-1.5 mb-0.5 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-1.5 py-1.5 bg-[#f5f5f5] border-b border-gray-200">
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className="h-8 w-8 rounded-full flex items-center justify-center transition hover:scale-105"
              style={{ backgroundColor: chatOpen ? "#4A90D9" : "#6CB4EE", color: "white" }}
              title="فتح الشات"
            >
              <MessageCircle className="h-4 w-4" />
            </button>
            <button
              onClick={() => goPage(1)}
              disabled={selectedPage >= totalPages}
              className="h-7 w-7 rounded-full border-2 border-gray-400 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition disabled:opacity-30"
              title="التالي"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={togglePlayPause}
              className="h-8 w-8 rounded-full flex items-center justify-center transition hover:scale-105"
              style={{ backgroundColor: "#333", color: "white" }}
              title={isSpeaking ? "إيقاف مؤقت" : "تشغيل"}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSpeaking ? (
                <Pause className="h-4 w-4" fill="currentColor" />
              ) : (
                <Play className="h-4 w-4" fill="currentColor" />
              )}
            </button>
            <button
              onClick={() => goPage(-1)}
              disabled={selectedPage <= 1}
              className="h-7 w-7 rounded-full border-2 border-gray-400 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition disabled:opacity-30"
              title="السابق"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={stopSpeaking}
              className="h-7 w-7 rounded-full flex items-center justify-center transition hover:scale-105"
              style={{ backgroundColor: "#E74C5E", color: "white" }}
              title="إيقاف"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          <div className="flex items-center justify-center py-2 px-3 bg-gradient-to-b from-white to-gray-50">
            <div className="relative">
              <div
                className="relative h-12 w-12 rounded-full flex items-center justify-center overflow-hidden"
                style={{
                  background: "linear-gradient(180deg, #B8D9F2 0%, #E8F0F8 100%)",
                  border: "2px solid #6CB4EE",
                }}
              >
                <Bot className="h-6 w-6" style={{ color: "#4A90D9" }} />
              </div>
            </div>
          </div>

          <div className="text-center pb-1">
            <span className="text-sm font-bold text-gray-600">{selectedPage}</span>
          </div>
        </div>

        <div className="bg-white rounded-lg m-1.5 mt-0.5 shadow-sm flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-end px-2 py-1.5 border-b border-gray-100">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white" style={{ backgroundColor: "#4A90D9" }}>
              {book.title}
            </span>
          </div>
          <div ref={pagesContainerRef} className="flex-1 overflow-y-auto" dir="rtl">
            <div className="divide-y divide-border/70">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => selectPage(pageNum)}
                  className={`w-full flex items-center gap-2 px-1.5 py-1.5 text-right transition-all hover:bg-accent/50 ${pageNum === selectedPage ? "bg-accent/60" : ""}`}
                >
                  <span className={`w-6 h-5 flex items-center justify-center rounded text-[9px] font-bold shrink-0 ${pageNum === selectedPage ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {pageNum}
                  </span>
                  <div className={`shrink-0 w-12 h-16 rounded overflow-hidden border ${pageNum === selectedPage ? "border-primary shadow" : "border-border"} bg-background`}>
                    {pageImages[pageNum] ? <img src={pageImages[pageNum]} alt={`صفحة ${pageNum}`} className="w-full h-full object-cover" loading="lazy" draggable={false} /> : <div className="flex h-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
                  </div>
                  <span className={`flex-1 text-[10px] leading-tight text-right truncate ${pageNum === selectedPage ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                    صفحة {pageNum}
                  </span>
                </button>
              ))}
            </div>
          </div>
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

            <div className="border-b border-border bg-muted/30 px-3 py-2 space-y-2">
              <div className="flex items-center gap-1 bg-background rounded-full p-0.5 shadow-sm w-fit">
                <button
                  onClick={() => setChatScope("page")}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold transition ${chatScope === "page" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >عن هذه الصفحة</button>
                <button
                  onClick={() => setChatScope("book")}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold transition ${chatScope === "book" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >عن الكتاب كله</button>
                <button
                  onClick={() => { setSearchOpen((v) => !v); }}
                  className={`px-2 py-1 rounded-full text-[10px] font-bold transition ${searchOpen ? "bg-accent text-foreground" : "text-muted-foreground"}`}
                  title="بحث داخل الكتاب"
                ><Search className="h-3 w-3 inline" /></button>
              </div>

              {searchOpen && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void runSearch(searchQuery)}
                      placeholder="ابحث عن كلمة أو موضوع..."
                      className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-[11px]"
                      dir="rtl"
                    />
                    <button
                      onClick={() => void runSearch(searchQuery)}
                      disabled={searching}
                      className="h-7 px-2 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold"
                    >{searching ? "..." : "بحث"}</button>
                  </div>
                  {(searchResults.index.length > 0 || searchResults.pages.length > 0) && (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {searchResults.index.map((n) => (
                        <button key={n.id} onClick={() => { selectPage(n.page_start); setSearchOpen(false); setChatOpen(false); }}
                          className="w-full text-right rounded-md bg-primary/5 hover:bg-primary/10 px-2 py-1 text-[10px]">
                          <span className="font-bold text-primary">📚 {n.title}</span>
                          <span className="text-muted-foreground"> — ص {n.page_start}</span>
                        </button>
                      ))}
                      {searchResults.pages.map((p) => (
                        <button key={p.page_number} onClick={() => { selectPage(p.page_number); setSearchOpen(false); setChatOpen(false); }}
                          className="w-full text-right rounded-md bg-muted/60 hover:bg-muted px-2 py-1 text-[10px]">
                          <span className="font-bold">صفحة {p.page_number}:</span>
                          <span className="text-muted-foreground"> {p.snippet}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {recommendations.length > 0 && !searchOpen && (
                <div className="max-h-24 overflow-y-auto space-y-1">
                  {recommendations.map((rec, idx) => (
                    <button
                      key={`${rec.book_id}-${rec.page_number ?? 1}-${idx}`}
                      onClick={() => {
                        if (rec.book_id !== book.id) navigate(`/my-library/book/${rec.book_id}`);
                        else selectPage(Math.max(1, Number(rec.page_number || 1)));
                        setChatOpen(false);
                      }}
                      className="w-full rounded-md bg-background px-2 py-1 text-right text-[10px] hover:bg-primary/5"
                    >
                      <span className="font-bold text-primary">{rec.title}</span>
                      {rec.reason && <span className="text-muted-foreground"> — {rec.reason}</span>}
                    </button>
                  ))}
                </div>
              )}

              {bookIndex.length > 0 && !searchOpen && (
                <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1">
                  {bookIndex.slice(0, 20).map((n) => (
                    <button key={n.id} onClick={() => { selectPage(n.page_start); setChatOpen(false); }}
                      className="rounded-full bg-background border border-border px-2 py-0.5 text-[9px] hover:bg-primary/5">
                      <BookOpen className="h-2.5 w-2.5 inline ml-1 text-primary" />
                      {n.title} <span className="text-muted-foreground">({n.page_start})</span>
                      </button>
                  ))}
                </div>
              )}
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
                  placeholder={chatScope === "book" ? "اسأل عن الكتاب كله..." : "اسأل عن هذه الصفحة..."}
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

      <SmartWhiteboard
        key={`wb-${replayKey}`}
        open={whiteboardOpen}
        title={whiteboardTitle}
        steps={whiteboardSteps}
        speed={playbackSpeed}
        onClose={() => setWhiteboardOpen(false)}
      />

      {/* Floating playback bar removed — speed & theater controls live inside TheaterStage / settings */}

      <TheaterStage
        open={theaterMode}
        imageUrl={pageImages[selectedPage] || null}
        annotations={annotations}
        speed={playbackSpeed}
        replayKey={replayKey}
        onClose={() => setTheaterMode(false)}
        onReplay={handleReplay}
        onSpeedChange={(s) => setPlaybackSpeed(s)}
        title={book?.title || `صفحة ${selectedPage}`}
      />
    </div>
  );
}
