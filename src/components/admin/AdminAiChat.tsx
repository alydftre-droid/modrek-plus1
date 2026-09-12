import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { invokeEdgeFunctionJson } from "@/lib/aiStream";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import {
  Bot,
  Send,
  Loader2,
  MessageSquare,
  Plus,
  Trash2,
  Upload,
  FileText,
  Command,
  Sparkles,
  Download,
  X,
  Save,
} from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };
type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type AiSource = {
  id: string;
  file_name: string;
  file_url: string;
  created_at: string | null;
};

type AdminInstruction = {
  id: string;
  instruction: string;
  created_at: string;
  is_active: boolean;
};

interface AdminAiChatProps {
  subjectId: string;
  subjectName: string;
  stage: string;
  grade: string;
  section: string | null;
}

const AdminAiChat = ({ subjectId, subjectName, stage, grade, section }: AdminAiChatProps) => {
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingSource, setUploadingSource] = useState(false);
  
  // AI Sources
  const [aiSources, setAiSources] = useState<AiSource[]>([]);
  
  // Admin Instructions
  const [instructions, setInstructions] = useState<AdminInstruction[]>([]);
  const [newInstruction, setNewInstruction] = useState("");
  const [savingInstruction, setSavingInstruction] = useState(false);
  
  // View mode
  const [activeTab, setActiveTab] = useState<"chat" | "sources" | "instructions">("chat");

  // Fetch AI sources
  const fetchAiSources = useCallback(async () => {
    if (!subjectId) return;
    const { data, error } = await supabase
      .from("ai_sources")
      .select("id, file_name, file_url, created_at")
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: false });
    if (!error && data) {
      setAiSources(data);
    }
  }, [subjectId]);

  // Fetch admin instructions
  const fetchInstructions = useCallback(async () => {
    if (!subjectId) return;
    const { data, error } = await supabase
      .from("ai_admin_instructions")
      .select("id, instruction, created_at, is_active")
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: false });
    if (!error && data) {
      setInstructions(data);
    }
  }, [subjectId]);

  useEffect(() => {
    fetchAiSources();
    fetchInstructions();
  }, [fetchAiSources, fetchInstructions]);

  // Load conversations
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

  // Load messages
  useEffect(() => {
    const loadMessages = async () => {
      if (!currentConversationId) {
        setMessages([
          {
            role: "assistant",
            content: `مرحباً! 👋 أنا مساعدك الذكي في مادة **${subjectName}**.\n\nأنت الآن في وضع المطور. يمكنك:\n- **إعطائي تعليمات** لأتبعها مع الطلاب\n- **رفع كتب PDF** لأستخرج منها المعلومات\n- **طرح أي سؤال** وسأجيبك\n\nجرب مثلاً: "عندما يسألك طالب عن الامتحانات أخبره أنها ستكون الأسبوع القادم"`,
          },
        ]);
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
  }, [currentConversationId, subjectName]);

  // Scroll to bottom
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
        title: "محادثة المطور",
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
    setMessages([
      {
        role: "assistant",
        content: `مرحباً! 👋 أنا مساعدك الذكي في مادة **${subjectName}**.\n\nأنت الآن في وضع المطور. يمكنك:\n- **إعطائي تعليمات** لأتبعها مع الطلاب\n- **رفع كتب PDF** لأستخرج منها المعلومات\n- **طرح أي سؤال** وسأجيبك`,
      },
    ]);
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
        const title = userMessage.slice(0, 50) + (userMessage.length > 50 ? "..." : "");
        await supabase.from("ai_conversations").update({ title }).eq("id", conversationId);
        setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, title } : c)));
      }

      // Call canonical AI backend with admin context
      const data = await invokeEdgeFunctionJson("ai-chat", {
          messages: [...messages.filter((m) => m.role !== "assistant" || messages.indexOf(m) > 0), { role: "user", content: userMessage }].slice(-16),
          subjectName,
          subjectId,
          stage,
          grade,
          section,
          isAdmin: true,
      });

      const aiResponse = (data as any)?.response || "عذراً، لم أتمكن من الرد.";

      // Save AI response
      await supabase.from("ai_messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: aiResponse,
      });

      setMessages((prev) => [...prev, { role: "assistant", content: aiResponse }]);

      await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
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

  const handleUploadSource = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !subjectId) return;

    if (file.type !== "application/pdf") {
      toast.error("يجب أن يكون الملف PDF");
      return;
    }

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

      const { error: insertError } = await supabase.from("ai_sources").insert({
        subject_id: subjectId,
        file_name: file.name,
        file_url: stored.url,
        uploaded_by: user?.id,
      });
      if (insertError) throw insertError;

      toast.success("تم رفع الكتاب بنجاح!");
      fetchAiSources();
    } catch (err) {
      console.error(err);
      toast.error("فشل رفع الملف");
    } finally {
      setUploadingSource(false);
      e.target.value = "";
    }
  };

  const handleDeleteSource = async (source: AiSource) => {
    if (!confirm("هل أنت متأكد من حذف هذا الكتاب؟")) return;

    try {
      const { deleteFile } = await import("@/lib/storage");
      await deleteFile(source.file_url).catch(() => false);

      const { error } = await supabase.from("ai_sources").delete().eq("id", source.id);
      if (error) throw error;

      toast.success("تم حذف الكتاب");
      fetchAiSources();
    } catch (err) {
      console.error(err);
      toast.error("فشل حذف الكتاب");
    }
  };

  const handleAddInstruction = async () => {
    if (!newInstruction.trim() || !subjectId || !user) return;

    setSavingInstruction(true);
    try {
      const { error } = await supabase.from("ai_admin_instructions").insert({
        subject_id: subjectId,
        instruction: newInstruction.trim(),
        created_by: user.id,
      });

      if (error) throw error;

      toast.success("تم حفظ التعليمات!");
      setNewInstruction("");
      fetchInstructions();
    } catch (err) {
      console.error(err);
      toast.error("فشل حفظ التعليمات");
    } finally {
      setSavingInstruction(false);
    }
  };

  const handleDeleteInstruction = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه التعليمات؟")) return;

    try {
      const { error } = await supabase.from("ai_admin_instructions").delete().eq("id", id);
      if (error) throw error;

      toast.success("تم حذف التعليمات");
      fetchInstructions();
    } catch (err) {
      console.error(err);
      toast.error("فشل حذف التعليمات");
    }
  };

  const toggleInstructionActive = async (id: string, currentState: boolean) => {
    try {
      const { error } = await supabase
        .from("ai_admin_instructions")
        .update({ is_active: !currentState })
        .eq("id", id);
      if (error) throw error;

      fetchInstructions();
    } catch (err) {
      console.error(err);
      toast.error("فشل تحديث الحالة");
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={activeTab === "chat" ? "default" : "outline"}
          onClick={() => setActiveTab("chat")}
          className="gap-2"
        >
          <MessageSquare className="h-4 w-4" />
          المحادثة
        </Button>
        <Button
          variant={activeTab === "sources" ? "default" : "outline"}
          onClick={() => setActiveTab("sources")}
          className="gap-2"
        >
          <FileText className="h-4 w-4" />
          الكتب المرفوعة
          <Badge variant="secondary" className="mr-1">{aiSources.length}</Badge>
        </Button>
        <Button
          variant={activeTab === "instructions" ? "default" : "outline"}
          onClick={() => setActiveTab("instructions")}
          className="gap-2"
        >
          <Command className="h-4 w-4" />
          التعليمات
          <Badge variant="secondary" className="mr-1">{instructions.filter(i => i.is_active).length}</Badge>
        </Button>
      </div>

      {/* Chat Tab */}
      {activeTab === "chat" && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Sidebar */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                المحادثات
                <Button variant="ghost" size="icon" onClick={startNewChat}>
                  <Plus className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <ScrollArea className="h-[300px]">
                <div className="space-y-1">
                  {conversations.length === 0 ? (
                    <p className="text-center text-muted-foreground text-xs py-4">
                      لا توجد محادثات
                    </p>
                  ) : (
                    conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-sm ${
                          currentConversationId === conv.id
                            ? "bg-primary/10 border border-primary/30"
                            : "hover:bg-accent"
                        }`}
                        onClick={() => setCurrentConversationId(conv.id)}
                      >
                        <span className="truncate flex-1">{conv.title}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConversation(conv.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Chat Area */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                المساعد الذكي - وضع المطور
                <Sparkles className="h-4 w-4 text-yellow-500" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea ref={scrollRef} className="h-[350px] p-4">
                <div className="space-y-4">
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-muted rounded-tl-sm"
                        }`}
                      >
                        <div className={`prose prose-sm max-w-none ${msg.role === "user" ? "prose-invert" : ""}`}>
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-end">
                      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="border-t p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="اكتب رسالتك أو أعط تعليمات للمساعد..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    disabled={loading}
                    className="flex-1"
                  />
                  <Button onClick={handleSend} disabled={loading || !input.trim()}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sources Tab */}
      {activeTab === "sources" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                الكتب المرفوعة للمساعد الذكي
              </span>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleUploadSource}
                  disabled={uploadingSource}
                />
                <Button asChild disabled={uploadingSource}>
                  <span>
                    {uploadingSource ? (
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    ) : (
                      <Upload className="h-4 w-4 ml-2" />
                    )}
                    رفع كتاب PDF
                  </span>
                </Button>
              </label>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm mb-4">
              الكتب المرفوعة هنا ستساعد المساعد الذكي في الإجابة على أسئلة الطلاب بشكل أفضل.
            </p>
            {aiSources.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>لم يتم رفع أي كتب بعد</p>
              </div>
            ) : (
              <div className="space-y-2">
                {aiSources.map((source) => (
                  <div
                    key={source.id}
                    className="flex items-center justify-between p-3 bg-accent/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">{source.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {source.created_at && new Date(source.created_at).toLocaleDateString("ar-SA")}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <a href={source.file_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteSource(source)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Instructions Tab */}
      {activeTab === "instructions" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Command className="h-5 w-5" />
              تعليمات للمساعد الذكي
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              أضف تعليمات خاصة ليتبعها المساعد الذكي عند التحدث مع الطلاب. مثلاً: "إذا سُئلت عن موعد الامتحان أخبرهم أنه يوم الأحد القادم"
            </p>
            
            {/* Add new instruction */}
            <div className="flex gap-2">
              <Textarea
                placeholder="اكتب تعليمات جديدة..."
                value={newInstruction}
                onChange={(e) => setNewInstruction(e.target.value)}
                className="flex-1 min-h-[80px]"
              />
              <Button
                onClick={handleAddInstruction}
                disabled={!newInstruction.trim() || savingInstruction}
                className="self-end"
              >
                {savingInstruction ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Instructions list */}
            {instructions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Command className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>لم تتم إضافة أي تعليمات بعد</p>
              </div>
            ) : (
              <div className="space-y-2">
                {instructions.map((inst) => (
                  <div
                    key={inst.id}
                    className={`flex items-start justify-between p-3 rounded-lg border ${
                      inst.is_active ? "bg-accent/50 border-primary/20" : "bg-muted/50 opacity-60"
                    }`}
                  >
                    <div className="flex-1">
                      <p className="text-sm">{inst.instruction}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(inst.created_at).toLocaleDateString("ar-SA")}
                      </p>
                    </div>
                    <div className="flex gap-2 mr-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleInstructionActive(inst.id, inst.is_active)}
                      >
                        {inst.is_active ? (
                          <Badge variant="default">مفعّل</Badge>
                        ) : (
                          <Badge variant="secondary">متوقف</Badge>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteInstruction(inst.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminAiChat;
