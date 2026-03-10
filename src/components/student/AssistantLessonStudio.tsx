import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
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

  const [autoSpeak] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Track spoken text position for rewind/forward
  const spokenChunksRef = useRef<string[]>([]);
  const currentChunkIndexRef = useRef(0);

  const selectedLesson = useMemo(() => lessons.find((l) => l.id === selectedLessonId) || null, [lessons, selectedLessonId]);
  const selectedPage = useMemo(() => pages.find((p) => p.id === selectedPageId) || null, [pages, selectedPageId]);

  // ====== Force landscape on mobile ======
  useEffect(() => {
    const lockOrientation = async () => {
      try {
        if (screen.orientation && (screen.orientation as any).lock) {
          await (screen.orientation as any).lock("landscape");
        }
      } catch { /* not supported */ }
    };
    lockOrientation();

    // Add landscape meta
    let meta = document.querySelector('meta[name="viewport"]');
    const origContent = meta?.getAttribute("content") || "";

    return () => {
      try {
        if (screen.orientation && (screen.orientation as any).unlock) {
          (screen.orientation as any).unlock();
        }
      } catch { /* */ }
    };
  }, []);

  // ====== Voice (TTS) - chunked for reliability ======
  const speakQueueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef(false);

  const getArabicVoice = useCallback(async (): Promise<SpeechSynthesisVoice | null> => {
    let voices = window.speechSynthesis.getVoices();
    if (!voices.length) {
      await new Promise<void>((resolve) => {
        window.speechSynthesis.onvoiceschanged = () => resolve();
        setTimeout(resolve, 1500);
      });
      voices = window.speechSynthesis.getVoices();
    }
    const arSA = voices.find((v) => v.lang === "ar-SA");
    const arAny = voices.find((v) => v.lang.startsWith("ar"));
    return arSA || arAny || null;
  }, []);

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

  const speak = useCallback(async (text: string) => {
    if (!text) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    isSpeakingRef.current = false;
    speakQueueRef.current = [];

    await new Promise((r) => setTimeout(r, 150));

    const chunks = splitTextToChunks(text);
    if (chunks.length === 0) { setIsSpeaking(false); return; }

    spokenChunksRef.current = [...chunks];
    currentChunkIndexRef.current = 0;
    speakQueueRef.current = chunks;
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    setIsPaused(false);
    speakNextChunk();
  }, [speakNextChunk]);

  const stopSpeaking = useCallback(() => {
    isSpeakingRef.current = false;
    speakQueueRef.current = [];
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

  const togglePause = useCallback(() => {
    if (!isSpeakingRef.current && !isPaused) return;

    if (isPaused) {
      // Resume
      window.speechSynthesis.resume();
      setIsPaused(false);
      isSpeakingRef.current = true;
      setIsSpeaking(true);
    } else {
      // Pause
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, [isPaused]);

  // Rewind: restart from ~2 chunks back
  const rewindSpeech = useCallback(() => {
    if (spokenChunksRef.current.length === 0) return;
    const goBackTo = Math.max(0, currentChunkIndexRef.current - 3);
    const remainingChunks = spokenChunksRef.current.slice(goBackTo);

    window.speechSynthesis.cancel();
    isSpeakingRef.current = false;
    speakQueueRef.current = [];

    setTimeout(() => {
      currentChunkIndexRef.current = goBackTo;
      speakQueueRef.current = [...remainingChunks];
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      setIsPaused(false);
      speakNextChunk();
    }, 150);
  }, [speakNextChunk]);

  // Forward: skip ~2 chunks
  const forwardSpeech = useCallback(() => {
    if (speakQueueRef.current.length <= 2) return;
    // Remove 2 chunks from queue
    speakQueueRef.current.splice(0, 2);
    currentChunkIndexRef.current += 2;
    // Cancel current utterance to trigger next
    window.speechSynthesis.cancel();
    setTimeout(() => {
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      setIsPaused(false);
      speakNextChunk();
    }, 100);
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
            setTimeout(() => { sendMessageDirect(transcript); }, 300);
          }
        };
        recognition.onerror = () => {};
        recognition.onend = () => {
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
          }
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
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
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
        .eq("group_id", groupId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (subSubjectName) {
        query = query.eq("sub_subject_id", (await supabase.from("sub_subjects").select("id").eq("name", subSubjectName).limit(1)).data?.[0]?.id || "");
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
      ? `مرحباً 👋 أنا مساعدك الذكي في ${subSubjectName}. اختر الدرس والصفحة، وسأشرح لك بالصوت والنص.`
      : `مرحباً 👋 أنا مساعدك الذكي في ${subjectName}. اختر الدرس والصفحة، وسأشرح لك بالصوت والنص.`;
    setMessages([{ role: "assistant", content: hello }]);
  }, [subjectName, subSubjectName]);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => () => { stopSpeaking(); }, [stopSpeaking]);

  // Auto-explain when page changes
  useEffect(() => {
    if (selectedPage && autoSpeak) {
      const pageTitle = selectedPage.title || `صفحة ${selectedPage.page_number}`;
      sendMessageDirect(`اشرح لي هذه الصفحة: ${pageTitle}`);
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
          subjectName, subjectId, stage, grade, section,
          subSubjectName: subSubjectName || null,
          lessonTitle: selectedLesson?.title || null,
          lessonDescription: selectedLesson?.description || null,
          pageNumber: selectedPage?.page_number || null,
          pageTitle: selectedPage?.title || null,
          pageNotes: selectedPage?.notes || null,
          pageImageUrl: selectedPage?.image_url || null,
        },
      });
      if (error) throw error;
      const responseText = (data as any)?.response || "عذراً، لم أتمكن من توليد شرح الآن.";
      setMessages((prev) => [...prev, { role: "assistant", content: responseText }]);
      if (autoSpeak) speak(responseText);
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

  // ====== Sound wave bars animation ======
  const SoundWaves = ({ active }: { active: boolean }) => (
    <div className="flex items-end gap-[3px] h-10 justify-center">
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div
          key={i}
          className="w-[4px] rounded-full transition-all duration-200"
          style={{
            backgroundColor: "#4A90D9",
            height: active ? `${12 + Math.sin(Date.now() / 200 + i) * 14}px` : "6px",
            animation: active ? `soundWave 0.6s ease-in-out ${i * 0.08}s infinite alternate` : "none",
          }}
        />
      ))}
    </div>
  );

  // ====== Render ======
  return (
    <div
      className="fixed inset-0 z-[100] flex bg-[#e8e8e8]"
      dir="rtl"
      style={{ fontFamily: "'Cairo', sans-serif" }}
    >
      {/* CSS for sound wave animation */}
      <style>{`
        @keyframes soundWave {
          0% { height: 6px; }
          100% { height: 32px; }
        }
        @keyframes soundWave2 {
          0% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.15); opacity: 0.6; }
          100% { transform: scale(1); opacity: 0.3; }
        }
      `}</style>

      {/* ===== RIGHT SIDE: Large lesson view ===== */}
      <div className="flex-1 flex flex-col min-w-0 order-2">
        {/* Title banner - blue like Nagwa */}
        <div className="flex items-center justify-end px-6 py-2" style={{ background: "linear-gradient(135deg, #2E6DAF, #4A90D9)" }}>
          <h2 className="text-white font-bold text-lg">
            {selectedPage?.title || selectedLesson?.title || subSubjectName || "أهلاً بكم!"}
          </h2>
        </div>

        {chatOpen ? (
          /* ===== CHAT VIEW (replaces lesson view) ===== */
          <div className="flex-1 flex flex-col bg-[#f0f4f8] relative">
            {/* Chat header */}
            <div
              className="flex items-center justify-between px-4 py-2"
              style={{ background: "linear-gradient(135deg, #2E6DAF, #4A90D9)" }}
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <span className="text-white font-bold text-sm">اسأل الذكاء الاصطناعي</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white/80 text-xs bg-white/20 px-2 py-0.5 rounded-full">
                  T 26/30
                </span>
                <button
                  onClick={() => setChatOpen(false)}
                  className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition"
                >
                  <X className="h-4 w-4 text-white" />
                </button>
              </div>
            </div>

            {/* Chat messages */}
            <ScrollArea className="flex-1 p-4" ref={chatScrollRef}>
              <div className="space-y-4 pb-2">
                {messages.map((m, idx) => (
                  <div key={idx} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                    {m.role === "user" && (
                      <div className="max-w-[85%] rounded-2xl rounded-br-sm px-4 py-3 shadow-sm" style={{ backgroundColor: "#D4E8FC" }}>
                        <p className="text-sm text-gray-800 leading-relaxed">{m.content}</p>
                        <span className="text-[10px] text-gray-500 mt-1 block">
                          {new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    )}
                    {m.role === "assistant" && (
                      <div className="flex items-end gap-2 max-w-[88%]">
                        <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                          <div className="prose prose-sm max-w-none text-gray-800 leading-relaxed" style={{ fontSize: "15px" }}>
                            <ReactMarkdown>{m.content}</ReactMarkdown>
                          </div>
                          <span className="text-[10px] text-gray-400 mt-1 block">
                            {new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 mb-1" style={{ backgroundColor: "#4A90D9" }}>
                          <Bot className="h-4 w-4 text-white" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-end">
                    <div className="flex items-end gap-2">
                      <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3">
                        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#4A90D9" }} />
                      </div>
                      <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 mb-1" style={{ backgroundColor: "#4A90D9" }}>
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Chat input */}
            <div className="p-3 bg-white border-t border-gray-200">
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : handleStartRecording}
                  className={`shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition ${
                    isRecording ? "bg-red-500 animate-pulse" : "bg-gray-100 hover:bg-gray-200"
                  }`}
                >
                  {isRecording ? <MicOff className="h-4 w-4 text-white" /> : <Mic className="h-4 w-4 text-gray-600" />}
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="ابدأ الكتابة ..."
                  className="flex-1 h-10 rounded-full border border-gray-300 px-4 text-sm focus:outline-none focus:border-blue-400 bg-gray-50"
                  dir="rtl"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition disabled:opacity-40"
                  style={{ backgroundColor: "#E74C5E" }}
                >
                  <Send className="h-4 w-4 text-white" />
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* ===== LESSON VIEW (image/PDF) ===== */
          <div className="flex-1 flex flex-col">
            {/* Pages table header */}
            {pages.length > 0 && (
              <div className="flex items-center gap-4 px-6 py-2 bg-white border-b border-gray-200">
                <span className="text-sm font-bold px-4 py-1 rounded" style={{ backgroundColor: "#4A90D9", color: "white" }}>
                  رقم الحصة
                </span>
                <span className="text-sm font-bold px-4 py-1 rounded border border-gray-300 bg-white">
                  عنوان الحصة
                </span>
              </div>
            )}

            {/* Large content area */}
            <div className="flex-1 flex items-center justify-center p-4 bg-white overflow-auto">
              {selectedPage ? (
                <div className="w-full h-full flex items-center justify-center">
                  <img
                    src={selectedPage.image_url}
                    alt={selectedPage.title || `صفحة ${selectedPage.page_number}`}
                    className="max-w-full max-h-full object-contain"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="text-center text-gray-400 p-8">
                  <FileImage className="h-20 w-20 mx-auto mb-4 opacity-30" />
                  <p className="font-medium text-lg">اختر صفحة لعرضها</p>
                  <p className="text-sm mt-1">اختر من قائمة الصفحات على اليسار</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== LEFT SIDE: Controls + Pages ===== */}
      <div className="w-[320px] flex flex-col bg-[#e8e8e8] border-l border-gray-300 order-1 shrink-0">
        
        {/* ---- TOP BOX: Control Panel ---- */}
        <div className="bg-white rounded-lg m-2 mb-1 shadow-sm overflow-hidden">
          {/* Control buttons bar */}
          <div className="flex items-center justify-between px-2 py-2 bg-[#f5f5f5] border-b border-gray-200">
            {/* Hand button (chat) */}
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className="h-10 w-10 rounded-full flex items-center justify-center transition hover:scale-105"
              style={{ backgroundColor: chatOpen ? "#4A90D9" : "#6CB4EE", color: "white" }}
              title="فتح الشات"
            >
              <Hand className="h-5 w-5" />
            </button>
            {/* +10 forward */}
            <button
              onClick={forwardSpeech}
              className="h-9 w-9 rounded-full border-2 border-gray-400 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition text-xs font-bold"
              title="تقديم 10 ثواني"
            >
              <span style={{ fontSize: "10px" }}>+10</span>
            </button>
            {/* Play/Pause */}
            <button
              onClick={isSpeaking || isPaused ? togglePause : () => {
                const last = [...messages].reverse().find((m) => m.role === "assistant");
                if (last) speak(last.content);
              }}
              className="h-10 w-10 rounded-full flex items-center justify-center transition hover:scale-105"
              style={{ backgroundColor: "#333", color: "white" }}
              title={isSpeaking && !isPaused ? "إيقاف مؤقت" : "تشغيل"}
            >
              {isSpeaking && !isPaused ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="2" width="4" height="12" rx="1" />
                  <rect x="9" y="2" width="4" height="12" rx="1" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 2l10 6-10 6V2z" />
                </svg>
              )}
            </button>
            {/* -10 rewind */}
            <button
              onClick={rewindSpeech}
              className="h-9 w-9 rounded-full border-2 border-gray-400 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition text-xs font-bold"
              title="رجوع 10 ثواني"
            >
              <span style={{ fontSize: "10px" }}>-10</span>
            </button>
            {/* Close/Stop */}
            <button
              onClick={stopSpeaking}
              className="h-9 w-9 rounded-full flex items-center justify-center transition hover:scale-105"
              style={{ backgroundColor: "#E74C5E", color: "white" }}
              title="إيقاف"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* AI Avatar with sound waves */}
          <div className="flex items-center justify-center py-6 px-4 bg-gradient-to-b from-white to-gray-50">
            <div className="relative">
              {/* Outer glow ring when speaking */}
              {isSpeaking && !isPaused && (
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    animation: "soundWave2 1.5s ease-in-out infinite",
                    border: "3px solid #6CB4EE",
                    margin: "-8px",
                  }}
                />
              )}
              {/* Avatar circle */}
              <div
                className="relative h-28 w-28 rounded-full flex items-center justify-center overflow-hidden"
                style={{
                  background: "linear-gradient(180deg, #B8D9F2 0%, #E8F0F8 100%)",
                  border: "3px solid #6CB4EE",
                }}
              >
                {/* Person silhouette */}
                <svg width="60" height="60" viewBox="0 0 80 80" fill="none">
                  <circle cx="40" cy="28" r="14" fill="#4A90D9" />
                  <ellipse cx="40" cy="62" rx="22" ry="16" fill="#4A90D9" />
                </svg>
              </div>

              {/* Sound wave indicator below avatar */}
              <div className="mt-3 flex justify-center">
                <SoundWaves active={isSpeaking && !isPaused} />
              </div>
            </div>
          </div>

          {/* Page number indicator */}
          {selectedPage && (
            <div className="text-center pb-2">
              <span className="text-2xl font-bold text-gray-600">{selectedPage.page_number}</span>
            </div>
          )}
        </div>

        {/* ---- BOTTOM BOX: Pages List ---- */}
        <div className="bg-white rounded-lg m-2 mt-1 shadow-sm flex-1 overflow-hidden flex flex-col">
          {/* Title badge */}
          <div className="flex items-center justify-end px-3 py-2 border-b border-gray-100">
            <span
              className="text-xs font-bold px-3 py-1 rounded text-white"
              style={{ backgroundColor: "#4A90D9" }}
            >
              {selectedLesson?.title || subSubjectName || "أهلاً بكم!"}
            </span>
          </div>

          {/* Table header */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200">
            <span className="flex-1 text-xs font-bold text-center" style={{ color: "#4A90D9" }}>عنوان الحصة</span>
            <span className="w-14 text-xs font-bold text-center" style={{ color: "#4A90D9" }}>رقم الحصة</span>
          </div>

          {/* Pages list - scrollable */}
          {loadingLessons ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#4A90D9" }} />
            </div>
          ) : pages.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">لم يرفع المعلم دروس بعد</div>
          ) : (
            <ScrollArea className="flex-1" dir="rtl">
              <div className="divide-y divide-gray-100">
                {pages.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedPageId(p.id); setChatOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-right transition-all hover:bg-blue-50 ${
                      p.id === selectedPageId ? "bg-blue-50" : ""
                    }`}
                  >
                    <span className={`flex-1 text-xs leading-relaxed ${
                      p.id === selectedPageId ? "font-bold text-gray-800" : "text-gray-600"
                    }`}>
                      {p.title || `صفحة ${p.page_number}`}
                    </span>
                    <span
                      className="w-10 h-7 flex items-center justify-center rounded text-xs font-bold shrink-0"
                      style={{
                        backgroundColor: p.id === selectedPageId ? "#4A90D9" : "#f0f0f0",
                        color: p.id === selectedPageId ? "white" : "#666",
                      }}
                    >
                      {p.page_number}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Lesson tabs at bottom if multiple lessons */}
        {lessons.length > 1 && (
          <div className="px-2 pb-2">
            <ScrollArea className="w-full" dir="rtl">
              <div className="flex gap-1 pb-1">
                {lessons.map((lesson, idx) => (
                  <button
                    key={lesson.id}
                    onClick={() => setSelectedLessonId(lesson.id)}
                    className={`shrink-0 px-3 py-1.5 rounded text-xs font-bold transition-all ${
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

      {/* FAB for chat when closed - bottom right of right side */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 left-6 z-[110] h-14 w-14 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 transition-all"
          style={{ backgroundColor: "#4A90D9" }}
        >
          <Bot className="h-7 w-7 text-white" />
        </button>
      )}
    </div>
  );
}
