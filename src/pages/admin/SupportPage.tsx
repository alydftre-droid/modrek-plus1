import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/manualClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MessageSquare, Send, Loader2, User, Search, RefreshCw, Archive,
  CheckCircle2, X, ChevronRight, Settings, Clock
} from "lucide-react";

interface SupportConversation {
  user_id: string;
  user_name: string;
  student_code: string | null;
  last_message: string;
  unread_count: number;
  last_message_at: string;
  is_resolved: boolean;
}

interface Message {
  id: string;
  message: string;
  is_from_admin: boolean;
  created_at: string;
  is_read: boolean;
  file_url?: string | null;
  file_type?: string | null;
}

const SupportPage = () => {
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"active" | "resolved">("active");
  const [resolvedIds, setResolvedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("support_resolved_ids") || "[]"); } catch { return []; }
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { localStorage.setItem("support_resolved_ids", JSON.stringify(resolvedIds)); }, [resolvedIds]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const { data: messagesData, error } = await supabase.from("support_messages")
        .select("user_id, message, is_from_admin, is_read, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const userMap = new Map<string, any>();
      messagesData?.forEach((msg) => {
        if (!userMap.has(msg.user_id)) {
          userMap.set(msg.user_id, { user_id: msg.user_id, last_message: msg.message, last_message_at: msg.created_at, unread_count: 0 });
        }
        if (!msg.is_from_admin && !msg.is_read) {
          userMap.get(msg.user_id).unread_count++;
        }
      });

      const userIds = Array.from(userMap.keys());
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name, student_code").in("id", userIds);
        profiles?.forEach((profile) => {
          const conv = userMap.get(profile.id);
          if (conv) { conv.user_name = profile.full_name; conv.student_code = profile.student_code; }
        });
      }

      const convList = Array.from(userMap.values()).map(c => ({
        ...c, is_resolved: resolvedIds.includes(c.user_id),
      }));
      // Sort: unread first, then by time
      convList.sort((a: any, b: any) => {
        if (a.unread_count !== b.unread_count) return b.unread_count - a.unread_count;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });
      setConversations(convList);
    } catch (error) {
      console.error("Error loading conversations:", error);
      toast.error("خطأ في تحميل المحادثات");
    } finally { setLoading(false); }
  };

  const loadMessages = async (userId: string) => {
    try {
      const { data, error } = await supabase.from("support_messages")
        .select("*").eq("user_id", userId).order("created_at", { ascending: true });
      if (error) throw error;
      setMessages(data || []);
      await supabase.from("support_messages").update({ is_read: true }).eq("user_id", userId).eq("is_from_admin", false);
      loadConversations();
    } catch (error) { console.error("Error loading messages:", error); }
  };

  useEffect(() => { loadConversations(); }, []);
  useEffect(() => { if (selectedUserId) loadMessages(selectedUserId); }, [selectedUserId]);

  // Realtime
  useEffect(() => {
    const channel = supabase.channel("admin-support-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, () => {
        if (selectedUserId) loadMessages(selectedUserId);
        loadConversations();
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedUserId]);

  const handleSendReply = async () => {
    if (!newMessage.trim() || !selectedUserId) return;
    setSending(true);
    try {
      const { error } = await supabase.from("support_messages").insert({
        user_id: selectedUserId, message: newMessage.trim(), is_from_admin: true,
      });
      if (error) throw error;
      setNewMessage("");
      loadMessages(selectedUserId);
      toast.success("تم إرسال الرد");
    } catch (error) {
      console.error("Error sending reply:", error);
      toast.error("خطأ في إرسال الرد");
    } finally { setSending(false); }
  };

  const resolveTicket = (userId: string) => {
    setResolvedIds(prev => [...prev, userId]);
    setSelectedUserId(null);
    setMessages([]);
    toast.success("تم نقل المحادثة للسجلات");
    // Mark as resolved in conversations state
    setConversations(prev => prev.map(c => c.user_id === userId ? { ...c, is_resolved: true } : c));
  };

  const reopenTicket = (userId: string) => {
    setResolvedIds(prev => prev.filter(id => id !== userId));
    setConversations(prev => prev.map(c => c.user_id === userId ? { ...c, is_resolved: false } : c));
    toast.success("تم إعادة فتح المحادثة");
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("ar-EG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const activeConversations = conversations.filter(c => !resolvedIds.includes(c.user_id));
  const resolvedConversations = conversations.filter(c => resolvedIds.includes(c.user_id));
  const displayedConversations = (viewMode === "active" ? activeConversations : resolvedConversations)
    .filter(conv => !searchQuery || conv.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) || conv.student_code?.includes(searchQuery));

  const selectedConversation = conversations.find(c => c.user_id === selectedUserId);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-sky-500" />
          الدعم الفني
        </h2>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" /> {activeConversations.filter(c => c.unread_count > 0).length} بانتظار الرد
          </Badge>
          <Button variant="outline" size="sm" onClick={loadConversations} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> تحديث
          </Button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-12rem)] overflow-hidden rounded-xl border border-border bg-card">
        {/* Conversations List */}
        <div className={`w-full md:w-[340px] border-l border-border flex flex-col ${selectedUserId ? "hidden md:flex" : "flex"}`}>
          {/* Tabs & Search */}
          <div className="p-3 border-b border-border space-y-2.5">
            <div className="flex gap-1 bg-muted/50 p-0.5 rounded-xl">
              <button onClick={() => setViewMode("active")}
                className={`flex-1 text-xs py-1.5 rounded-lg transition-all font-medium ${viewMode === "active" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
                الوارد ({activeConversations.length})
              </button>
              <button onClick={() => setViewMode("resolved")}
                className={`flex-1 text-xs py-1.5 rounded-lg transition-all font-medium flex items-center justify-center gap-1 ${viewMode === "resolved" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
                <Archive className="h-3 w-3" /> السجلات ({resolvedConversations.length})
              </button>
            </div>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="بحث بالاسم أو الكود..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9 h-9 rounded-xl text-sm bg-muted/30 border-0" />
            </div>
          </div>

          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
            ) : displayedConversations.length === 0 ? (
              <div className="p-8 text-center">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/15 mb-3" />
                <p className="text-sm text-muted-foreground">{viewMode === "active" ? "لا توجد محادثات جديدة" : "لا توجد سجلات"}</p>
              </div>
            ) : (
              <div className="p-1.5 space-y-0.5">
                {displayedConversations.map((conv) => (
                  <button key={conv.user_id} onClick={() => setSelectedUserId(conv.user_id)}
                    className={`w-full flex items-center gap-2.5 p-3 rounded-xl text-right transition-all ${
                      selectedUserId === conv.user_id ? "bg-sky-50 border border-sky-200" : "hover:bg-muted/50"
                    }`}>
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                      conv.unread_count > 0 ? "bg-gradient-to-br from-sky-400 to-blue-500 text-white" : "bg-sky-100 text-sky-600"
                    }`}>
                      {(conv.user_name || "ط").charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-sm font-bold truncate">{conv.user_name || "طالب"}</p>
                        {conv.unread_count > 0 && (
                          <Badge className="bg-sky-500 text-white text-[10px] h-5 min-w-[20px] p-0 flex items-center justify-center rounded-full shrink-0">
                            {conv.unread_count}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{conv.student_code || "---"}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.last_message?.substring(0, 40)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col ${!selectedUserId ? "hidden md:flex" : "flex"}`}
          style={{ 
            background: "linear-gradient(180deg, hsl(210 40% 98%) 0%, hsl(210 30% 96%) 100%)",
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2394a3b8' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}>
          {selectedUserId ? (
            <>
              {/* Chat Header */}
              <div className="flex items-center justify-between p-3 border-b border-sky-100 bg-white/80 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" className="md:hidden shrink-0 h-8 w-8" onClick={() => setSelectedUserId(null)}>
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-sm font-bold text-white shadow-sm">
                    {(selectedConversation?.user_name || "ط").charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{selectedConversation?.user_name || "طالب"}</p>
                    <p className="text-[10px] text-muted-foreground">{selectedConversation?.student_code ? `#${selectedConversation.student_code}` : ""}</p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {resolvedIds.includes(selectedUserId) ? (
                    <Button size="sm" variant="outline" onClick={() => reopenTicket(selectedUserId)} className="text-xs gap-1 rounded-xl h-8 border-amber-200 text-amber-600 hover:bg-amber-50">
                      <RefreshCw className="h-3 w-3" /> إعادة فتح
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => resolveTicket(selectedUserId)} className="text-xs gap-1.5 rounded-xl h-8 border-emerald-200 text-emerald-600 hover:bg-emerald-50">
                      <CheckCircle2 className="h-3.5 w-3.5" /> تم حل المشكلة
                    </Button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3 max-w-2xl mx-auto">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.is_from_admin ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                        msg.is_from_admin
                          ? "bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-br-sm shadow-sm shadow-sky-200/30"
                          : "bg-white border border-sky-100 rounded-bl-sm shadow-sm"
                      }`}>
                        {msg.file_url && msg.file_type === "image" && (
                          <img src={msg.file_url} alt="مرفق" className="rounded-lg max-w-full max-h-48 mb-2 cursor-pointer" onClick={() => window.open(msg.file_url!, "_blank")} />
                        )}
                        {msg.file_url && msg.file_type === "audio" && (
                          <audio controls src={msg.file_url} className="max-w-full mb-2" />
                        )}
                        <p className="whitespace-pre-wrap">{msg.message}</p>
                        <p className={`text-[10px] mt-1.5 ${msg.is_from_admin ? "text-white/60" : "text-sky-400"}`}>
                          {formatDate(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Reply */}
              <div className="p-3 border-t border-sky-100 bg-white/80 backdrop-blur-sm">
                <div className="flex gap-2 max-w-2xl mx-auto">
                  <Textarea placeholder="اكتب ردك هنا..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                    className="min-h-[44px] max-h-[100px] rounded-xl text-sm resize-none border-sky-200 focus-visible:ring-sky-400"
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }} />
                  <Button onClick={handleSendReply} disabled={sending || !newMessage.trim()} size="icon"
                    className="shrink-0 rounded-xl h-11 w-11 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center p-8">
                <div className="h-20 w-20 rounded-full bg-sky-50 border-2 border-sky-100 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="h-10 w-10 text-sky-200" />
                </div>
                <p className="text-lg font-bold text-foreground/60">اختر محادثة</p>
                <p className="text-sm text-muted-foreground mt-1">اختر طالب من القائمة للرد عليه</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportPage;
