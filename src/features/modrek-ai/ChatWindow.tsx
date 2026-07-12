import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Sparkles, FileText, GraduationCap, Volume2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  appendMessage,
  createConversation,
  getConversation,
  listMessages,
  toGatewayMessages,
  updateConversation,
} from "./store";
import { callExamsAssistant, callStudyAssistant } from "./api";
import type { AssistantType, ModrekConversation, ModrekMessage } from "./types";
import { synthesizeSpeech } from "@/lib/openrouterTts";

interface ChatWindowProps {
  assistantType: AssistantType;
  conversationId?: string;
  onConversationCreated?: (id: string) => void;
  initialContext?: Record<string, any>;
  headerTitle?: string;
  compact?: boolean;
}

export default function ModrekChatWindow({
  assistantType,
  conversationId,
  onConversationCreated,
  initialContext,
  headerTitle,
  compact,
}: ChatWindowProps) {
  const navigate = useNavigate();
  const [conv, setConv] = useState<ModrekConversation | null>(null);
  const [messages, setMessages] = useState<ModrekMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ttsPlayingId, setTtsPlayingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      if (conversationId) {
        const c = await getConversation(conversationId);
        setConv(c);
        if (c) setMessages(await listMessages(c.id));
      } else {
        setConv(null);
        setMessages([]);
      }
    })();
  }, [conversationId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [conversationId]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");

    try {
      let activeConv = conv;
      if (!activeConv) {
        const autoTitle = text.length > 40 ? text.slice(0, 40) + "…" : text;
        activeConv = await createConversation({
          assistant_type: assistantType,
          title: initialContext?.title || autoTitle,
          context_json: initialContext || {},
        });
        setConv(activeConv);
        onConversationCreated?.(activeConv.id);
      }

      const userMsg = await appendMessage(activeConv.id, {
        role: "user",
        parts: [{ type: "text", text }],
      });
      setMessages((prev) => [...prev, userMsg]);

      const history = await listMessages(activeConv.id);
      const gwMessages = toGatewayMessages(history);

      if (assistantType === "exams") {
        const result = await callExamsAssistant({
          messages: gwMessages,
          conversationContext: activeConv.context_json,
        });
        const replyText = result.reply || (result.examId ? `تم إنشاء الامتحان.` : "");
        const asstMsg = await appendMessage(activeConv.id, {
          role: "assistant",
          parts: [{ type: "text", text: replyText }],
          metadata: result.examId ? { examId: result.examId, title: result.title } : {},
        });
        setMessages((prev) => [...prev, asstMsg]);
        if (result.examId) {
          toast.success("تم إنشاء الامتحان");
          setTimeout(() => navigate(`/student/exams/${result.examId}/take`), 900);
        }
      } else {
        const result = await callStudyAssistant({
          messages: gwMessages,
          conversationContext: activeConv.context_json,
        });
        const asstMsg = await appendMessage(activeConv.id, {
          role: "assistant",
          parts: [{ type: "text", text: result.reply }],
        });
        setMessages((prev) => [...prev, asstMsg]);
      }
    } catch (e: any) {
      toast.error(e?.message || "حدث خطأ");
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const speak = async (id: string, text: string) => {
    if (ttsPlayingId === id) return;
    setTtsPlayingId(id);
    try {
      const clean = text.replace(/[#*_`~>]/g, "").replace(/\s+/g, " ").trim();
      const result = await synthesizeSpeech({ text: clean.slice(0, 3000) });
      const audio = new Audio(result.audioUrl);
      await audio.play();
      audio.onended = () => { setTtsPlayingId(null); result.revoke(); };
      return;
    } catch {
      toast.error("تعذر تشغيل الصوت");
    }
    setTtsPlayingId(null);
  };

  const ExamsIcon = assistantType === "exams" ? GraduationCap : Sparkles;

  return (
    <div className={`flex flex-col ${compact ? "h-[500px]" : "h-[calc(100dvh-140px)]"} bg-background`}>
      {(headerTitle || conv?.title) && (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
          <ExamsIcon className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold truncate">{headerTitle || conv?.title}</span>
          {conv?.context_json?.subject_name && (
            <Badge variant="secondary" className="text-xs">{conv.context_json.subject_name}</Badge>
          )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {messages.length === 0 && !sending && (
          <div className="text-center text-muted-foreground py-16">
            <ExamsIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              {assistantType === "exams"
                ? "اكتب مثلاً: امتحان في الفيزياء على الباب الأول"
                : "اسأل أي سؤال دراسي، أو ألصق صورة/PDF."}
            </p>
          </div>
        )}
        {messages.map((m) => {
          const text = m.parts.map((p: any) => p.type === "text" ? p.text : "").join("");
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <Card className="max-w-[85%] bg-primary text-primary-foreground px-4 py-2 whitespace-pre-wrap break-words">
                  {text}
                </Card>
              </div>
            );
          }
          const examId = (m.metadata as any)?.examId;
          return (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[92%] space-y-2">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                </div>
                {examId && (
                  <Button size="sm" onClick={() => navigate(`/student/exams/${examId}/take`)} className="gap-2">
                    <GraduationCap className="h-4 w-4" /> بدء الامتحان
                  </Button>
                )}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => speak(m.id, text)}
                    disabled={ttsPlayingId === m.id}
                    className="h-7 px-2 text-xs gap-1"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    {ttsPlayingId === m.id ? "..." : "استمع"}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="flex justify-start">
            <Card className="px-4 py-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> جاري التفكير...
            </Card>
          </div>
        )}
      </div>

      <div className="border-t p-3 flex gap-2 items-end bg-background">
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            assistantType === "exams"
              ? "اطلب امتحانًا... (Enter للإرسال)"
              : "اكتب سؤالك... (Enter للإرسال)"
          }
          className="flex-1 resize-none min-h-[44px] max-h-32"
          rows={1}
          disabled={sending}
        />
        <Button onClick={send} disabled={sending || !input.trim()} size="icon">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
