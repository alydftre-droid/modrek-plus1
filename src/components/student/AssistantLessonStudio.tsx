import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { invokeEdgeFunctionJson } from "@/lib/aiStream";
import { lockOrientation, unlockOrientation } from "@/lib/screenOrientation";
import { getTextToSpeechErrorMessage, speakText, splitArabicSpeechChunks, stopTextToSpeech } from "@/lib/textToSpeech";
import AnnotationOverlay from "@/features/interactive-tutor/AnnotationOverlay";
import SmartWhiteboard from "@/features/interactive-tutor/SmartWhiteboard";
import TutorPlaybackBar, { type PlaybackSpeed } from "@/features/interactive-tutor/TutorPlaybackBar";
import TheaterStage from "@/features/interactive-tutor/TheaterStage";
import { parseTutorResponse } from "@/features/interactive-tutor/parseTutorResponse";
import type { AnnotationShape, WhiteboardStep, TutorMode } from "@/features/interactive-tutor/types";
import {
  Bot,
  FileImage,
  ImagePlus,
  Layers,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Send,
  X,
  Hand,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

type Lesson = {
  id: string;
  title: string;
  description: string | null;
  source_pdf_url: string | null;
};

type LessonPage = {
  id: string;
  page_number: number;
  title: string | null;
  image_url: string;
  notes: string | null;
};

type ChatMessage = { role: "user" | "assistant"; content: string; imageUrl?: string | null };

const LESSON_CHAT_UPLOAD_BUCKET = "support-uploads";

function sanitizeLessonChatFileName(fileName: string) {
  return fileName.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/_+/g, "_");
}

function lessonChatFilePath(userId: string, fileName: string) {
  return `${userId}/lesson-chat/${Date.now()}_${sanitizeLessonChatFileName(fileName)}`;
}

export interface AssistantLessonStudioProps {
  subjectId: string;
  subjectName: string;
  groupId?: string;
  stage?: string;
  grade?: string;
  section?: string;
  subSubjectName?: string | null;
  subSubjectId?: string;
  educationType?: string | null;
}

