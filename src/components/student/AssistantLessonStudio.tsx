import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import {
  Bot,
  ChevronRight,
  ChevronLeft,
  FileImage,
  Loader2,
  Mic,
  MicOff,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Send,
  Volume2,
  VolumeX,
  X,
  MessageCircle,
  Rewind,
  FastForward,
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

  const [autoSpeak, setAutoSpeak] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const selectedLesson = useMemo(() => lessons.find((l) => l.id === selectedLessonId) || null, [lessons, selectedLessonId]);
  const selectedPage = useMemo(() => pages.find((p) => p.id === selectedPageId) || null, [pages, selectedPageId]);
  const currentPageIndex = useMemo(() => pages.findIndex((p) => p.id === selectedPageId), [pages, selectedPageId]);

  // ====== Voice (TTS) ======
  const speak = useCallback(async (text: string) => {
    if (!text) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    // Always cancel before new speech
    window.speechSynthesis.cancel();
    setIsSpeaking(true);

    // Small delay to let cancel() settle (Chrome bug workaround)
    await new Promise((r) => setTimeout(r, 100));

    const cleanText = text.replace(/[#*_`>-]/g, " ").replace(/\s+/g, " ").trim();
    if (!cleanText) { setIsSpeaking(false); return; }

    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Get voices (may need to wait for them)
    let voices = window.speechSynthesis.getVoices();
    if (!voices.length) {
      await new Promise<void>((resolve) => {
        window.speechSynthesis.onvoiceschanged = () => resolve();
        setTimeout(resolve, 500);
      });
      voices = window.speechSynthesis.getVoices();
    }

    const arabicVoice = voices.find((v) => v.lang.startsWith("ar")) || voices[0];
    if (arabicVoice) {
      utterance.voice = arabicVoice;
      utterance.lang = arabicVoice.lang;
    } else {
      utterance.lang = "ar-SA";
    }
    utterance.rate = 0.95;

    utterance.onend = () => {
      setIsSpeaking(false);
      utteranceRef.current = null;
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      utteranceRef.current = null;
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (utteranceRef.current) {
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
    }
    utteranceRef.current = null;
    setIsSpeaking(false);
  }, []);

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
        // Use Web Speech API for recognition
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);

      // Use SpeechRecognition for live transcription
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
            // Auto-send
            setTimeout(() => {
              sendMessageDirect(transcript);
            }, 300);
          }
        };
        recognition.onerror = () => { /* silent */ };
        recognition.onend = () => {
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
          }
          setIsRecording(false);
        };
        recognition.start();

        // Auto-stop after 10 seconds
        setTimeout(() => {
          try { recognition.stop(); } catch { /* */ }
        }, 10000);
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

  // Cleanup on unmount
  useEffect(() => () => { stopSpeaking(); }, [stopSpeaking]);

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

  const repeatLast = () => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (last) speak(last.content);
  };

  // ====== Navigation ======
  const goPage = (dir: -1 | 1) => {
    const idx = currentPageIndex + dir;
    if (idx >= 0 && idx < pages.length) setSelectedPageId(pages[idx].id);
  };

  // ====== Render ======
  return (
    <div className="relative flex flex-col lg:flex-row gap-0 bg-background rounded-xl border border-border overflow-hidden" style={{ minHeight: 600 }}>

      {/* ===== LEFT: Lesson Pages List ===== */}
      <div className="w-full lg:w-[340px] border-b lg:border-b-0 lg:border-l border-border bg-card flex flex-col order-2 lg:order-1">
        {/* Lesson selector */}
        {loadingLessons ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : lessons.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">لم يرفع المعلم دروس المساعد بعد</div>
        ) : (
          <>
            {/* Lessons tabs */}
            <div className="px-3 pt-3 pb-2 border-b border-border">
              <ScrollArea className="w-full" dir="rtl">
                <div className="flex gap-2 pb-1">
                  {lessons.map((lesson, idx) => (
                    <button
                      key={lesson.id}
                      onClick={() => setSelectedLessonId(lesson.id)}
                      className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                        lesson.id === selectedLessonId
                          ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-md"
                          : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              </ScrollArea>
              {selectedLesson && (
                <p className="text-xs text-muted-foreground mt-1 truncate font-medium">{selectedLesson.title}</p>
              )}
            </div>

            {/* Pages table */}
            <ScrollArea className="flex-1" style={{ maxHeight: 420 }} dir="rtl">
              <div className="divide-y divide-border">
                {/* Table header */}
                <div className="flex items-center gap-3 px-3 py-2 bg-[hsl(var(--muted))] sticky top-0 z-10">
                  <span className="w-12 text-center text-xs font-bold text-[hsl(var(--primary))]">رقم الحصة</span>
                  <span className="flex-1 text-xs font-bold text-[hsl(var(--primary))]">عنوان الحصة</span>
                </div>
                {pages.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPageId(p.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 text-right transition-all ${
                      p.id === selectedPageId
                        ? "bg-[hsl(var(--primary)/0.08)] border-r-4 border-r-[hsl(var(--primary))]"
                        : "hover:bg-[hsl(var(--accent)/0.5)]"
                    }`}
                  >
                    <span className={`w-12 h-8 flex items-center justify-center rounded-md text-sm font-bold shrink-0 ${
                      p.id === selectedPageId
                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                        : "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                    }`}>
                      {p.page_number}
                    </span>
                    <span className={`flex-1 text-sm leading-relaxed ${
                      p.id === selectedPageId ? "font-bold text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))]"
                    }`}>
                      {p.title || `صفحة ${p.page_number}`}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </div>

      {/* ===== CENTER: Slide Viewer ===== */}
      <div className="flex-1 flex flex-col order-1 lg:order-2 min-w-0">
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-l from-[hsl(var(--primary))] to-[hsl(var(--primary)/0.85)]">
          <div className="flex items-center gap-3 min-w-0">
            {selectedPage && (
              <Badge className="bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] font-bold text-sm px-3">
                {selectedPage.page_number}
              </Badge>
            )}
            <h2 className="text-[hsl(var(--primary-foreground))] font-bold text-base truncate">
              {selectedPage?.title || selectedLesson?.title || (subSubjectName || subjectName)}
            </h2>
          </div>
        </div>

        {/* Media controls bar */}
        <div className="flex items-center justify-center gap-2 py-2 px-4 border-b border-border bg-card">
          <Button
            variant="ghost" size="icon"
            className="rounded-full h-9 w-9 text-destructive hover:bg-destructive/10"
            onClick={stopSpeaking}
            title="إيقاف"
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="rounded-full h-9 w-9"
            onClick={() => goPage(-1)}
            disabled={currentPageIndex <= 0}
            title="الصفحة السابقة"
          >
            <Rewind className="h-4 w-4" />
          </Button>
          <Button
            variant={isSpeaking ? "default" : "outline"}
            size="icon"
            className="rounded-full h-10 w-10"
            onClick={isSpeaking ? stopSpeaking : repeatLast}
            title={isSpeaking ? "إيقاف الصوت" : "تشغيل الشرح"}
          >
            {isSpeaking ? <PauseCircle className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
          </Button>
          <Button
            variant="ghost" size="icon"
            className="rounded-full h-9 w-9"
            onClick={() => goPage(1)}
            disabled={currentPageIndex >= pages.length - 1}
            title="الصفحة التالية"
          >
            <FastForward className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className={`rounded-full h-9 w-9 ${isRecording ? "text-destructive bg-destructive/10 animate-pulse" : ""}`}
            onClick={isRecording ? stopRecording : handleStartRecording}
            title={isRecording ? "إيقاف التسجيل" : "تحدث مع المساعد"}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
        </div>

        {/* Slide display */}
        <div className="flex-1 flex items-center justify-center p-4 bg-[hsl(var(--muted)/0.3)] min-h-[350px]">
          {selectedPage ? (
            <img
              src={selectedPage.image_url}
              alt={selectedPage.title || `صفحة ${selectedPage.page_number}`}
              className="max-w-full max-h-[500px] object-contain rounded-lg shadow-lg"
              loading="lazy"
            />
          ) : (
            <div className="text-center text-muted-foreground p-8">
              <FileImage className="h-16 w-16 mx-auto mb-3 opacity-40" />
              <p className="font-medium">اختر صفحة لعرضها</p>
            </div>
          )}
        </div>

        {selectedPage?.notes && (
          <div className="px-4 py-2 border-t border-border bg-[hsl(var(--accent)/0.3)] text-sm text-muted-foreground">
            📝 {selectedPage.notes}
          </div>
        )}
      </div>

      {/* ===== AI Chat FAB ===== */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 left-6 z-50 flex items-center gap-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-full px-5 py-3 shadow-xl hover:shadow-2xl hover:scale-105 transition-all"
        >
          <Bot className="h-5 w-5" />
          <span className="font-bold text-sm">اسأل الذكاء الاصطناعي</span>
        </button>
      )}

      {/* ===== AI Chat Panel (Slide-over) ===== */}
      {chatOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setChatOpen(false)} />

          {/* Chat panel */}
          <div className="relative mr-auto w-full max-w-md h-full bg-card shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
            {/* Chat header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-l from-[hsl(var(--primary))] to-[hsl(var(--primary)/0.9)]">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-[hsl(var(--primary-foreground)/0.2)] flex items-center justify-center">
                  <Bot className="h-5 w-5 text-[hsl(var(--primary-foreground))]" />
                </div>
                <span className="text-[hsl(var(--primary-foreground))] font-bold">اسأل الذكاء الاصطناعي</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost" size="icon"
                  className="text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary-foreground)/0.1)] h-8 w-8"
                  onClick={() => setAutoSpeak((v) => !v)}
                >
                  {autoSpeak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost" size="icon"
                  className="text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary-foreground)/0.1)] h-8 w-8"
                  onClick={() => setChatOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 px-4 py-2 border-b border-border bg-[hsl(var(--muted)/0.5)]">
              <Button variant="outline" size="sm" className="text-xs rounded-full" onClick={() => sendMessage("اشرح الصفحة دي")}>
                اشرح الصفحة
              </Button>
              <Button variant="outline" size="sm" className="text-xs rounded-full" onClick={() => sendMessage("أعد الشرح بطريقة أبسط")}>
                أعد الشرح
              </Button>
              <Button variant="outline" size="sm" className="text-xs rounded-full" onClick={() => sendMessage("وضح أكثر")}>
                وضح أكثر
              </Button>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4" ref={chatScrollRef}>
              <div className="space-y-4">
                {messages.map((m, idx) => (
                  <div key={idx} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                    {m.role === "assistant" && (
                      <div className="flex items-end gap-2 max-w-[88%]">
                        <div className="bg-[hsl(var(--muted))] rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                          <div className="prose prose-sm dark:prose-invert max-w-none text-[hsl(var(--foreground))]">
                            <ReactMarkdown>{m.content}</ReactMarkdown>
                          </div>
                          <div className="flex items-center gap-1 mt-2">
                            <button
                              onClick={() => speak(m.content)}
                              className="p-1 rounded hover:bg-[hsl(var(--accent))] transition-colors"
                              title="استمع"
                            >
                              <Volume2 className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                            </button>
                          </div>
                        </div>
                        <div className="h-7 w-7 rounded-full bg-[hsl(var(--primary))] flex items-center justify-center shrink-0 mb-1">
                          <Bot className="h-4 w-4 text-[hsl(var(--primary-foreground))]" />
                        </div>
                      </div>
                    )}
                    {m.role === "user" && (
                      <div className="max-w-[85%] bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--foreground))] rounded-2xl rounded-br-sm px-4 py-3">
                        <p className="text-sm">{m.content}</p>
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-end">
                    <div className="flex items-end gap-2">
                      <div className="bg-[hsl(var(--muted))] rounded-2xl rounded-bl-sm px-4 py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--primary))]" />
                      </div>
                      <div className="h-7 w-7 rounded-full bg-[hsl(var(--primary))] flex items-center justify-center shrink-0 mb-1">
                        <Bot className="h-4 w-4 text-[hsl(var(--primary-foreground))]" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="border-t border-border p-3 bg-card">
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2 items-center">
                <Button
                  type="button"
                  variant={isRecording ? "destructive" : "ghost"}
                  size="icon"
                  className={`shrink-0 rounded-full h-10 w-10 ${isRecording ? "animate-pulse" : ""}`}
                  onClick={isRecording ? stopRecording : handleStartRecording}
                >
                  {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="ابدأ الكتابة ..."
                  className="flex-1 rounded-full h-10 text-sm"
                  dir="rtl"
                />
                <Button
                  type="submit"
                  disabled={loading || !input.trim()}
                  size="icon"
                  className="shrink-0 rounded-full h-10 w-10 bg-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.9)] text-white"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
