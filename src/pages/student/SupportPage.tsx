import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { invokeSupportAssistant } from "@/lib/supportAssistant";
import StudentLayout from "@/components/student/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import {
  Bot,
  Headset,
  ImagePlus,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Send,
  Sparkles,
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

/* ── Typing dots animation ── */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-2 w-2 rounded-full bg-primary/60"
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

export default function StudentSupportPage() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);

  const firstName = useMemo(() => {
    const fullName = String(user?.user_metadata?.full_name || "").trim();
    return fullName.split(" ")[0] || "يا بطل";
  }, [user?.user_metadata?.full_name]);

  const welcomeMessage = useMemo<UiMessage>(
    () => ({
      id: "welcome",
      role: "assistant",
      content: `أهلاً يا **${firstName}** 👋✨\nأنا مساعدك الذكي، هنا علشان أساعدك في أي حاجة داخل المنصة.\nلو عايز موظف دعم بشري قولي "حوّلني للدعم".`,
      createdAt: new Date().toISOString(),
    }),
    [firstName]
  );

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, []);

  useEffect(() => { setMessages([welcomeMessage]); }, [welcomeMessage]);
  useEffect(() => { scrollToBottom(); }, [messages, loading, scrollToBottom]);
  useEffect(() => {
    if (!showAttachmentMenu) return;
    const close = () => setShowAttachmentMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [showAttachmentMenu]);

  const appendMessage = useCallback((msg: UiMessage) => setMessages((p) => [...p, msg]), []);

  const buildConversationPayload = useCallback(
    (next: { text: string; imageUrl?: string | null }) => {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));

      if (next.imageUrl) {
        return [...history, { role: "user", content: [{ type: "text", text: next.text }, { type: "image_url", image_url: { url: next.imageUrl } }] }];
      }
      return [...history, { role: "user", content: next.text }];
    },
    [messages]
  );

  const streamAssistantReply = useCallback(
    async (payloadMessages: Array<{ role: string; content: unknown }>, fallbackText?: string, attachment?: { imageUrl?: string | null; audioUrl?: string | null }) => {
      if (!user) return;
      setLoading(true);

      try {
        const assistantContent = await invokeSupportAssistant({ messages: payloadMessages });
        const shouldEscalate = assistantContent.includes("[ESCALATE_TO_SUPPORT]");
        const cleaned = assistantContent.replace("[ESCALATE_TO_SUPPORT]", "").trim();

        if (shouldEscalate) {
          setEscalated(true);
          appendMessage({ id: `support-${Date.now()}`, role: "support", content: `${cleaned || "تم تحويلك للدعم البشري."}\n\n✅ تم تحويلك الآن إلى موظف دعم.`, createdAt: new Date().toISOString() });
          await supabase.from("support_messages").insert({ user_id: user.id, message: `[تحويل من المساعد]\n${fallbackText || ""}`, is_from_admin: false, file_url: attachment?.imageUrl || attachment?.audioUrl || null, file_type: attachment?.imageUrl ? "image" : attachment?.audioUrl ? "audio" : null, metadata: { source: "ai-escalation" } });
          return;
        }

        appendMessage({ id: `assistant-${Date.now()}`, role: "assistant", content: cleaned, createdAt: new Date().toISOString() });
      } catch (error: any) {
        console.error(error);
        toast.error(error?.message || "تعذر الوصول للمساعد الآن");
        appendMessage({ id: `err-${Date.now()}`, role: "assistant", content: "تعذر الرد الآن، حاول مرة أخرى بعد قليل.", createdAt: new Date().toISOString() });
      } finally {
        setLoading(false);
      }
    },
    [appendMessage, user]
  );

  const sendTextMessage = useCallback(async () => {
    if (!input.trim() || !user || loading) return;
    const text = input.trim();
    setInput("");
    appendMessage({ id: `user-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString() });

    if (escalated) {
      try {
        await supabase.from("support_messages").insert({ user_id: user.id, message: text, is_from_admin: false, metadata: { source: "human-support" } });
        appendMessage({ id: `sw-${Date.now()}`, role: "support", content: "تم إرسال رسالتك لموظف الدعم.", createdAt: new Date().toISOString() });
      } catch (e: any) { toast.error(e?.message || "تعذر إرسال الرسالة"); }
      return;
    }

    await streamAssistantReply(buildConversationPayload({ text }), text);
  }, [appendMessage, buildConversationPayload, escalated, input, loading, streamAssistantReply, user]);

  const uploadAttachment = useCallback(
    async (file: File, type: "image" | "audio") => {
      if (!user) return;
      setUploading(true);
      setShowAttachmentMenu(false);
      try {
        const path = supportFilePath(user.id, file.name);
        const { error: uploadError } = await supabase.storage.from(SUPPORT_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (uploadError) throw uploadError;
        const signedUrl = await signedSupportUrl(path);
        const text = type === "image" ? "أرفقت صورة للمشكلة" : "أرفقت تسجيلًا صوتيًا";
        appendMessage({ id: `ua-${Date.now()}`, role: "user", content: text, imageUrl: type === "image" ? signedUrl : null, audioUrl: type === "audio" ? signedUrl : null, createdAt: new Date().toISOString() });

        if (escalated) {
          await supabase.from("support_messages").insert({ user_id: user.id, message: text, is_from_admin: false, file_url: path, file_type: type, metadata: { source: "human-support" } });
          appendMessage({ id: `sc-${Date.now()}`, role: "support", content: "وصل المرفق لموظف الدعم.", createdAt: new Date().toISOString() });
          return;
        }

        if (type === "image") {
          await streamAssistantReply(buildConversationPayload({ text, imageUrl: signedUrl }), text, { imageUrl: path });
          return;
        }
        appendMessage({ id: `aa-${Date.now()}`, role: "assistant", content: "استلمت التسجيل 🎙️ أرسل صورة أو اكتب وصفًا وسأكمل معك.", createdAt: new Date().toISOString() });
      } catch (e: any) { console.error(e); toast.error(e?.message || "فشل رفع المرفق"); } finally { setUploading(false); }
    },
    [appendMessage, buildConversationPayload, escalated, streamAssistantReply, user]
  );

  const onChooseFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("صورة فقط"); return; }
    await uploadAttachment(file, "image");
    if (fileRef.current) fileRef.current.value = "";
  }, [uploadAttachment]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) { mediaRecorderRef.current?.stop(); setIsRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        await uploadAttachment(new File([blob], `record-${Date.now()}.webm`, { type: mimeType }), "audio");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch { toast.error("تعذر الوصول للميكروفون"); }
  }, [isRecording, uploadAttachment]);

  /* ── Avatar helper ── */
  const AvatarBubble = ({ emoji, glow }: { emoji: string; glow?: boolean }) => (
    <div className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base shadow-sm ${glow ? "bg-gradient-to-br from-primary/20 to-secondary/20 ring-2 ring-primary/30" : "bg-accent"}`}>
      {emoji}
      {glow && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-400 ring-2 ring-card" />}
    </div>
  );

  return (
    <StudentLayout title="المساعدة الذكية">
      <div className="mx-auto flex h-[calc(100dvh-3.5rem)] max-w-6xl flex-col p-3 lg:p-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* Sidebar – desktop only */}
          <Card className="hidden border-border/60 bg-card/90 shadow-sm lg:block">
            <CardContent className="space-y-5 p-5">
              <div className="space-y-3 text-right">
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-azhari">
                  {escalated ? <Headset className="h-7 w-7" /> : <Bot className="h-7 w-7" />}
                </div>
                <div>
                  <h2 className="text-lg font-black text-foreground">{escalated ? "موظف الدعم" : "المساعد الذكي"}</h2>
                  <p className="text-sm text-muted-foreground">{escalated ? "تم تحويل حالتك للدعم البشري." : "يرد على أسئلتك ويطلع على حالة حسابك."}</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-foreground">اقتراحات سريعة</p>
                <div className="flex flex-wrap gap-2">
                  {quickSuggestions.map((s) => (
                    <button key={s} onClick={() => setInput(s)} className="rounded-full bg-gradient-to-l from-accent to-accent/80 px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:brightness-95">{s}</button>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-border/70 bg-background p-4 text-right">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground"><Sparkles className="h-4 w-4 text-secondary" />القدرات</div>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li>• الاشتراك والإيداع والتنقل</li>
                  <li>• فهم صور المشكلات</li>
                  <li>• التحويل للدعم عند طلبك</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Main chat area */}
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-border/60 bg-card shadow-azhari">
            {/* Header */}
            <div className="border-b border-border/60 bg-gradient-to-l from-primary/5 to-transparent px-4 py-3 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <AvatarBubble emoji={escalated ? "🎧" : "🤖"} glow />
                  <div className="text-right">
                    <p className="text-sm font-black text-foreground">{escalated ? "موظف الدعم" : "المساعد الذكي"}</p>
                    <AnimatePresence mode="wait">
                      {loading ? (
                        <motion.p key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-primary font-medium">يكتب الآن...</motion.p>
                      ) : (
                        <motion.p key="online" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-muted-foreground">متصل الآن</motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <Badge className="rounded-full border-0 bg-gradient-to-l from-primary/15 to-secondary/15 text-primary font-bold">{escalated ? "دعم بشري" : "AI"}</Badge>
              </div>
            </div>

            {/* Messages */}
            <div ref={viewportRef} className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6" dir="rtl">
              <div className="mx-auto max-w-2xl space-y-4">
                {/* Quick suggestions on mobile */}
                {messages.length === 1 && (
                  <div className="rounded-[20px] border border-border/60 bg-card px-4 py-4 shadow-dashboard-soft lg:hidden">
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-secondary" />اقتراحات</div>
                    <div className="flex flex-wrap gap-2">
                      {quickSuggestions.map((s) => (
                        <button key={s} onClick={() => setInput(s)} className="rounded-full bg-gradient-to-l from-accent to-accent/80 px-3 py-1.5 text-xs font-medium text-accent-foreground hover:brightness-95">{s}</button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg) => {
                  const isUser = msg.role === "user";
                  const isSupport = msg.role === "support";
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className={`flex items-end gap-2 ${isUser ? "flex-row" : "flex-row-reverse"}`}
                    >
                      {/* Avatar */}
                      <AvatarBubble emoji={isUser ? "🙂" : isSupport ? "🎧" : "🤖"} glow={!isUser} />

                      {/* Bubble */}
                      <div className={`max-w-[82%] sm:max-w-[72%]`}>
                        <div className={`rounded-[22px] px-4 py-3 text-sm leading-7 shadow-sm ${
                          isUser
                            ? "rounded-tr-md bg-gradient-to-bl from-primary to-primary/90 text-primary-foreground"
                            : isSupport
                              ? "rounded-tl-md border border-secondary/25 bg-gradient-to-br from-secondary/10 to-secondary/5 text-foreground"
                              : "rounded-tl-md border border-border/60 bg-card text-foreground"
                        }`}>
                          {msg.imageUrl && <img src={msg.imageUrl} alt="مرفق" className="mb-3 max-h-56 w-full rounded-2xl object-contain" />}
                          {msg.audioUrl && <audio controls src={msg.audioUrl} className="mb-3 w-full" />}
                          {isUser ? (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          ) : (
                            <div className="prose prose-sm max-w-none text-right prose-p:my-1"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                          )}
                        </div>
                        <p className={`mt-1 px-2 text-[10px] text-muted-foreground ${isUser ? "text-right" : "text-left"}`}>
                          {isUser ? "أنت" : isSupport ? "موظف الدعم" : "المساعد الذكي"}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}

                {/* Typing indicator */}
                {loading && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2 flex-row-reverse">
                    <AvatarBubble emoji={escalated ? "🎧" : "🤖"} glow />
                    <div className="rounded-[22px] rounded-tl-md border border-border/60 bg-card px-4 py-3 shadow-sm">
                      <TypingDots />
                    </div>
                  </motion.div>
                )}

                <div ref={messagesEndRef} className="h-1" />
              </div>
            </div>

            {/* Input bar */}
            <div className="border-t border-border/60 bg-background/95 px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 backdrop-blur-sm lg:px-4">
              <div className="relative mx-auto max-w-2xl rounded-[24px] border border-border/70 bg-card p-1.5 shadow-dashboard-soft">
                {showAttachmentMenu && (
                  <div className="absolute bottom-[calc(100%+6px)] left-0 z-20 min-w-40 rounded-2xl border border-border bg-card p-1.5 shadow-azhari">
                    <button type="button" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors">
                      <ImagePlus className="h-4 w-4 text-primary" />رفع صورة
                    </button>
                  </div>
                )}

                <div className="flex items-end gap-1.5">
                  <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={(e) => { e.stopPropagation(); setShowAttachmentMenu((p) => !p); }} disabled={uploading || loading}>
                    <Plus className="h-5 w-5" />
                  </Button>

                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onChooseFile} />

                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendTextMessage(); } }}
                    placeholder={escalated ? "رسالتك لموظف الدعم..." : "اكتب رسالتك..."}
                    className="min-h-[44px] max-h-28 flex-1 resize-none rounded-[18px] border-0 bg-muted/30 px-4 py-2.5 text-sm leading-6 shadow-none focus-visible:ring-1"
                    dir="rtl"
                    rows={1}
                    disabled={loading}
                  />

                  <Button type="button" variant="ghost" size="icon" className={`h-10 w-10 shrink-0 rounded-full ${isRecording ? "bg-destructive text-destructive-foreground animate-pulse" : "text-muted-foreground hover:text-primary hover:bg-primary/10"}`} onClick={toggleRecording} disabled={uploading || loading}>
                    {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </Button>

                  <Button type="button" onClick={() => void sendTextMessage()} className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-primary to-primary/80 px-0 shadow-azhari hover:shadow-lg transition-shadow" disabled={loading || !input.trim()}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </StudentLayout>
  );
}