export default function AssistantLessonStudio({
  subjectId,
  subjectName,
  groupId,
  stage,
  grade,
  section,
  educationType,
  subSubjectName,
}: AssistantLessonStudioProps) {
  const { user } = useAuth();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [pages, setPages] = useState<LessonPage[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingLessons, setLoadingLessons] = useState(true);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pageExplainFailed, setPageExplainFailed] = useState(false);
  const [lastExplainError, setLastExplainError] = useState<string | null>(null);
  // Per-page zoom map so navigating between pages keeps each one's zoom level.
  const pageZoomMapRef = useRef<Record<string, number>>({});
  const pagePanMapRef = useRef<Record<string, { x: number; y: number }>>({});
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const pageViewportRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Race-condition guard: only the latest selected page may apply AI/TTS results.
  const activePageRef = useRef<string | null>(null);
  // Interactive tutor state
  const [annotations, setAnnotations] = useState<AnnotationShape[]>([]);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [whiteboardSteps, setWhiteboardSteps] = useState<WhiteboardStep[]>([]);
  const [whiteboardTitle, setWhiteboardTitle] = useState<string | undefined>(undefined);
  // Cinematic playback controls
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [theaterMode, setTheaterMode] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const lastNarrationRef = useRef<string>("");

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Track spoken text for rewind/forward
  const allChunksRef = useRef<string[]>([]);
  const currentChunkIndexRef = useRef(0);
  const speakQueueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef(false);
  const pausedTextRef = useRef<string | null>(null);
  const autoAdvanceAfterSpeechRef = useRef(false);

  const selectedLesson = useMemo(() => lessons.find((l) => l.id === selectedLessonId) || null, [lessons, selectedLessonId]);
  const selectedPage = useMemo(() => pages.find((p) => p.id === selectedPageId) || null, [pages, selectedPageId]);
  const selectedPageIndex = useMemo(() => pages.findIndex((p) => p.id === selectedPageId), [pages, selectedPageId]);

  const createSignedLessonChatUrl = useCallback(async (filePath: string) => {
    const { isBunnyStorageFile, getFileUrl } = await import("@/lib/storage");
    if (isBunnyStorageFile(filePath)) return await getFileUrl(filePath);
    const { data, error } = await supabase.storage.from(LESSON_CHAT_UPLOAD_BUCKET).createSignedUrl(filePath, 60 * 60 * 24);
    if (error || !data?.signedUrl) throw error || new Error("تعذر إنشاء رابط الصورة");
    return data.signedUrl;
  }, []);

  // ====== Force landscape orientation while the assistant is open ======
  useEffect(() => {
    void lockOrientation("landscape");
    return () => { void unlockOrientation(); };
  }, []);

  // ====== TTS chunking ======
  const splitTextToChunks = (text: string): string[] => {
    return splitArabicSpeechChunks(text, 1400);
  };

  const speakNextChunk = useCallback(async () => {
    if (!isSpeakingRef.current || speakQueueRef.current.length === 0) {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      setIsPaused(false);
      if (autoAdvanceAfterSpeechRef.current && selectedPageIndex >= 0 && selectedPageIndex < pages.length - 1) {
        autoAdvanceAfterSpeechRef.current = false;
        const nextPage = pages[selectedPageIndex + 1];
        if (nextPage?.id) {
          setTimeout(() => setSelectedPageId(nextPage.id), 450);
        }
      }
      return;
    }

    const chunk = speakQueueRef.current.shift()!;
    currentChunkIndexRef.current++;
    try {
      await speakText({
        text: chunk,
        rate: 0.95 * playbackSpeed,
        subjectId,
        stage: stage || null,
        grade: grade || null,
        section: section || null,
        lesson: selectedLesson?.title || selectedPage?.title || selectedPage?.page_number ? `${selectedLesson?.title || "شرح المادة"} - صفحة ${selectedPage?.page_number || ""}` : null,
        onStart: () => {
          setIsSpeaking(true);
          setIsPaused(false);
        },
        onEnd: () => {
          setTimeout(() => {
            void speakNextChunk();
          }, 80);
        },
        onError: (error) => {
          console.warn("TTS chunk error:", error);
          isSpeakingRef.current = false;
          speakQueueRef.current = [];
          setIsSpeaking(false);
          setIsPaused(false);
        },
      });
    } catch (error) {
      const message = getTextToSpeechErrorMessage(error);
      console.warn("Assistant OpenRouter TTS failed", { message, error });
      toast.error(message);
      isSpeakingRef.current = false;
      speakQueueRef.current = [];
      setIsSpeaking(false);
      setIsPaused(false);
    }
  }, [pages, playbackSpeed, selectedPage, selectedLesson, selectedPageIndex, subjectId, stage, grade, section]);

  const speak = useCallback(async (text: string) => {
    if (!text) return;

    await stopTextToSpeech();
    isSpeakingRef.current = false;
    speakQueueRef.current = [];

    await new Promise((r) => setTimeout(r, 150));

    const chunks = splitTextToChunks(text);
    if (chunks.length === 0) { setIsSpeaking(false); return; }

    allChunksRef.current = [...chunks];
    currentChunkIndexRef.current = 0;
    speakQueueRef.current = [...chunks];
    pausedTextRef.current = null;
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    setIsPaused(false);
    speakNextChunk();
  }, [speakNextChunk]);

  const stopSpeaking = useCallback(() => {
    autoAdvanceAfterSpeechRef.current = false;
    isSpeakingRef.current = false;
    speakQueueRef.current = [];
    pausedTextRef.current = null;
    void stopTextToSpeech();
    setIsSpeaking(false);
    setIsPaused(false);
  }, []);

  // Pause/Resume - use cancel + re-queue approach for reliability
  const togglePause = useCallback(() => {
    if (!isSpeakingRef.current && !isPaused) return;

    if (isPaused) {
      // Resume from saved position
      if (allChunksRef.current.length > 0) {
        const resumeFrom = Math.max(0, currentChunkIndexRef.current - 1);
        const remaining = allChunksRef.current.slice(resumeFrom);
        speakQueueRef.current = [...remaining];
        isSpeakingRef.current = true;
        setIsPaused(false);
        setIsSpeaking(true);
        speakNextChunk();
      }
    } else {
      // Pause: cancel current speech and save position
      void stopTextToSpeech();
      isSpeakingRef.current = false;
      speakQueueRef.current = [];
      setIsPaused(true);
      setIsSpeaking(false);
    }
  }, [isPaused, speakNextChunk]);

  // Rewind: go back ~3 chunks
  const rewindSpeech = useCallback(() => {
    if (allChunksRef.current.length === 0) return;
    void stopTextToSpeech();
    isSpeakingRef.current = false;
    speakQueueRef.current = [];

    setTimeout(() => {
      const goBackTo = Math.max(0, currentChunkIndexRef.current - 4);
      currentChunkIndexRef.current = goBackTo;
      speakQueueRef.current = allChunksRef.current.slice(goBackTo);
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      setIsPaused(false);
      speakNextChunk();
    }, 150);
  }, [speakNextChunk]);

  // Forward: skip ~3 chunks
  const forwardSpeech = useCallback(() => {
    if (allChunksRef.current.length === 0) return;
    void stopTextToSpeech();
    isSpeakingRef.current = false;
    speakQueueRef.current = [];

    setTimeout(() => {
      const skipTo = Math.min(allChunksRef.current.length - 1, currentChunkIndexRef.current + 3);
      currentChunkIndexRef.current = skipTo;
      speakQueueRef.current = allChunksRef.current.slice(skipTo);
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      setIsPaused(false);
      speakNextChunk();
    }, 150);
  }, [speakNextChunk]);

  // ====== Voice Input (STT) ======
  const handleStartRecording = useCallback(async () => {
    if (isRecording) return;
    stopSpeaking();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = "ar-SA";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (transcript.trim()) {
            setInput(transcript);
            setTimeout(() => sendMessageDirect(transcript), 300);
          }
        };
        recognition.onerror = () => {};
        recognition.onend = () => {
          if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
          setIsRecording(false);
        };
        recognition.start();
        setTimeout(() => { try { recognition.stop(); } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); } }, 10000);
      }
    } catch {
      setIsRecording(false);
    }
  }, [isRecording, stopSpeaking]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    setIsRecording(false);
  }, []);

  // ====== Data Loading ======
  const loadLessons = async () => {
    setLoadingLessons(true);
    try {
      let query = supabase
        .from("ai_lessons")
        .select("id, title, description, source_pdf_url")
        .eq("subject_id", subjectId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (groupId) query = query.eq("group_id", groupId);

      if (subSubjectName) {
        const { data: ssData } = await supabase.from("sub_subjects").select("id").eq("name", subSubjectName).limit(1);
        if (ssData?.[0]?.id) query = query.eq("sub_subject_id", ssData[0].id);
      }

      const { data, error } = await query;
      if (error) throw error;
      const lessonRows = (data || []) as Lesson[];
      setLessons(lessonRows);
      const firstId = lessonRows[0]?.id ?? null;
      setSelectedLessonId(firstId);
      if (!firstId) { setPages([]); setSelectedPageId(null); }
    } catch (e) { console.error(e); }
    finally { setLoadingLessons(false); }
  };

  const loadPages = async (lessonId: string) => {
    try {
      const { data, error } = await supabase
        .from("ai_lesson_pages")
        .select("id, page_number, title, image_url, notes")
        .eq("lesson_id", lessonId)
        .order("page_number", { ascending: true });
      if (error) throw error;
      const pageRows = (data || []) as LessonPage[];
      setPages(pageRows);
      setSelectedPageId(pageRows[0]?.id ?? null);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadLessons(); }, [subjectId, groupId, subSubjectName]);
  useEffect(() => { if (selectedLessonId) loadPages(selectedLessonId); }, [selectedLessonId]);

  useEffect(() => {
    const hello = subSubjectName
      ? `مرحباً 👋 أنا مساعدك الذكي في ${subSubjectName}. اختر صفحة من القائمة وسأشرح لك المحتوى بالصوت والنص.`
      : `مرحباً 👋 أنا مساعدك الذكي في ${subjectName}. اختر صفحة وسأشرح لك.`;
    setMessages([{ role: "assistant", content: hello }]);
  }, [subjectName, subSubjectName]);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (!showAttachmentMenu) return;
    const closeMenu = () => setShowAttachmentMenu(false);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, [showAttachmentMenu]);

  useEffect(() => () => { stopSpeaking(); }, [stopSpeaking]);

  useEffect(() => {
    if (!chatOpen) {
      stopSpeaking();
    }
  }, [chatOpen, stopSpeaking]);

  // Auto-explain when page changes
  const prevPageIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedPage && selectedPageId !== prevPageIdRef.current) {
      if (prevPageIdRef.current) pageZoomMapRef.current[prevPageIdRef.current] = zoom;
      if (prevPageIdRef.current) pagePanMapRef.current[prevPageIdRef.current] = pan;
      prevPageIdRef.current = selectedPageId;
      activePageRef.current = selectedPageId;
      setZoom(pageZoomMapRef.current[selectedPageId!] ?? 1);
      setPan(pagePanMapRef.current[selectedPageId!] ?? { x: 0, y: 0 });
      setPageExplainFailed(false);
      setLastExplainError(null);
      setAnnotations([]);
      setWhiteboardOpen(false);
      setWhiteboardSteps([]);
      stopSpeaking();
      const prompt = selectedPage.notes
        ? `اشرح محتوى هذه الصفحة. ملاحظات المعلم: ${selectedPage.notes}`
        : `اشرح محتوى هذه الصفحة.`;
      sendMessageDirect(prompt, { replaceHistory: true, forPageId: selectedPageId! }).catch(() => toast.error("فشل تشغيل الشرح، حاول مرة أخرى"));
    }
  }, [selectedPageId, pan, stopSpeaking, zoom]);

  // Replay the current explanation from the beginning (annotations + whiteboard + speech).
  const handleReplay = useCallback(() => {
    const narration = lastNarrationRef.current;
    if (!narration) return;
    void stopTextToSpeech();
    // Force remount of overlay & whiteboard timing so all `at`/`duration` re-trigger from 0.
    setReplayKey((k) => k + 1);
    if (whiteboardSteps.length > 0) {
      setWhiteboardOpen(false);
      setTimeout(() => setWhiteboardOpen(true), 60);
    }
    setTimeout(() => speak(narration), 80);
  }, [speak, whiteboardSteps.length]);

  const clampZoom = useCallback((value: number) => Math.min(4, Math.max(0.5, value)), []);

  const updateZoom = useCallback((value: number) => {
    const clamped = clampZoom(value);
    setZoom(clamped);
    if (clamped <= 1.01) {
      setPan({ x: 0, y: 0 });
    }
  }, [clampZoom]);

  const handlePinchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return;
    const [a, b] = Array.from(event.touches);
    pinchStartDistRef.current = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    pinchStartZoomRef.current = zoom;
  }, [zoom]);

  const handlePinchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !pinchStartDistRef.current) return;
    const [a, b] = Array.from(event.touches);
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!distance) return;
    event.preventDefault();
    updateZoom(pinchStartZoomRef.current * (distance / pinchStartDistRef.current));
  }, [updateZoom]);

  const handlePinchEnd = useCallback(() => {
    pinchStartDistRef.current = null;
  }, []);

  const handleViewportScroll = useCallback(() => {
    const node = pageViewportRef.current;
    if (!node || zoom <= 1.01) return;
    setPan({ x: node.scrollLeft, y: node.scrollTop });
  }, [zoom]);

  useEffect(() => {
    const node = pageViewportRef.current;
    if (!node) return;
    node.scrollLeft = pan.x;
    node.scrollTop = pan.y;
  }, [pan, selectedPageId, zoom]);

  // ====== Chat ======
  const sendMessageDirect = async (
    text: string,
    options?: { imageUrl?: string | null; aiImageUrl?: string | null; silent?: boolean; replaceHistory?: boolean; forPageId?: string }
  ) => {
    const userText = text.trim();
    if (!userText || loading) return;
    const requestedPageId = options?.forPageId ?? activePageRef.current;
    setInput("");
    const baseMessages = options?.replaceHistory ? messages.filter((message) => message.role === "assistant").slice(0, 1) : messages;
    const nextMessages = [...baseMessages, { role: "user" as const, content: userText, imageUrl: options?.imageUrl || null }];
    setMessages(nextMessages);
    setLoading(true);
    setPageExplainFailed(false);
    setLastExplainError(null);

    try {
      const requestMessages = [
        ...baseMessages.map((message) => ({ role: message.role, content: message.content })),
        options?.aiImageUrl
          ? {
              role: "user",
              content: [
                { type: "text", text: userText },
                { type: "image_url", image_url: { url: options.aiImageUrl } },
              ],
            }
          : { role: "user", content: userText },
      ];

      const data = await invokeEdgeFunctionJson("ai-chat", {
          messages: requestMessages.slice(-20),
          subjectName,
          subjectId,
          stage: stage || null,
          grade: grade || null,
          section: section || null,
          subSubjectName: subSubjectName || null,
          lessonTitle: selectedLesson?.title || null,
          lessonDescription: selectedLesson?.description || null,
          pageNumber: selectedPage?.page_number || null,
          pageTitle: selectedPage?.title || null,
          pageNotes: selectedPage?.notes || null,
          pageImageUrl: selectedPage?.image_url || null,
          pageText: `${selectedPage?.title || ""}\n${selectedPage?.notes || ""}`.trim() || null,
          isLessonStudio: true,
          educationType: educationType || null,
      });

      // Race-condition guard: drop response if the user already moved on.
      if (requestedPageId && activePageRef.current && requestedPageId !== activePageRef.current) {
        return;
      }

      const rawText = (data as any)?.response || "عذراً، لم أتمكن من توليد شرح الآن.";
      const parsed = parseTutorResponse(rawText);
      const narration = parsed.narration || rawText;

      setMessages((prev) => [...prev, { role: "assistant", content: narration }]);
      lastNarrationRef.current = narration;
      setReplayKey((k) => k + 1);
      setAnnotations(Array.isArray(parsed.annotations) ? parsed.annotations : []);
      if (parsed.mode === "whiteboard" && parsed.whiteboard?.steps?.length) {
        setWhiteboardTitle(parsed.whiteboard.title);
        setWhiteboardSteps(parsed.whiteboard.steps);
        setWhiteboardOpen(true);
      } else {
        setWhiteboardOpen(false);
      }

      if (!options?.silent) {
        autoAdvanceAfterSpeechRef.current = true;
        speak(narration);
      }
    } catch (e: any) {
      console.error(e);
      if (requestedPageId && activePageRef.current && requestedPageId !== activePageRef.current) return;
      setMessages((prev) => [...prev, { role: "assistant", content: "تعذر تشغيل الشرح الآن. اضغط إعادة المحاولة لتشغيله من جديد." }]);
      setPageExplainFailed(true);
      setLastExplainError(e?.message || "تعذر تشغيل الشرح");
    } finally { setLoading(false); }
  };

  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) return;

    setUploadingImage(true);
    setShowAttachmentMenu(false);

    try {
      const { uploadImage } = await import("@/lib/storage");
      const stored = await uploadImage({
        scope: { kind: "user", id: user.id },
        category: "lesson-chat",
        file,
      });
      const filePath = stored.url;

      const signedUrl = await createSignedLessonChatUrl(filePath);
      await sendMessageDirect("حلل هذه الصورة واشرح لي المشكلة أو الفكرة الموجودة فيها.", {
        imageUrl: signedUrl,
        aiImageUrl: signedUrl,
      });
    } catch (error) {
      console.error(error);
      setMessages((prev) => [...prev, { role: "assistant", content: "تعذر رفع الصورة الآن، حاول مرة أخرى." }]);
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }, [createSignedLessonChatUrl, sendMessageDirect, user]);

  const sendMessage = async (forcedText?: string) => {
    const userText = (forcedText ?? input).trim();
    if (!userText || loading) return;
    await sendMessageDirect(userText);
  };

  const selectPageByOffset = useCallback((offset: number) => {
    if (!pages.length || selectedPageIndex < 0) return;
    const nextIndex = selectedPageIndex + offset;
    if (nextIndex < 0 || nextIndex >= pages.length) return;
    setSelectedPageId(pages[nextIndex].id);
    setChatOpen(false);
  }, [pages, selectedPageIndex]);

  const retryCurrentPageExplain = useCallback(() => {
    if (!selectedPage) return;
    const prompt = selectedPage.notes
      ? `اشرح محتوى هذه الصفحة بالكامل. ملاحظات المعلم: ${selectedPage.notes}`
      : "اشرح محتوى هذه الصفحة بالكامل.";
    void sendMessageDirect(prompt, { replaceHistory: true });
  }, [selectedPage]);

  // ====== Sound wave bars ======
  const SoundWaves = ({ active }: { active: boolean }) => (
    <div className="flex items-end gap-[3px] h-8 justify-center">
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div
          key={i}
          className="w-[3px] rounded-full transition-all duration-200"
          style={{
            backgroundColor: "#4A90D9",
            height: active ? `${10 + Math.sin(Date.now() / 200 + i) * 12}px` : "4px",
            animation: active ? `soundWave 0.6s ease-in-out ${i * 0.08}s infinite alternate` : "none",
          }}
        />
      ))}
    </div>
  );

  // ====== Render ======
  return (
    <div
      className="fixed inset-0 z-[100] flex h-dvh flex-row overflow-hidden bg-muted"
      dir="rtl"
      style={{ fontFamily: "'Cairo', sans-serif" }}
    >
      <style>{`
        @keyframes soundWave {
          0% { height: 4px; }
          100% { height: 28px; }
        }
        @keyframes soundWave2 {
          0% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.15); opacity: 0.6; }
          100% { transform: scale(1); opacity: 0.3; }
        }
      `}</style>

      {/* ===== RIGHT SIDE: Large lesson view ===== */}
      <div className="order-2 flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Title banner */}
        <div className="flex items-center justify-end px-4 py-1.5" style={{ background: "linear-gradient(135deg, #2E6DAF, #4A90D9)" }}>
          <h2 className="text-white font-bold text-sm truncate">
            {selectedPage?.title || selectedLesson?.title || subSubjectName || "أهلاً بكم!"}
          </h2>
        </div>

        <AnimatePresence mode="wait">
          {chatOpen ? (
            /* ===== CHAT VIEW ===== */
            <motion.div
              key="chat"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col bg-[#f0f4f8] relative"
            >
              {/* Chat header */}
              <div className="flex items-center justify-between px-3 py-1.5" style={{ background: "linear-gradient(135deg, #2E6DAF, #4A90D9)" }}>
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-white font-bold text-xs">اسأل الذكاء الاصطناعي</span>
                </div>
                <button
                  onClick={() => setChatOpen(false)}
                  className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>

              {/* Chat messages */}
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto bg-background/40 p-3">
                <div className="space-y-3 pb-2">
                  {messages.map((m, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}
                    >
                      {m.role === "user" && (
                        <div className="max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 shadow-sm" style={{ backgroundColor: "#D4E8FC" }}>
                          {m.imageUrl && <img src={m.imageUrl} alt="مرفق" className="mb-2 max-h-48 w-full rounded-xl object-contain" />}
                          <p className="text-xs text-gray-800 leading-relaxed">{m.content}</p>
                        </div>
                      )}
                      {m.role === "assistant" && (
                        <div className="flex items-end gap-1.5 max-w-[88%]">
                          <div className="bg-white rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm">
                            <div className="prose prose-sm max-w-none text-gray-800 leading-relaxed" style={{ fontSize: "12px" }}>
                              <ReactMarkdown>{m.content}</ReactMarkdown>
                            </div>
                          </div>
                          <div className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 mb-1" style={{ backgroundColor: "#4A90D9" }}>
                            <Bot className="h-3 w-3 text-white" />
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))}
                  {loading && (
                    <div className="flex justify-end">
                      <div className="flex items-end gap-1.5">
                        <div className="bg-white rounded-2xl rounded-bl-sm px-3 py-2">
                          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#4A90D9" }} />
                        </div>
                        <div className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 mb-1" style={{ backgroundColor: "#4A90D9" }}>
                          <Bot className="h-3 w-3 text-white" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Chat input */}
              <div className="border-t border-border/60 bg-background/95 p-2 backdrop-blur-sm">
                <div className="relative rounded-[24px] border border-border/70 bg-card p-2 shadow-dashboard-soft">
                  {showAttachmentMenu && (
                    <div className="absolute bottom-[calc(100%+8px)] left-0 z-20 min-w-36 rounded-2xl border border-border bg-card p-2 shadow-mudrik">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          imageInputRef.current?.click();
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                      >
                        <ImagePlus className="h-4 w-4 text-primary" />
                        رفع صورة
                      </button>
                    </div>
                  )}

                  <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex items-end gap-1.5">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowAttachmentMenu((prev) => !prev);
                      }}
                      className="shrink-0 h-10 w-10 rounded-full border border-border/70 bg-background flex items-center justify-center transition hover:bg-accent"
                    >
                      <Plus className="h-4 w-4 text-foreground" />
                    </button>
                    <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

                    <Textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void sendMessage();
                        }
                      }}
                      placeholder="اكتب سؤالك..."
                      className="min-h-[44px] flex-1 resize-none rounded-[20px] border-0 bg-muted/40 px-3 py-2 text-xs leading-6 shadow-none focus-visible:ring-1"
                      dir="rtl"
                      rows={1}
                    />

                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : handleStartRecording}
                      className={`shrink-0 h-10 w-10 rounded-full border border-border/70 flex items-center justify-center transition ${
                        isRecording ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-background hover:bg-accent text-foreground"
                      }`}
                    >
                      {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </button>

                    <button
                      type="submit"
                      disabled={loading || uploadingImage || !input.trim()}
                      className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition disabled:opacity-40 bg-primary text-primary-foreground"
                    >
                      {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </form>
                </div>
              </div>
            </motion.div>
          ) : (
            /* ===== LESSON VIEW ===== */
            <motion.div
              key="lesson"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="flex flex-1 flex-col overflow-hidden"
            >
              {/* Large content area */}
              <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-card p-2">
                {/* Zoom controls */}
                {selectedPage && (
                  <div className="absolute top-2 left-2 z-20 flex flex-col gap-1.5">
                    <button
                      onClick={() => updateZoom(zoom + 0.15)}
                      className="h-8 w-8 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center hover:bg-gray-50"
                      aria-label="تكبير"
                    >
                      <ZoomIn className="h-4 w-4 text-gray-700" />
                    </button>
                    <button
                      onClick={() => updateZoom(zoom - 0.15)}
                      className="h-8 w-8 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center hover:bg-gray-50"
                      aria-label="تصغير"
                    >
                      <ZoomOut className="h-4 w-4 text-gray-700" />
                    </button>
                    <button
                      onClick={() => updateZoom(1)}
                      className="h-7 px-1 rounded-md bg-white shadow-md border border-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-700 hover:bg-gray-50"
                      aria-label="حجم أصلي"
                    >
                      {Math.round(zoom * 100)}%
                    </button>
                  </div>
                )}
                <AnimatePresence mode="wait">
                  {selectedPage ? (
                    <motion.div
                      key={selectedPage.id}
                      initial={{ opacity: 0, x: -30 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 30 }}
                      transition={{ duration: 0.3 }}
                      ref={pageViewportRef}
                      onTouchStart={handlePinchStart}
                      onTouchMove={handlePinchMove}
                      onTouchEnd={handlePinchEnd}
                      onTouchCancel={handlePinchEnd}
                      onScroll={handleViewportScroll}
                      className="flex h-full w-full items-center justify-center overflow-auto"
                      style={{ touchAction: "none" }}
                    >
                      <div className="relative inline-block" style={{ transform: zoom !== 1 ? `scale(${zoom})` : undefined, transformOrigin: "top center" }}>
                        <img
                          src={selectedPage.image_url}
                          alt={selectedPage.title || `صفحة ${selectedPage.page_number}`}
                          className="object-contain rounded transition-transform duration-200 block"
                          style={{
                            maxWidth: zoom === 1 ? "100vw" : "none",
                            maxHeight: zoom === 1 ? "calc(100dvh - 60px)" : "none",
                          }}
                          loading="lazy"
                        />
                        {annotations.length > 0 && (
                          <AnnotationOverlay
                            key={replayKey}
                            annotations={annotations}
                            speed={playbackSpeed}
                            playing
                          />
                        )}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center text-gray-400 p-6"
                    >
                      <FileImage className="h-14 w-14 mx-auto mb-3 opacity-30" />
                      <p className="font-medium text-sm">اختر صفحة لعرضها</p>
                      <p className="text-xs mt-1">اختر من قائمة الصفحات</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ===== LEFT SIDE: Controls + Pages ===== */}
       <div className="order-1 flex h-full w-[180px] shrink-0 flex-col overflow-hidden border-l border-border bg-muted sm:w-[220px]">
        
        {/* ---- TOP BOX: Control Panel ---- */}
        <div className="bg-white rounded-lg m-1.5 mb-0.5 shadow-sm overflow-hidden">
          {/* Control buttons */}
          <div className="flex items-center justify-between px-1.5 py-1.5 bg-[#f5f5f5] border-b border-gray-200">
            {/* Hand (chat) */}
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className="h-8 w-8 rounded-full flex items-center justify-center transition hover:scale-105"
              style={{ backgroundColor: chatOpen ? "#4A90D9" : "#6CB4EE", color: "white" }}
              title="فتح الشات"
            >
              <Hand className="h-4 w-4" />
            </button>
            {/* +10 */}
            <button
              onClick={forwardSpeech}
              className="h-7 w-7 rounded-full border-2 border-gray-400 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition"
              title="تقديم"
            >
              <span style={{ fontSize: "8px", fontWeight: 700 }}>+10</span>
            </button>
            {/* Play/Pause */}
            <button
              onClick={isSpeaking || isPaused ? togglePause : () => {
                const last = [...messages].reverse().find((m) => m.role === "assistant");
                if (last) speak(last.content);
              }}
              className="h-8 w-8 rounded-full flex items-center justify-center transition hover:scale-105"
              style={{ backgroundColor: "#333", color: "white" }}
              title={isSpeaking && !isPaused ? "إيقاف مؤقت" : "تشغيل"}
            >
              {isSpeaking && !isPaused ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="2" width="4" height="12" rx="1" />
                  <rect x="9" y="2" width="4" height="12" rx="1" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 2l10 6-10 6V2z" />
                </svg>
              )}
            </button>
            {/* -10 */}
            <button
              onClick={rewindSpeech}
              className="h-7 w-7 rounded-full border-2 border-gray-400 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition"
              title="رجوع"
            >
              <span style={{ fontSize: "8px", fontWeight: 700 }}>-10</span>
            </button>
            {/* Stop */}
            <button
              onClick={stopSpeaking}
              className="h-7 w-7 rounded-full flex items-center justify-center transition hover:scale-105"
              style={{ backgroundColor: "#E74C5E", color: "white" }}
              title="إيقاف"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {/* AI Avatar with sound waves - compact */}
          <div className="flex items-center justify-center py-2 px-3 bg-gradient-to-b from-white to-gray-50">
            <div className="relative">
              {isSpeaking && !isPaused && (
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    animation: "soundWave2 1.5s ease-in-out infinite",
                    border: "2px solid #6CB4EE",
                    margin: "-3px",
                  }}
                />
              )}
              <div
                className="relative h-12 w-12 rounded-full flex items-center justify-center overflow-hidden"
                style={{
                  background: "linear-gradient(180deg, #B8D9F2 0%, #E8F0F8 100%)",
                  border: "2px solid #6CB4EE",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 80 80" fill="none">
                  <circle cx="40" cy="28" r="14" fill="#4A90D9" />
                  <ellipse cx="40" cy="62" rx="22" ry="16" fill="#4A90D9" />
                </svg>
              </div>
              <div className="mt-1 flex justify-center">
                <SoundWaves active={isSpeaking && !isPaused} />
              </div>
            </div>
          </div>

          {/* Page number */}
          {selectedPage && (
            <div className="text-center pb-1">
              <span className="text-sm font-bold text-gray-600">{selectedPage.page_number}</span>
            </div>
          )}
        </div>

        {/* ---- BOTTOM BOX: Pages List ---- */}
        <div className="bg-white rounded-lg m-1.5 mt-0.5 shadow-sm flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-end px-2 py-1.5 border-b border-gray-100">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white" style={{ backgroundColor: "#4A90D9" }}>
              {selectedLesson?.title || subSubjectName || "الصفحات"}
            </span>
          </div>

          {loadingLessons ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#4A90D9" }} />
            </div>
          ) : pages.length === 0 ? (
            <div className="p-3 text-center text-gray-400 text-[10px]">لم يرفع المعلم دروس بعد</div>
          ) : (
            <ScrollArea className="flex-1" dir="rtl">
              <div className="divide-y divide-gray-100">
                {pages.map((p, idx) => (
                  <motion.button
                    key={p.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03, duration: 0.2 }}
                    onClick={() => { setSelectedPageId(p.id); setChatOpen(false); }}
                    className={`w-full flex items-center gap-2 px-1.5 py-1.5 text-right transition-all hover:bg-blue-50 ${
                      p.id === selectedPageId ? "bg-blue-50" : ""
                    }`}
                  >
                    <span
                      className="w-6 h-5 flex items-center justify-center rounded text-[9px] font-bold shrink-0"
                      style={{
                        backgroundColor: p.id === selectedPageId ? "#4A90D9" : "#f0f0f0",
                        color: p.id === selectedPageId ? "white" : "#666",
                      }}
                    >
                      {p.page_number}
                    </span>
                    <div
                      className={`shrink-0 w-12 h-16 rounded overflow-hidden border ${
                        p.id === selectedPageId ? "border-[#4A90D9] shadow" : "border-gray-200"
                      } bg-white`}
                    >
                      <img
                        src={p.image_url}
                        alt={p.title || `صفحة ${p.page_number}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <span className={`flex-1 text-[10px] leading-tight text-right truncate ${
                      p.id === selectedPageId ? "font-bold text-gray-800" : "text-gray-600"
                    }`}>
                      {p.title || `صفحة ${p.page_number}`}
                    </span>
                  </motion.button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Lesson tabs */}
        {lessons.length > 1 && (
          <div className="px-1.5 pb-1.5">
            <ScrollArea className="w-full" dir="rtl">
              <div className="flex gap-1 pb-1">
                {lessons.map((lesson, idx) => (
                  <button
                    key={lesson.id}
                    onClick={() => setSelectedLessonId(lesson.id)}
                    className={`shrink-0 px-2 py-1 rounded text-[10px] font-bold transition-all ${
                      lesson.id === selectedLessonId
                        ? "text-white shadow"
                        : "bg-white text-gray-600 hover:bg-gray-100"
                    }`}
                    style={lesson.id === selectedLessonId ? { backgroundColor: "#4A90D9" } : {}}
                  >
                    درس {idx + 1}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      <SmartWhiteboard
        key={`wb-${replayKey}`}
        open={whiteboardOpen}
        title={whiteboardTitle}
        steps={whiteboardSteps}
        speed={playbackSpeed}
        onClose={() => setWhiteboardOpen(false)}
      />

      {/* Floating playback bar removed per UX request — controls moved to TheaterStage / settings */}

      {/* Theater Mode — fullscreen cinematic stage */}
      <TheaterStage
        open={theaterMode}
        imageUrl={selectedPage?.image_url || null}
        annotations={annotations}
        speed={playbackSpeed}
        replayKey={replayKey}
        onClose={() => setTheaterMode(false)}
        onReplay={handleReplay}
        onSpeedChange={setPlaybackSpeed}
        title={selectedPage?.title || selectedLesson?.title || undefined}
      />

      {/* FAB for chat */}
       {!chatOpen && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={() => setChatOpen(true)}
          className="fixed bottom-4 left-4 z-[110] h-10 w-10 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 transition-all"
          style={{ backgroundColor: "#4A90D9" }}
        >
          <Bot className="h-5 w-5 text-white" />
        </motion.button>
      )}

      <div className="absolute bottom-3 left-1/2 z-[120] flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background/95 px-2 py-1.5 shadow-lg backdrop-blur">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 rounded-full"
          onClick={() => selectPageByOffset(-1)}
          disabled={selectedPageIndex <= 0}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          className="h-11 w-11 rounded-full"
          onClick={() => {
            const last = [...messages].reverse().find((m) => m.role === "assistant");
            if (isSpeaking || isPaused) togglePause();
            else if (last?.content) {
              autoAdvanceAfterSpeechRef.current = false;
              void speak(last.content);
            } else {
              retryCurrentPageExplain();
            }
          }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isSpeaking && !isPaused ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="4" height="12" rx="1" /><rect x="9" y="2" width="4" height="12" rx="1" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z" /></svg>
          )}
        </Button>
        <Button
          type="button"
          size="icon"
          variant={pageExplainFailed ? "destructive" : "ghost"}
          className="h-9 w-9 rounded-full"
          onClick={retryCurrentPageExplain}
          title={lastExplainError || "إعادة شرح الصفحة"}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 rounded-full"
          onClick={() => selectPageByOffset(1)}
          disabled={selectedPageIndex === -1 || selectedPageIndex >= pages.length - 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
