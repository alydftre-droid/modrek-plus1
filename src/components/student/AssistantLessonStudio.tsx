import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  FileImage,
  Loader2,
  Mic,
  MicOff,
  Send,
  X,
  Hand,
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

type ChatMessage = { role: "user" | "assistant"; content: string };

export interface AssistantLessonStudioProps {
  subjectId: string;
  subjectName: string;
  groupId?: string;
  stage?: string;
  grade?: string;
  section?: string;
  subSubjectName?: string | null;
  subSubjectId?: string;
}

export default function AssistantLessonStudio({
  subjectId,
  subjectName,
  groupId,
  stage,
  grade,
  section,
  subSubjectName,
}: AssistantLessonStudioProps) {
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

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Track spoken text for rewind/forward
  const allChunksRef = useRef<string[]>([]);
  const currentChunkIndexRef = useRef(0);
  const speakQueueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef(false);
  const pausedTextRef = useRef<string | null>(null);

  const selectedLesson = useMemo(() => lessons.find((l) => l.id === selectedLessonId) || null, [lessons, selectedLessonId]);
  const selectedPage = useMemo(() => pages.find((p) => p.id === selectedPageId) || null, [pages, selectedPageId]);

  // ====== Force landscape on mount ======
  useEffect(() => {
    const lockOrientation = async () => {
      try {
        if (screen.orientation && (screen.orientation as any).lock) {
          await (screen.orientation as any).lock("landscape");
        }
      } catch { /* not supported on desktop */ }
    };
    lockOrientation();

    return () => {
      try {
        if (screen.orientation && (screen.orientation as any).unlock) {
          (screen.orientation as any).unlock();
        }
      } catch { /* */ }
    };
  }, []);

  // ====== Arabic Voice ======
  const getArabicVoice = useCallback(async (): Promise<SpeechSynthesisVoice | null> => {
    let voices = window.speechSynthesis.getVoices();
    if (!voices.length) {
      await new Promise<void>((resolve) => {
        window.speechSynthesis.onvoiceschanged = () => resolve();
        setTimeout(resolve, 2000);
      });
      voices = window.speechSynthesis.getVoices();
    }
    return voices.find((v) => v.lang === "ar-SA") || voices.find((v) => v.lang.startsWith("ar")) || null;
  }, []);

  // ====== TTS chunking ======
  const splitTextToChunks = (text: string): string[] => {
    const cleanText = text
      .replace(/[#*_`>]/g, "")
      .replace(/\n+/g, ". ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleanText) return [];

    return cleanText
      .split(/(?<=[.!?،؟!。])\s+|(?<=\.\s)/)
      .flatMap((s) => {
        if (s.length > 80) {
          const parts = s.split(/(?<=[،,])\s*/);
          return parts.flatMap((p) => {
            if (p.length > 100) {
              const result: string[] = [];
              let remaining = p;
              while (remaining.length > 60) {
                const breakAt = remaining.lastIndexOf(" ", 60);
                if (breakAt > 20) {
                  result.push(remaining.substring(0, breakAt).trim());
                  remaining = remaining.substring(breakAt).trim();
                } else {
                  result.push(remaining.substring(0, 60).trim());
                  remaining = remaining.substring(60).trim();
                }
              }
              if (remaining.trim()) result.push(remaining.trim());
              return result;
            }
            return [p.trim()];
          });
        }
        return [s.trim()];
      })
      .filter((s) => s.length > 0);
  };

  const speakNextChunk = useCallback(async () => {
    if (!isSpeakingRef.current || speakQueueRef.current.length === 0) {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      setIsPaused(false);
      utteranceRef.current = null;
      return;
    }

    const chunk = speakQueueRef.current.shift()!;
    currentChunkIndexRef.current++;
    const utterance = new SpeechSynthesisUtterance(chunk);
    const voice = await getArabicVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "ar-SA";
    }
    utterance.rate = 0.95;

    utterance.onend = () => {
      setTimeout(() => speakNextChunk(), 80);
    };
    utterance.onerror = (e) => {
      console.warn("TTS chunk error:", e);
      setTimeout(() => speakNextChunk(), 80);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [getArabicVoice]);

  const speak = useCallback(async (text: string) => {
    if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
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
    isSpeakingRef.current = false;
    speakQueueRef.current = [];
    pausedTextRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (utteranceRef.current) {
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
    }
    utteranceRef.current = null;
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
      window.speechSynthesis.cancel();
      isSpeakingRef.current = false;
      speakQueueRef.current = [];
      setIsPaused(true);
      setIsSpeaking(false);
    }
  }, [isPaused, speakNextChunk]);

  // Rewind: go back ~3 chunks
  const rewindSpeech = useCallback(() => {
    if (allChunksRef.current.length === 0) return;
    window.speechSynthesis.cancel();
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
    window.speechSynthesis.cancel();
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
        setTimeout(() => { try { recognition.stop(); } catch {} }, 10000);
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

  useEffect(() => () => { stopSpeaking(); }, [stopSpeaking]);

  // Auto-explain when page changes
  const prevPageIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedPage && selectedPageId !== prevPageIdRef.current) {
      prevPageIdRef.current = selectedPageId;
      stopSpeaking();
      // Simple direct prompt - the image will be sent to vision model
      const prompt = selectedPage.notes
        ? `اشرح محتوى هذه الصفحة. ملاحظات المعلم: ${selectedPage.notes}`
        : `اشرح محتوى هذه الصفحة.`;
      sendMessageDirect(prompt);
    }
  }, [selectedPageId]);

  // ====== Chat ======
  const sendMessageDirect = async (text: string) => {
    const userText = text.trim();
    if (!userText || loading) return;
    setInput("");
    const nextMessages = [...messages, { role: "user" as const, content: userText }];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          messages: nextMessages.slice(-20),
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
          isLessonStudio: true,
        },
      });
      if (error) throw error;
      const responseText = (data as any)?.response || "عذراً، لم أتمكن من توليد شرح الآن.";
      setMessages((prev) => [...prev, { role: "assistant", content: responseText }]);
      speak(responseText);
    } catch (e) {
      console.error(e);
      setMessages((prev) => [...prev, { role: "assistant", content: "حدث خطأ أثناء الشرح، حاول مرة أخرى." }]);
    } finally { setLoading(false); }
  };

  const sendMessage = async (forcedText?: string) => {
    const userText = (forcedText ?? input).trim();
    if (!userText || loading) return;
    await sendMessageDirect(userText);
  };

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
      className="fixed inset-0 z-[100] flex flex-row bg-[#e8e8e8]"
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
      <div className="flex-1 flex flex-col min-w-0 order-2">
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
              <ScrollArea className="flex-1 p-3" ref={chatScrollRef}>
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
              </ScrollArea>

              {/* Chat input */}
              <div className="p-2 bg-white border-t border-gray-200">
                <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-1.5 items-center">
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : handleStartRecording}
                    className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center transition ${
                      isRecording ? "bg-red-500 animate-pulse" : "bg-gray-100 hover:bg-gray-200"
                    }`}
                  >
                    {isRecording ? <MicOff className="h-3 w-3 text-white" /> : <Mic className="h-3 w-3 text-gray-600" />}
                  </button>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="اكتب سؤالك..."
                    className="flex-1 h-8 rounded-full border border-gray-300 px-3 text-xs focus:outline-none focus:border-blue-400 bg-gray-50"
                    dir="rtl"
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center transition disabled:opacity-40"
                    style={{ backgroundColor: "#E74C5E" }}
                  >
                    <Send className="h-3 w-3 text-white" />
                  </button>
                </form>
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
              className="flex-1 flex flex-col"
            >
              {/* Large content area */}
              <div className="flex-1 flex items-center justify-center p-2 bg-white overflow-auto">
                <AnimatePresence mode="wait">
                  {selectedPage ? (
                    <motion.div
                      key={selectedPage.id}
                      initial={{ opacity: 0, x: -30 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 30 }}
                      transition={{ duration: 0.3 }}
                      className="w-full h-full flex items-center justify-center"
                    >
                      <img
                        src={selectedPage.image_url}
                        alt={selectedPage.title || `صفحة ${selectedPage.page_number}`}
                        className="max-w-full max-h-full object-contain rounded"
                        loading="lazy"
                      />
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
      <div className="w-[200px] sm:w-[240px] flex flex-col bg-[#e8e8e8] border-l border-gray-300 order-1 shrink-0">
        
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

          {/* AI Avatar with sound waves */}
          <div className="flex items-center justify-center py-4 px-3 bg-gradient-to-b from-white to-gray-50">
            <div className="relative">
              {isSpeaking && !isPaused && (
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    animation: "soundWave2 1.5s ease-in-out infinite",
                    border: "3px solid #6CB4EE",
                    margin: "-6px",
                  }}
                />
              )}
              <div
                className="relative h-20 w-20 rounded-full flex items-center justify-center overflow-hidden"
                style={{
                  background: "linear-gradient(180deg, #B8D9F2 0%, #E8F0F8 100%)",
                  border: "3px solid #6CB4EE",
                }}
              >
                <svg width="40" height="40" viewBox="0 0 80 80" fill="none">
                  <circle cx="40" cy="28" r="14" fill="#4A90D9" />
                  <ellipse cx="40" cy="62" rx="22" ry="16" fill="#4A90D9" />
                </svg>
              </div>
              <div className="mt-2 flex justify-center">
                <SoundWaves active={isSpeaking && !isPaused} />
              </div>
            </div>
          </div>

          {/* Page number */}
          {selectedPage && (
            <div className="text-center pb-1.5">
              <span className="text-lg font-bold text-gray-600">{selectedPage.page_number}</span>
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

          <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 border-b border-gray-200">
            <span className="flex-1 text-[10px] font-bold text-center" style={{ color: "#4A90D9" }}>العنوان</span>
            <span className="w-10 text-[10px] font-bold text-center" style={{ color: "#4A90D9" }}>رقم</span>
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
                    transition={{ delay: idx * 0.05, duration: 0.2 }}
                    onClick={() => { setSelectedPageId(p.id); setChatOpen(false); }}
                    className={`w-full flex items-center gap-1.5 px-2 py-2 text-right transition-all hover:bg-blue-50 ${
                      p.id === selectedPageId ? "bg-blue-50" : ""
                    }`}
                  >
                    <span className={`flex-1 text-[10px] leading-relaxed ${
                      p.id === selectedPageId ? "font-bold text-gray-800" : "text-gray-600"
                    }`}>
                      {p.title || `صفحة ${p.page_number}`}
                    </span>
                    <span
                      className="w-7 h-5 flex items-center justify-center rounded text-[9px] font-bold shrink-0"
                      style={{
                        backgroundColor: p.id === selectedPageId ? "#4A90D9" : "#f0f0f0",
                        color: p.id === selectedPageId ? "white" : "#666",
                      }}
                    >
                      {p.page_number}
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
    </div>
  );
}
