import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import { Bot, FileImage, Loader2, Mic, PauseCircle, PlayCircle, RotateCcw, Send, Volume2, VolumeX } from "lucide-react";

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

  const chatScrollRef = useRef<HTMLDivElement>(null);

  const selectedLesson = useMemo(() => lessons.find((l) => l.id === selectedLessonId) || null, [lessons, selectedLessonId]);
  const selectedPage = useMemo(() => pages.find((p) => p.id === selectedPageId) || null, [pages, selectedPageId]);

  const getArabicVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    return voices.find((v) => v.lang.startsWith("ar")) || voices[0];
  };

  const speak = (text: string) => {
    if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_`>-]/g, " "));
    const voice = getArabicVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || "ar-SA";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

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

      const firstLessonId = lessonRows[0]?.id ?? null;
      setSelectedLessonId(firstLessonId);
      if (!firstLessonId) {
        setPages([]);
        setSelectedPageId(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLessons(false);
    }
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
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadLessons();
  }, [subjectId, groupId, subSubjectName]);

  useEffect(() => {
    if (!selectedLessonId) return;
    loadPages(selectedLessonId);
  }, [selectedLessonId]);

  useEffect(() => {
    const hello = subSubjectName
      ? `مرحباً 👋 أنا مساعدك الذكي في ${subSubjectName}. اختر الدرس والصفحة، وسأشرح لك بالصوت والنص خطوة بخطوة.`
      : `مرحباً 👋 أنا مساعدك الذكي في ${subjectName}. اختر الدرس والصفحة، وسأشرح لك بالصوت والنص خطوة بخطوة.`;
    setMessages([{ role: "assistant", content: hello }]);
  }, [subjectName, subSubjectName]);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages, loading]);

  const sendMessage = async (forcedText?: string) => {
    const userText = (forcedText ?? input).trim();
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
          stage,
          grade,
          section,
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
    } finally {
      setLoading(false);
    }
  };

  const repeatLast = () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant) speak(lastAssistant.content);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">الدروس والصفحات</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingLessons ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">لم يرفع المعلم دروس المساعد بعد</p>
          ) : (
            <ScrollArea className="h-[560px]">
              <div className="space-y-2">
                {lessons.map((lesson) => (
                  <button
                    key={lesson.id}
                    onClick={() => setSelectedLessonId(lesson.id)}
                    className={`w-full text-right p-3 rounded-md border transition-colors ${lesson.id === selectedLessonId ? "bg-primary/10 border-primary/30" : "hover:bg-accent"}`}
                  >
                    <p className="font-medium text-sm">{lesson.title}</p>
                    {lesson.id === selectedLessonId && (
                      <div className="mt-2 space-y-1">
                        {pages.map((p) => (
                          <button
                            key={p.id}
                            className={`block w-full text-right text-xs px-2 py-1 rounded ${p.id === selectedPageId ? "bg-primary text-primary-foreground" : "bg-accent"}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPageId(p.id);
                            }}
                          >
                            صفحة {p.page_number}{p.title ? ` - ${p.title}` : ""}
                          </button>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">عرض الشرح</CardTitle>
          {selectedPage && <Badge variant="secondary">صفحة {selectedPage.page_number}</Badge>}
        </CardHeader>
        <CardContent className="space-y-3">
          {selectedLesson && (
            <div className="p-3 rounded-md border bg-accent/30">
              <h3 className="font-semibold">{selectedLesson.title}</h3>
              {selectedLesson.description && <p className="text-sm text-muted-foreground mt-1">{selectedLesson.description}</p>}
            </div>
          )}

          <div className="rounded-lg border bg-background overflow-hidden min-h-[450px] flex items-center justify-center">
            {selectedPage ? (
              <img src={selectedPage.image_url} alt={selectedPage.title || `صفحة ${selectedPage.page_number}`} className="w-full h-full object-contain max-h-[580px]" loading="lazy" />
            ) : (
              <div className="text-center text-muted-foreground p-8">
                <FileImage className="h-10 w-10 mx-auto mb-2" />
                اختر صفحة لعرضها أمام الطالب
              </div>
            )}
          </div>

          {selectedPage?.notes && (
            <p className="text-sm text-muted-foreground">ملحوظة الصفحة: {selectedPage.notes}</p>
          )}
        </CardContent>
      </Card>

      <Card className="flex flex-col h-[700px]">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-md bg-primary">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <CardTitle className="text-base">المعلم الذكي التفاعلي</CardTitle>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setAutoSpeak((v) => !v)} title="تشغيل/إيقاف الصوت التلقائي">
                {autoSpeak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={repeatLast} title="إعادة آخر شرح">
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={isSpeaking ? stopSpeaking : repeatLast} title="تشغيل/إيقاف الصوت">
                {isSpeaking ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={() => sendMessage("أعد الشرح بطريقة أبسط")}>أعد الشرح</Button>
            <Button variant="outline" size="sm" onClick={() => sendMessage("وضح النقطة دي خطوة خطوة")}>وضح أكثر</Button>
          </div>
        </CardHeader>

        <ScrollArea className="flex-1 p-4" ref={chatScrollRef}>
          <div className="space-y-3">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[86%] rounded-2xl px-4 py-3 ${m.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-accent rounded-bl-sm"}`}>
                  {m.role === "assistant" ? <div className="prose prose-sm dark:prose-invert max-w-none"><ReactMarkdown>{m.content}</ReactMarkdown></div> : <p className="text-sm">{m.content}</p>}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-accent rounded-2xl rounded-bl-sm px-4 py-3"><Loader2 className="h-4 w-4 animate-spin" /></div>
              </div>
            )}
          </div>
        </ScrollArea>

        <CardContent className="border-t p-3">
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="اكتب: اشرح الصفحة دي / وضّح نقطة / إديني مثال" className="flex-1" dir="rtl" />
            <Button type="submit" disabled={loading || !input.trim()} size="icon"><Send className="h-4 w-4" /></Button>
            <Button type="button" variant="outline" size="icon" onClick={repeatLast}><Mic className="h-4 w-4" /></Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
