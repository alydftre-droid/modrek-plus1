import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { streamEdgeFunction } from "@/lib/aiStream";
import { clearDraftValue, loadDraftValue, saveDraftValue } from "@/lib/mobileRuntime";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  Bot,
  Send,
  Loader2,
  BookOpen,
  Settings,
  MessageSquare,
  Plus,
  Trash2,
  ChevronLeft,
  Menu,
  Upload,
  FileText,
} from "lucide-react";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";

type Message = { role: "user" | "assistant"; content: string };
type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type SubjectRow = {
  id: string;
  name: string;
  stage: string;
  grade: string;
  section: string | null;
};

function stageLabel(stage: string) {
  if (stage === "preparatory") return "المرحلة الإعدادية";
  if (stage === "secondary") return "المرحلة الثانوية";
  return "";
}

function gradeLabel(grade: string) {
  if (grade === "first") return "الصف الأول";
  if (grade === "second") return "الصف الثاني";
  if (grade === "third") return "الصف الثالث";
  return "";
}

const SubjectAiChat = () => {
  const navigate = useNavigate();
  const { subjectId: paramSubjectId } = useParams();
  const [searchParams] = useSearchParams();
  const subjectId = paramSubjectId || searchParams.get("subjectId") || undefined;
  const { user, role, isLoading: authLoading } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [studentEducationType, setStudentEducationType] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [subjectLoading, setSubjectLoading] = useState(true);
  const [uploadingSource, setUploadingSource] = useState(false);
  const [providerMeta, setProviderMeta] = useState<{ provider?: string; model?: string | null; fallback?: boolean } | null>(null);

  const isAdmin = role === "admin";
  const draftKey = `subject-ai-chat-draft-${subjectId || "none"}-${currentConversationId || "new"}`;

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    setInput(loadDraftValue(draftKey));
  }, [draftKey]);

  useEffect(() => {
    saveDraftValue(draftKey, input);
  }, [draftKey, input]);

  // Fetch subject info and student profile
  useEffect(() => {
    const fetchSubjectAndProfile = async () => {
      if (!subjectId) return;
      setSubjectLoading(true);
      try {
        const [subjectRes, profileRes] = await Promise.all([
          supabase.from("subjects").select("id, name, stage, grade, section").eq("id", subjectId).maybeSingle(),
          user ? supabase.from("profiles").select("education_type").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        if (subjectRes.error) throw subjectRes.error;
        setSubject(subjectRes.data as SubjectRow | null);
        if (profileRes.data) setStudentEducationType((profileRes.data as any).education_type || null);
      } catch (e) {
        console.error(e);
        toast.error("فشل تحميل المادة");
      } finally {
        setSubjectLoading(false);
      }
    };
    fetchSubjectAndProfile();
  }, [subjectId, user]);

  // Load conversations for this subject
  useEffect(() => {
    const loadConversations = async () => {
      if (!user || !subjectId) return;

      const { data, error } = await supabase
        .from("ai_conversations")
        .select("id, title, created_at, updated_at")
        .eq("user_id", user.id)
        .eq("subject_id", subjectId)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error loading conversations:", error);
        return;
      }

      setConversations((data as Conversation[]) || []);
    };

    loadConversations();
  }, [user, subjectId]);

  // Load messages for current conversation
  useEffect(() => {
    const loadMessages = async () => {
      if (!currentConversationId) {
        if (subject) {
          setMessages([
            {
              role: "assistant",
              content: `مرحباً! 👋 أنا مساعدك الذكي في مادة **${subject.name}**.\n\nاسألني أي سؤال عن المادة وسأساعدك في الفهم والشرح! 📚✨`,
            },
          ]);
        }
        return;
      }

      const { data, error } = await supabase
        .from("ai_messages")
        .select("role, content")
        .eq("conversation_id", currentConversationId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error loading messages:", error);
        return;
      }

      if (data && data.length > 0) {
        setMessages(data as Message[]);
      }
    };

    loadMessages();
  }, [currentConversationId, subject]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const createNewConversation = async (): Promise<string | null> => {
    if (!user || !subjectId) return null;

    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({
        user_id: user.id,
        subject_id: subjectId,
        title: "محادثة جديدة",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating conversation:", error);
      toast.error("فشل إنشاء المحادثة");
      return null;
    }

    setConversations((prev) => [data as Conversation, ...prev]);
    return data.id;
  };

  const startNewChat = () => {
    setCurrentConversationId(null);
    if (subject) {
      setMessages([
        {
          role: "assistant",
          content: `مرحباً! 👋 أنا مساعدك الذكي في مادة **${subject.name}**.\n\nاسألني أي سؤال عن المادة وسأساعدك في الفهم والشرح! 📚✨`,
        },
      ]);
    }
    setSidebarOpen(false);
  };

  const selectConversation = (id: string) => {
    setCurrentConversationId(id);
    setSidebarOpen(false);
  };

  const deleteConversation = async (id: string) => {
    const { error } = await supabase.from("ai_conversations").delete().eq("id", id);

    if (error) {
      toast.error("فشل حذف المحادثة");
      return;
    }

    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (currentConversationId === id) {
      startNewChat();
    }
    toast.success("تم حذف المحادثة");
  };

  const updateConversationTitle = async (id: string, firstMessage: string) => {
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : "");

    await supabase.from("ai_conversations").update({ title }).eq("id", id);

    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  };

  const handleSend = async () => {
    if (!input.trim() || loading || !user) return;

    const userMessage = input.trim();
    const isFirstMessage = messages.filter((m) => m.role === "user").length === 0;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      let conversationId = currentConversationId;

      if (!conversationId) {
        conversationId = await createNewConversation();
        if (!conversationId) throw new Error("Failed to create conversation");
        setCurrentConversationId(conversationId);
      }

      // Save user message
      await supabase.from("ai_messages").insert({
        conversation_id: conversationId,
        role: "user",
        content: userMessage,
      });

      if (isFirstMessage) {
        await updateConversationTitle(conversationId, userMessage);
      }

      let aggregate = "";
      const result = await streamEdgeFunction("ai-chat", {
        messages: [...messages.filter((m) => m.role !== "assistant" || messages.indexOf(m) > 0), { role: "user", content: userMessage }].slice(-16),
        subjectName: subject?.name,
        subjectId,
        stage: subject?.stage,
        grade: subject?.grade,
        section: subject?.section,
        educationType: studentEducationType,
      }, {
        onDelta: (_delta, full) => {
          aggregate = full;
          setMessages((prev) => {
            const assistantMessage: Message = { role: "assistant", content: full };
            const last = prev[prev.length - 1];
            return last?.role === "assistant" ? [...prev.slice(0, -1), assistantMessage] : [...prev, assistantMessage];
          });
        },
      });
      setProviderMeta({ provider: result.provider, model: result.model, fallback: result.fallback });
      const aiResponse = (result.content || aggregate).trim() || "عذراً، لم أتمكن من الرد.";

      // Save AI response
      await supabase.from("ai_messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: aiResponse,
      });

      setMessages((prev) => prev[prev.length - 1]?.role === "assistant" ? [...prev.slice(0, -1), { role: "assistant", content: aiResponse }] : [...prev, { role: "assistant", content: aiResponse }]);

      // Update conversation timestamp
      await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
      clearDraftValue(draftKey);
    } catch (error) {
      console.error("AI chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "عذراً، حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى. 🔄",
        },
      ]);
      toast.error("فشل الاتصال بالمساعد");
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSource = useCallback(async () => {
    if (!isAdmin || !subjectId) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      if (file.size > 20 * 1024 * 1024) {
        toast.error("حجم الملف كبير جداً (الحد الأقصى 20MB)");
        return;
      }

      setUploadingSource(true);
      try {
        const { uploadDocument } = await import("@/lib/storage");
        const stored = await uploadDocument({
          scope: { kind: "main" },
          category: `ai-sources/${subjectId}`,
          file,
        });

        const { error: dbError } = await supabase.from("ai_sources").insert({
          subject_id: subjectId,
          uploaded_by: user?.id,
          file_name: file.name,
          file_url: stored.url,
        });

        if (dbError) throw dbError;

        toast.success("تم رفع الكتاب بنجاح! سيتم استخدامه لتحسين إجابات المساعد الذكي.");
      } catch (error) {
        console.error("Upload error:", error);
        toast.error("فشل رفع الملف");
      } finally {
        setUploadingSource(false);
      }
    };
    input.click();
  }, [isAdmin, subjectId, user?.id]);

  if (authLoading || subjectLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full p-6 text-center">
          <h2 className="text-lg font-semibold">المادة غير موجودة</h2>
          <Button className="mt-4" onClick={() => navigate("/subjects")}>
            رجوع للمواد
          </Button>
        </Card>
      </div>
    );
  }

  const subtitle = `${stageLabel(subject.stage)} - ${gradeLabel(subject.grade)}`;

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 p-0">
                <SheetHeader className="p-4 border-b">
                  <SheetTitle className="text-right">المحادثات</SheetTitle>
                </SheetHeader>

                <div className="p-4">
                  <Button onClick={startNewChat} className="w-full gap-2 mb-4">
                    <Plus className="h-4 w-4" />
                    محادثة جديدة
                  </Button>

                  {isAdmin && (
                    <Button
                      variant="outline"
                      onClick={handleUploadSource}
                      disabled={uploadingSource}
                      className="w-full gap-2 mb-4"
                    >
                      {uploadingSource ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      رفع كتاب للمساعد الذكي
                    </Button>
                  )}
                </div>

                <ScrollArea className="flex-1 h-[calc((var(--app-vh,1vh)*100)-200px)]">
                  <div className="p-4 pt-0 space-y-2">
                    {conversations.length === 0 ? (
                      <p className="text-center text-muted-foreground text-sm py-8">
                        لا توجد محادثات سابقة
                      </p>
                    ) : (
                      conversations.map((conv) => (
                        <div
                          key={conv.id}
                          className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                            currentConversationId === conv.id
                              ? "bg-primary/10 border border-primary/30"
                              : "hover:bg-accent"
                          }`}
                          onClick={() => selectConversation(conv.id)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="text-sm truncate">{conv.title}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteConversation(conv.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-sm font-semibold">{subject.name}</h1>
                <p className="text-xs text-muted-foreground">{subtitle}</p>
                {providerMeta?.provider && (
                  <p className="text-[10px] text-muted-foreground/80">
                    {providerMeta.provider === "gemini" ? "Gemini" : "Fallback"}
                    {providerMeta.model ? ` • ${providerMeta.model}` : ""}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUploadSource}
                disabled={uploadingSource}
                className="hidden sm:flex gap-2"
              >
                {uploadingSource ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                رفع كتاب PDF
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/subject/${subjectId}`)}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4 rotate-180" />
              <span className="hidden sm:inline">رجوع للمادة</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <ScrollArea ref={scrollRef} className="flex-1 p-4">
          <div className="max-w-3xl mx-auto space-y-4 pb-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[85%] min-w-0 rounded-2xl p-4 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted rounded-bl-sm"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <ChatMarkdown content={msg.content} />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-end">
                <div className="bg-muted rounded-2xl rounded-bl-sm p-4 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">جاري التفكير...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t bg-background p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <div className="max-w-3xl mx-auto">
            <form
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex items-end gap-2 bg-background border-2 border-border rounded-2xl p-2 focus-within:border-primary transition-colors min-w-0"
            >
              <Textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  const el = e.target as HTMLTextAreaElement;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 200) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                placeholder="اكتب سؤالك هنا... (Shift+Enter لسطر جديد)"
                disabled={loading}
                className="flex-1 min-w-0 w-full resize-none overflow-y-auto overflow-x-hidden break-words whitespace-pre-wrap border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[44px] max-h-[200px] text-base leading-relaxed py-2 px-2 [overflow-wrap:anywhere]"
                dir="rtl"
              />
              <Button type="submit" size="icon" disabled={loading || !input.trim()} className="shrink-0 rounded-xl h-10 w-10">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground text-center mt-2">
              المساعد الذكي قد يخطئ أحياناً. تحقق من المعلومات المهمة.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubjectAiChat;
