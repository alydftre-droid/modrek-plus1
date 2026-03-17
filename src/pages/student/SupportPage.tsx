import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/student/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import {
  Bot,
  Headset,
  ImagePlus,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Send,
  Sparkles,
  User,
} from "lucide-react";

type UiMessage = {
  id: string;
  role: "user" | "assistant" | "support";
  content: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  createdAt: string;
};

const quickSuggestions = [
  "كيف أشترك في مادة؟",
  "أين آخر إيداع لي؟",
  "كيف أغير كلمة السر؟",
  "ما آخر نشاط قمت به؟",
  "أريد التحدث مع الدعم",
];

const SUPPORT_BUCKET = "support-uploads";

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/_+/g, "_");
}

function supportFilePath(userId: string, fileName: string) {
  return `${userId}/${Date.now()}_${sanitizeFileName(fileName)}`;
}

async function signedSupportUrl(filePath: string) {
  const { data, error } = await supabase.storage.from(SUPPORT_BUCKET).createSignedUrl(filePath, 60 * 60 * 24);
  if (error || !data?.signedUrl) throw error || new Error("تعذر إنشاء رابط الملف");
  return data.signedUrl;
}

export default function StudentSupportPage() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const welcomeMessage = useMemo<UiMessage>(
    () => ({
      id: "welcome",
      role: "assistant",
      content:
        "أهلاً بك 👋 أنا **المساعد الذكي**. أقدر أساعدك في الاشتراك، الإيداع، كلمة السر، آخر نشاط، والمشاكل داخل المنصة. ولو احتجت موظف دعم سأحوّلك مباشرة.",
      createdAt: new Date().toISOString(),
    }),
    []
  );

  useEffect(() => {
    setMessages([welcomeMessage]);
  }, [welcomeMessage]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const appendMessage = useCallback((message: UiMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const streamAssistantReply = useCallback(
    async (payloadMessages: any[], fallbackText?: string, attachment?: { imageUrl?: string | null; audioUrl?: string | null }) => {
      if (!user) return;
      setLoading(true);

      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-assistant`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ messages: payloadMessages }),
        });

        if (!response.ok || !response.body) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || "فشل الاتصال بالمساعد");
        }

        const assistantId = `assistant-${Date.now()}`;
        let assistantContent = "";
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: "",
            createdAt: new Date().toISOString(),
          },
        ]);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;

        while (!done) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });

          let newlineIndex = buffer.indexOf("\n");
          while (newlineIndex !== -1) {
            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) {
              newlineIndex = buffer.indexOf("\n");
              continue;
            }

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") {
              done = true;
              break;
            }

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content as string | undefined;
              if (content) {
                assistantContent += content;
                setMessages((prev) =>
                  prev.map((msg) => (msg.id === assistantId ? { ...msg, content: assistantContent } : msg))
                );
              }
            } catch {
              buffer = `${line}\n${buffer}`;
              break;
            }

            newlineIndex = buffer.indexOf("\n");
          }
        }

        if (assistantContent.includes("[ESCALATE_TO_SUPPORT]")) {
          const cleaned = assistantContent.replace("[ESCALATE_TO_SUPPORT]", "").trim();
          setEscalated(true);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? {
                    ...msg,
                    role: "support",
                    content: `${cleaned}\n\n✅ تم تحويلك الآن إلى موظف دعم لمتابعة الحالة.`,
                  }
                : msg
            )
          );

          await supabase.from("support_messages").insert({
            user_id: user.id,
            message: `[تحويل تلقائي من المساعد]\n${fallbackText || ""}`,
            is_from_admin: false,
            file_url: attachment?.imageUrl || attachment?.audioUrl || null,
            file_type: attachment?.imageUrl ? "image" : attachment?.audioUrl ? "audio" : null,
            metadata: { source: "ai-escalation" },
          });
          return;
        }
      } catch (error: any) {
        console.error(error);
        toast.error(error?.message || "تعذر الوصول للمساعد الآن");
        appendMessage({
          id: `assistant-error-${Date.now()}`,
          role: escalated ? "support" : "assistant",
          content: escalated ? "حدث خطأ مؤقت في الدردشة، حاول إرسال رسالتك مرة أخرى." : "تعذر الرد الآن، حاول مرة أخرى بعد قليل.",
          createdAt: new Date().toISOString(),
        });
      } finally {
        setLoading(false);
      }
    },
    [appendMessage, escalated, user]
  );

  const sendTextMessage = useCallback(async () => {
    if (!input.trim() || !user || loading) return;
    const text = input.trim();
    setInput("");

    appendMessage({
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    });

    if (escalated) {
      try {
        const { error } = await supabase.from("support_messages").insert({
          user_id: user.id,
          message: text,
          is_from_admin: false,
          metadata: { source: "human-support" },
        });
        if (error) throw error;
        appendMessage({
          id: `support-wait-${Date.now()}`,
          role: "support",
          content: "تم إرسال رسالتك لموظف الدعم، وسيتم الرد عليك هنا.",
          createdAt: new Date().toISOString(),
        });
      } catch (error: any) {
        toast.error(error?.message || "تعذر إرسال الرسالة للدعم");
      }
      return;
    }

    await streamAssistantReply([
      ...messages
        .filter((msg) => msg.id !== "welcome")
        .map((msg) => ({ role: msg.role === "user" ? "user" : "assistant", content: msg.content })),
      { role: "user", content: text },
    ], text);
  }, [appendMessage, escalated, input, loading, messages, streamAssistantReply, user]);

  const uploadAttachment = useCallback(
    async (file: File, type: "image" | "audio") => {
      if (!user) return;
      setUploading(true);

      try {
        const path = supportFilePath(user.id, file.name);
        const { error: uploadError } = await supabase.storage.from(SUPPORT_BUCKET).upload(path, file, {
          upsert: false,
          contentType: file.type || undefined,
        });
        if (uploadError) throw uploadError;

        const url = await signedSupportUrl(path);
        const text = type === "image" ? "أرفقت صورة للمشكلة" : "أرفقت تسجيلًا صوتيًا للمشكلة";

        appendMessage({
          id: `user-attachment-${Date.now()}`,
          role: "user",
          content: text,
          imageUrl: type === "image" ? url : null,
          audioUrl: type === "audio" ? url : null,
          createdAt: new Date().toISOString(),
        });

        if (escalated) {
          const { error } = await supabase.from("support_messages").insert({
            user_id: user.id,
            message: text,
            is_from_admin: false,
            file_url: path,
            file_type: type,
            metadata: { source: "human-support" },
          });
          if (error) throw error;
          appendMessage({
            id: `support-confirm-${Date.now()}`,
            role: "support",
            content: "وصل المرفق لموظف الدعم بنجاح.",
            createdAt: new Date().toISOString(),
          });
          return;
        }

        if (type === "image") {
          await streamAssistantReply(
            [
              ...messages
                .filter((msg) => msg.id !== "welcome")
                .map((msg) => ({ role: msg.role === "user" ? "user" : "assistant", content: msg.content })),
              {
                role: "user",
                content: [
                  { type: "text", text: "هذه صورة للمشكلة الحالية، حللها واشرح لي السبب والحل خطوة بخطوة." },
                  { type: "image_url", image_url: { url } },
                ],
              },
            ],
            text,
            { imageUrl: path }
          );
        } else {
          appendMessage({
            id: `assistant-audio-${Date.now()}`,
            role: "assistant",
            content: "استلمت التسجيل الصوتي. إذا أردت تحليلًا فوريًا، اكتب ملخصًا قصيرًا للمشكلة أو اطلب التحويل للدعم البشري.",
            createdAt: new Date().toISOString(),
          });
        }
      } catch (error: any) {
        console.error(error);
        toast.error(error?.message || "فشل رفع المرفق");
      } finally {
        setUploading(false);
      }
    },
    [appendMessage, escalated, messages, streamAssistantReply, user]
  );

  const onChooseFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.error("يرجى اختيار صورة فقط");
        return;
      }
      await uploadAttachment(file, "image");
      if (fileRef.current) fileRef.current.value = "";
    },
    [uploadAttachment]
  );

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const file = new File([blob], `support-record-${Date.now()}.webm`, { type: mimeType });
        await uploadAttachment(file, "audio");
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      toast.error("تعذر الوصول للميكروفون");
    }
  }, [isRecording, uploadAttachment]);

  return (
    <StudentLayout title="المساعدة الذكية">
      <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-6xl flex-col p-3 lg:p-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid flex-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="hidden border-border/60 bg-card/90 shadow-sm lg:block">
            <CardContent className="space-y-5 p-5">
              <div className="space-y-3 text-right">
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-azhari">
                  {escalated ? <Headset className="h-7 w-7" /> : <Bot className="h-7 w-7" />}
                </div>
                <div>
                  <h2 className="text-lg font-black text-foreground">{escalated ? "موظف الدعم" : "المساعد الذكي"}</h2>
                  <p className="text-sm text-muted-foreground">
                    {escalated ? "تم تحويل حالتك للدعم البشري ومتابعتها هنا." : "يرد على أسئلتك ويفهم مشكلتك ويطلع على حالة حسابك."}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-foreground">اقتراحات سريعة</p>
                <div className="flex flex-wrap gap-2">
                  {quickSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setInput(suggestion)}
                      className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/80"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-border/70 bg-background p-4 text-right">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
                  <Sparkles className="h-4 w-4 text-secondary" />
                  القدرات الحالية
                </div>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li>• المساعدة في الاشتراك والإيداع والتنقل داخل المنصة</li>
                  <li>• فهم صور المشكلات المرفوعة من الطالب</li>
                  <li>• تحويلك مباشرة للدعم البشري عند الحاجة</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-border/60 bg-card shadow-azhari">
            <div className="border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-azhari">
                    {escalated ? <Headset className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-foreground">{escalated ? "موظف الدعم متصل" : "المساعد الذكي متصل"}</p>
                    <p className="text-xs text-muted-foreground">{loading ? "يكتب الآن..." : "جاهز للمساعدة"}</p>
                  </div>
                </div>
                <Badge className="rounded-full border-0 bg-secondary/15 text-secondary-foreground">
                  {escalated ? "دعم بشري" : "AI Support"}
                </Badge>
              </div>
            </div>

            <ScrollArea className="flex-1 bg-background/40">
              <div ref={scrollRef} className="space-y-4 p-4 lg:p-6" dir="rtl">
                {messages.map((message) => {
                  const isUser = message.role === "user";
                  const isSupport = message.role === "support";
                  return (
                    <div key={message.id} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[92%] sm:max-w-[78%] ${isUser ? "order-2" : "order-1"}`}>
                        <div className="mb-1 flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
                          {isUser ? <User className="h-3.5 w-3.5" /> : isSupport ? <Headset className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                          <span>{isUser ? "أنت" : isSupport ? "موظف الدعم" : "المساعد الذكي"}</span>
                        </div>
                        <div
                          className={`rounded-3xl px-4 py-3 shadow-sm ${
                            isUser
                              ? "rounded-tr-md bg-primary text-primary-foreground"
                              : isSupport
                                ? "rounded-tl-md bg-secondary/15 text-foreground"
                                : "rounded-tl-md bg-card text-foreground border border-border/70"
                          }`}
                        >
                          {message.imageUrl && (
                            <img src={message.imageUrl} alt="مرفق" className="mb-3 max-h-72 w-full rounded-2xl object-contain" />
                          )}
                          {message.audioUrl && <audio controls src={message.audioUrl} className="mb-3 w-full" />}
                          {isUser ? (
                            <p className="text-sm leading-7 whitespace-pre-wrap">{message.content}</p>
                          ) : (
                            <div className="prose prose-sm max-w-none text-right leading-7 prose-p:my-1">
                              <ReactMarkdown>{message.content}</ReactMarkdown>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {loading && (
                  <div className="flex justify-end">
                    <div className="rounded-3xl rounded-tl-md border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {escalated ? "موظف الدعم يكتب..." : "المساعد يكتب..."}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="border-t border-border/60 bg-background px-3 py-3 lg:px-4">
              <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> يمكنك إرسال صورة للمشكلة</span>
                <span className="inline-flex items-center gap-1"><Mic className="h-3.5 w-3.5" /> أو تسجيل صوتي</span>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" className="rounded-2xl" onClick={() => fileRef.current?.click()} disabled={uploading || loading}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                </Button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onChooseFile} />

                <Button type="button" variant="outline" size="icon" className="rounded-2xl" onClick={toggleRecording} disabled={uploading || loading}>
                  {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>

                <Input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void sendTextMessage();
                    }
                  }}
                  placeholder={escalated ? "اكتب رسالتك لموظف الدعم..." : "اكتب مشكلتك أو سؤالك هنا..."}
                  className="h-12 rounded-2xl border-border/70 bg-muted/40 text-right"
                  dir="rtl"
                  disabled={loading}
                />
                <Button type="button" onClick={() => void sendTextMessage()} className="h-12 rounded-2xl px-4" disabled={loading || !input.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </StudentLayout>
  );
}
