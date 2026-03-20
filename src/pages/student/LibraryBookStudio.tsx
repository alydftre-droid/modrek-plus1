import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import StudentLayout from "@/components/student/StudentLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getStudentLibrarySignedUrl } from "@/lib/studentLibrary";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Bot,
  ChevronRight,
  Loader2,
  Send,
  Volume2,
  VolumeX,
  BookOpen,
  ChevronLeft,
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

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function LibraryBookStudio() {
  const navigate = useNavigate();
  const { bookId } = useParams();
  const { user } = useAuth();
  const pdfRef = useRef<any>(null);
  const spokenUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastExplainedPageRef = useRef<number | null>(null);

  const [book, setBook] = useState<LibraryBook | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingBook, setLoadingBook] = useState(true);
  const [renderingPage, setRenderingPage] = useState(false);
  const [selectedPage, setSelectedPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "مرحباً 👋 افتح أي صفحة من الكتاب وسأشرحها لك نصاً وصوتاً، ويمكنك أيضاً سؤالي عن نفس الصفحة مباشرة.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    spokenUtteranceRef.current = null;
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;

    stopSpeaking();
    const voices = window.speechSynthesis.getVoices();
    const voice =
      voices.find((item) => item.lang === "ar-SA") ||
      voices.find((item) => item.lang.startsWith("ar")) ||
      null;

    const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_`>-]/g, " "));
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "ar-SA";
    }
    utterance.rate = 0.95;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    spokenUtteranceRef.current = utterance;
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [stopSpeaking]);

  const fetchBook = useCallback(async () => {
    if (!user || !bookId) return;
    setLoadingBook(true);

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

      const resolvedUrl = await getStudentLibrarySignedUrl(data.file_url);
      setBook(data as LibraryBook);
      setSignedUrl(resolvedUrl);
    } catch (error: any) {
      console.error("Library book fetch error:", error);
      toast.error("تعذر فتح هذا الكتاب");
      navigate("/my-library");
    } finally {
      setLoadingBook(false);
    }
  }, [bookId, navigate, user]);

  const loadPdf = useCallback(async () => {
    if (!signedUrl) return;

    try {
      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error("failed_to_fetch_pdf");
      const arrayBuffer = await response.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      pdfRef.current = pdf;
      setTotalPages(pdf.numPages);
      setSelectedPage((current) => Math.min(Math.max(current, 1), pdf.numPages));
    } catch (error) {
      console.error("PDF open error:", error);
      toast.error("فشل فتح ملف الكتاب");
    }
  }, [signedUrl]);

  const renderPage = useCallback(async (pageNumber: number) => {
    if (!pdfRef.current) return;
    setRenderingPage(true);

    try {
      const page = await pdfRef.current.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.45 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: context, viewport } as any).promise;
      const imageUrl = canvas.toDataURL("image/jpeg", 0.9);
      setPageImageUrl(imageUrl);
    } catch (error) {
      console.error("Page render error:", error);
      toast.error("تعذر عرض صفحة الكتاب");
    } finally {
      setRenderingPage(false);
    }
  }, []);

  useEffect(() => {
    if (user && bookId) {
      void fetchBook();
    }
  }, [bookId, fetchBook, user]);

  useEffect(() => {
    if (signedUrl) {
      void loadPdf();
    }
  }, [loadPdf, signedUrl]);

  useEffect(() => {
    if (totalPages > 0) {
      void renderPage(selectedPage);
    }
  }, [renderPage, selectedPage, totalPages]);

  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  const sendPrompt = useCallback(async (prompt: string, showUserMessage = true) => {
    if (!prompt.trim() || !pageImageUrl || sending) return;

    const nextMessages = showUserMessage
      ? [...messages, { role: "user" as const, content: prompt.trim() }]
      : messages;

    if (showUserMessage) {
      setMessages(nextMessages);
    }

    setSending(true);
    setInput("");

    try {
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          messages: [...nextMessages, ...(showUserMessage ? [] : [{ role: "user", content: prompt.trim() }])].slice(-12),
          subjectName: "مكتبتي الشخصية",
          lessonTitle: book?.title || "كتاب الطالب",
          pageNumber: selectedPage,
          pageTitle: `صفحة ${selectedPage}`,
          pageImageUrl,
          isLessonStudio: true,
        },
      });

      if (error) throw error;

      const responseText = (data as any)?.response || "عذراً، لم أتمكن من شرح الصفحة الآن.";
      setMessages((prev) => [...prev, { role: "assistant", content: responseText }]);
      void speak(responseText);
    } catch (error) {
      console.error("Library assistant error:", error);
      setMessages((prev) => [...prev, { role: "assistant", content: "حدث خطأ أثناء شرح هذه الصفحة، حاول مرة أخرى." }]);
      toast.error("تعذر شرح الصفحة حالياً");
    } finally {
      setSending(false);
    }
  }, [book?.title, messages, pageImageUrl, selectedPage, sending, speak]);

  useEffect(() => {
    if (!pageImageUrl || renderingPage || selectedPage === lastExplainedPageRef.current) return;
    lastExplainedPageRef.current = selectedPage;
    void sendPrompt("اشرح هذه الصفحة للطالب شرحاً بسيطاً وواضحاً.", false);
  }, [pageImageUrl, renderingPage, selectedPage, sendPrompt]);

  const visiblePageNumbers = useMemo(() => {
    if (!totalPages) return [];
    const start = Math.max(1, selectedPage - 2);
    const end = Math.min(totalPages, start + 4);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [selectedPage, totalPages]);

  if (loadingBook) {
    return (
      <StudentLayout title="مكتبتي">
        <div className="flex h-[65vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StudentLayout>
    );
  }

  if (!book) return null;

  return (
    <StudentLayout title="استوديو الكتاب الذكي">
      <div className="mx-auto max-w-5xl space-y-4 p-4 pb-20 lg:p-6">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/my-library")}>
            <ChevronRight className="h-4 w-4" /> رجوع للمكتبة
          </Button>
          <Badge className="rounded-full bg-secondary/15 text-secondary-foreground border-0 px-3 py-1">
            {totalPages || book.page_count || "--"} صفحة
          </Badge>
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <Card className="overflow-hidden border-border/60 bg-card shadow-azhari">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 text-right">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <h2 className="text-lg font-black text-foreground">{book.title}</h2>
                  <p className="text-xs text-muted-foreground">يمكنك التنقل بين الصفحات وسأشرح الصفحة الحالية تلقائياً.</p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 rounded-2xl"
                  onClick={() => {
                    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
                    if (!lastAssistant) return;
                    if (isSpeaking) stopSpeaking();
                    else void speak(lastAssistant.content);
                  }}
                >
                  {isSpeaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  {isSpeaking ? "إيقاف الصوت" : "استمع للشرح"}
                </Button>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/30 p-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-xl"
                  onClick={() => setSelectedPage((page) => Math.max(1, page - 1))}
                  disabled={selectedPage <= 1 || renderingPage}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="flex items-center gap-2 overflow-x-auto px-2">
                  {visiblePageNumbers.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setSelectedPage(pageNumber)}
                      className={`min-w-10 rounded-xl px-3 py-2 text-sm font-bold transition-all ${
                        pageNumber === selectedPage
                          ? "bg-primary text-primary-foreground shadow-azhari"
                          : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      {pageNumber}
                    </button>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-xl"
                  onClick={() => setSelectedPage((page) => Math.min(totalPages, page + 1))}
                  disabled={selectedPage >= totalPages || renderingPage}
                >
                  <ChevronRight className="h-4 w-4 rotate-180" />
                </Button>
              </div>

              <div className="overflow-hidden rounded-[1.75rem] border border-border/60 bg-muted/20">
                {renderingPage || !pageImageUrl ? (
                  <div className="flex min-h-[60vh] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <img
                    src={pageImageUrl}
                    alt={`${book.title} - صفحة ${selectedPage}`}
                    className="h-auto w-full object-contain"
                    loading="eager"
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/60 bg-card shadow-sm">
            <CardContent className="flex h-full min-h-[520px] flex-col p-0">
              <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="text-right">
                  <h3 className="text-sm font-black text-foreground">مساعد شرح الكتاب</h3>
                  <p className="text-[11px] text-muted-foreground">اسأل عن الصفحة الحالية أو استمع للشرح الصوتي</p>
                </div>
              </div>

              <ScrollArea className="flex-1 px-4 py-3">
                <div className="space-y-3">
                  {messages.map((message, index) => (
                    <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-7 ${
                          message.role === "user"
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-muted text-foreground rounded-bl-sm"
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  ))}

                  {sending && (
                    <div className="flex justify-end">
                      <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendPrompt(input);
                }}
                className="border-t border-border/60 p-3"
              >
                <div className="flex gap-2">
                  <Input
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="اسأل عن هذه الصفحة..."
                    className="rounded-2xl text-right"
                    dir="rtl"
                    disabled={sending || renderingPage || !pageImageUrl}
                  />
                  <Button type="submit" size="icon" className="rounded-2xl" disabled={sending || !input.trim() || !pageImageUrl}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </StudentLayout>
  );
}
