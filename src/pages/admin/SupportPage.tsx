import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MessageSquare, Send, Loader2, Search, RefreshCw, ChevronRight, Headphones,
  Users, GraduationCap, Folder, FolderArchive, Bell, CheckCircle2, XCircle,
  Clock, MoreVertical, StickyNote, ArrowRight,
} from "lucide-react";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// ─────────────────────────── Types ───────────────────────────
type Tab = "students" | "teachers" | "students_archive" | "teachers_archive";

interface Conversation {
  user_id: string;
  user_name: string;
  user_code: string | null;
  avatar_url: string | null;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  is_resolved: boolean;
  is_teacher: boolean;
}

interface Message {
  id: string;
  message: string;
  is_from_admin: boolean;
  created_at: string;
  is_read: boolean;
  file_url?: string | null;
  file_type?: string | null;
  is_resolved?: boolean;
}

interface InternalNote {
  id: string;
  note: string;
  created_at: string;
  admin_id: string;
}

// ─────────────────────────── Component ───────────────────────────
const SupportPage = () => {
  const { user: adminUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("students");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typingUserId, setTypingUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adminTypingChannelRef = useRef<any>(null);
  const playSound = useNotificationSound();

  // ─────────────────────────── Loaders ───────────────────────────
  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const { data: msgs, error } = await supabase
        .from("support_messages")
        .select("user_id, message, is_from_admin, is_read, created_at, is_teacher_request, is_resolved")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;

      const map = new Map<string, any>();
      msgs?.forEach((m: any) => {
        const existing = map.get(m.user_id);
        if (!existing) {
          map.set(m.user_id, {
            user_id: m.user_id,
            last_message: m.message,
            last_message_at: m.created_at,
            unread_count: 0,
            is_teacher: !!m.is_teacher_request,
            is_resolved: !!m.is_resolved,
          });
        } else if (m.is_teacher_request) {
          existing.is_teacher = true;
        }
        const conv = map.get(m.user_id);
        if (!m.is_from_admin && !m.is_read) conv.unread_count++;
        if (m.is_resolved && conv.is_resolved !== false) conv.is_resolved = true;
      });

      const userIds = Array.from(map.keys());
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, student_code, teacher_code, avatar_url")
          .in("id", userIds);
        profiles?.forEach((p: any) => {
          const c = map.get(p.id);
          if (c) {
            c.user_name = p.full_name;
            c.user_code = c.is_teacher ? p.teacher_code : p.student_code;
            c.avatar_url = p.avatar_url;
          }
        });
      }

      const list = Array.from(map.values()) as Conversation[];
      list.sort((a, b) => {
        if (a.unread_count !== b.unread_count) return b.unread_count - a.unread_count;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });
      setConversations(list);
    } catch (e) {
      console.error(e);
      toast.error("خطأ في تحميل المحادثات");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("support_messages")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setMessages(data || []);

      // Mark unread as read
      await supabase
        .from("support_messages")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_from_admin", false)
        .eq("is_read", false);

      // Load notes
      const { data: noteData } = await supabase
        .from("support_internal_notes")
        .select("*")
        .eq("conversation_user_id", userId)
        .order("created_at", { ascending: false });
      setNotes((noteData as InternalNote[]) || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // ─────────────────────────── Effects ───────────────────────────
  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (selectedUserId) {
      loadMessages(selectedUserId);
      // Update unread badge in list
      setConversations((prev) => prev.map((c) => (c.user_id === selectedUserId ? { ...c, unread_count: 0 } : c)));
    } else {
      setMessages([]);
      setNotes([]);
    }
  }, [selectedUserId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ⚡ Realtime: any new message anywhere → refresh list & active chat
  useEffect(() => {
    const channel = supabase
      .channel("admin-support-realtime-v2")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages" },
        (payload) => {
          const m = payload.new as any;
          // If from a non-admin user → play sound + update list
          if (!m.is_from_admin) playSound();

          if (selectedUserId && m.user_id === selectedUserId) {
            setMessages((prev) => {
              if (prev.some((x) => x.id === m.id)) return prev;
              return [...prev, m as Message];
            });
            // Auto-mark read since admin is viewing
            if (!m.is_from_admin) {
              supabase
                .from("support_messages")
                .update({ is_read: true })
                .eq("id", m.id)
                .then(() => {});
            }
          }
          // Always refresh list (cheap)
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedUserId, playSound, loadConversations]);

  // ⚡ Typing indicator: subscribe to per-user broadcast channel
  useEffect(() => {
    if (!selectedUserId) {
      setTypingUserId(null);
      return;
    }
    const ch = supabase
      .channel(`support-typing-${selectedUserId}`)
      .on("broadcast", { event: "typing" }, (payload) => {
        const from = (payload.payload as any)?.from;
        if (from === "user") {
          setTypingUserId(selectedUserId);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setTypingUserId(null), 2500);
        }
      })
      .subscribe();
    adminTypingChannelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      adminTypingChannelRef.current = null;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [selectedUserId]);

  // ─────────────────────────── Actions ───────────────────────────
  const handleSendReply = async () => {
    if (!newMessage.trim() || !selectedUserId) return;
    setSending(true);
    try {
      const conv = conversations.find((c) => c.user_id === selectedUserId);
      const { error } = await supabase.from("support_messages").insert({
        user_id: selectedUserId,
        message: newMessage.trim(),
        is_from_admin: true,
        is_teacher_request: !!conv?.is_teacher,
      });
      if (error) throw error;
      setNewMessage("");
      // Optimistic UI: realtime will sync
      toast.success("تم إرسال الرد");
    } catch (e) {
      console.error(e);
      toast.error("خطأ في إرسال الرد");
    } finally {
      setSending(false);
    }
  };

  const handleResolve = async (resolved: boolean) => {
    if (!selectedUserId) return;
    try {
      const { error } = await supabase.rpc("set_support_resolution", {
        _user_id: selectedUserId,
        _resolved: resolved,
      });
      if (error) throw error;

      // Notify the user
      await supabase.from("support_messages").insert({
        user_id: selectedUserId,
        message: resolved
          ? "✅ تم وضع علامة على هذه المحادثة كـ\"تم حل المشكلة\". إذا واجهت المشكلة مرة أخرى يمكنك الرد هنا."
          : "📋 تم نقل المحادثة إلى السجلات. يمكنك المتابعة هنا في أي وقت.",
        is_from_admin: true,
        is_teacher_request: !!conversations.find((c) => c.user_id === selectedUserId)?.is_teacher,
        is_resolved: true,
      });

      toast.success(resolved ? "تم حل المشكلة ونقلها للسجلات" : "تم النقل للسجلات");
      setSelectedUserId(null);
      loadConversations();
    } catch (e) {
      console.error(e);
      toast.error("خطأ في تحديث الحالة");
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !selectedUserId || !adminUser) return;
    setSavingNote(true);
    try {
      const { data, error } = await supabase
        .from("support_internal_notes")
        .insert({
          conversation_user_id: selectedUserId,
          admin_id: adminUser.id,
          note: newNote.trim(),
        })
        .select()
        .single();
      if (error) throw error;
      setNotes((prev) => [data as InternalNote, ...prev]);
      setNewNote("");
      toast.success("تم حفظ الملاحظة");
    } catch (e) {
      console.error(e);
      toast.error("خطأ في حفظ الملاحظة");
    } finally {
      setSavingNote(false);
    }
  };

  const sendTypingPing = () => {
    if (!selectedUserId) return;
    const ch = adminTypingChannelRef.current;
    if (!ch) return;
    ch.send({ type: "broadcast", event: "typing", payload: { from: "admin" } });
  };

  // ─────────────────────────── Derived ───────────────────────────
  const stats = useMemo(() => {
    const studentsActive = conversations.filter((c) => !c.is_teacher && !c.is_resolved);
    const teachersActive = conversations.filter((c) => c.is_teacher && !c.is_resolved);
    const studentsArchive = conversations.filter((c) => !c.is_teacher && c.is_resolved);
    const teachersArchive = conversations.filter((c) => c.is_teacher && c.is_resolved);
    return {
      studentsActive: studentsActive.length,
      teachersActive: teachersActive.length,
      studentsArchive: studentsArchive.length,
      teachersArchive: teachersArchive.length,
      pending: studentsActive.filter((c) => c.unread_count > 0).length + teachersActive.filter((c) => c.unread_count > 0).length,
    };
  }, [conversations]);

  const displayed = useMemo(() => {
    let list: Conversation[] = [];
    if (activeTab === "students") list = conversations.filter((c) => !c.is_teacher && !c.is_resolved);
    else if (activeTab === "teachers") list = conversations.filter((c) => c.is_teacher && !c.is_resolved);
    else if (activeTab === "students_archive") list = conversations.filter((c) => !c.is_teacher && c.is_resolved);
    else list = conversations.filter((c) => c.is_teacher && c.is_resolved);

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (c) =>
          (c.user_name || "").toLowerCase().includes(q) ||
          (c.user_code || "").includes(q) ||
          (c.last_message || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [conversations, activeTab, searchQuery]);

  const selectedConv = conversations.find((c) => c.user_id === selectedUserId);

  const formatTime = (s: string) =>
    new Date(s).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString("ar-EG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  // ─────────────────────────── UI ───────────────────────────
  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-200">
            <Headphones className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold">مركز الدعم</h2>
            <p className="text-xs text-muted-foreground">إدارة طلبات الدعم والتواصل مع المستخدمين</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stats.pending > 0 && (
            <Badge className="bg-red-500 text-white gap-1.5 h-7 px-3">
              <Bell className="h-3 w-3" /> {stats.pending} بانتظار الرد
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={loadConversations} className="gap-1.5 h-9 rounded-xl">
            <RefreshCw className="h-3.5 w-3.5" /> تحديث
          </Button>
        </div>
      </div>

      {/* Stat cards (4 buttons) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="دعم الطلبة"
          subtitle="الطلبات الحالية من الطلبة"
          count={stats.studentsActive}
          icon={MessageSquare}
          color="violet"
          active={activeTab === "students"}
          onClick={() => { setActiveTab("students"); setSelectedUserId(null); }}
          badge={conversations.filter((c) => !c.is_teacher && !c.is_resolved && c.unread_count > 0).length}
        />
        <StatCard
          title="دعم المعلمين"
          subtitle="الطلبات الحالية من المعلمين"
          count={stats.teachersActive}
          icon={Users}
          color="emerald"
          active={activeTab === "teachers"}
          onClick={() => { setActiveTab("teachers"); setSelectedUserId(null); }}
          badge={conversations.filter((c) => c.is_teacher && !c.is_resolved && c.unread_count > 0).length}
        />
        <StatCard
          title="سجل الطلبة"
          subtitle="جميع محادثات الطلبة السابقة"
          count={stats.studentsArchive}
          icon={Folder}
          color="sky"
          active={activeTab === "students_archive"}
          onClick={() => { setActiveTab("students_archive"); setSelectedUserId(null); }}
        />
        <StatCard
          title="سجل المعلمين"
          subtitle="جميع محادثات المعلمين السابقة"
          count={stats.teachersArchive}
          icon={FolderArchive}
          color="amber"
          active={activeTab === "teachers_archive"}
          onClick={() => { setActiveTab("teachers_archive"); setSelectedUserId(null); }}
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="ابحث باسم الطالب / المعلم أو الكود أو في نص الرسائل..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pr-10 h-11 rounded-xl text-sm bg-card border-border"
        />
      </div>

      {/* Main 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_300px] gap-3 h-[calc(100vh-22rem)] min-h-[500px]">
        {/* Conversations list */}
        <div className={`flex flex-col rounded-2xl border border-border bg-card overflow-hidden ${selectedUserId ? "hidden lg:flex" : "flex"}`}>
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              {activeTab === "students" && <><MessageSquare className="h-4 w-4 text-violet-500" /> طلبات الطلبة</>}
              {activeTab === "teachers" && <><Users className="h-4 w-4 text-emerald-500" /> طلبات المعلمين</>}
              {activeTab === "students_archive" && <><Folder className="h-4 w-4 text-sky-500" /> سجل الطلبة</>}
              {activeTab === "teachers_archive" && <><FolderArchive className="h-4 w-4 text-amber-500" /> سجل المعلمين</>}
            </h3>
            <Badge variant="outline" className="text-[10px] h-5">{displayed.length}</Badge>
          </div>
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
              </div>
            ) : displayed.length === 0 ? (
              <div className="p-8 text-center">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/15 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {activeTab.includes("archive") ? "لا توجد سجلات" : "لا توجد طلبات حالية"}
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {displayed.map((conv) => (
                  <ConversationItem
                    key={conv.user_id}
                    conv={conv}
                    selected={selectedUserId === conv.user_id}
                    onClick={() => setSelectedUserId(conv.user_id)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Chat area */}
        <div className={`rounded-2xl border border-border overflow-hidden flex flex-col ${!selectedUserId ? "hidden lg:flex" : "flex"}`}
          style={{
            background: "linear-gradient(180deg, hsl(250 40% 98%) 0%, hsl(260 30% 96%) 100%)",
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%238b5cf6' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}>
          {selectedUserId && selectedConv ? (
            <>
              {/* Chat header */}
              <div className="flex items-center justify-between p-3 border-b border-violet-100 bg-white/90 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Button variant="ghost" size="icon" className="lg:hidden shrink-0 h-8 w-8" onClick={() => setSelectedUserId(null)}>
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-sm shrink-0 ${selectedConv.is_teacher ? "bg-gradient-to-br from-emerald-400 to-green-600" : "bg-gradient-to-br from-violet-400 to-purple-600"}`}>
                    {selectedConv.avatar_url ? (
                      <img src={selectedConv.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : selectedConv.is_teacher ? (
                      <GraduationCap className="h-5 w-5" />
                    ) : (
                      (selectedConv.user_name || "U").charAt(0)
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate flex items-center gap-1.5">
                      {selectedConv.user_name || "مستخدم"}
                      {selectedConv.is_teacher && <Badge className="bg-emerald-100 text-emerald-700 text-[9px] h-4 px-1.5">معلم</Badge>}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedConv.user_code ? `#${selectedConv.user_code}` : ""} • {typingUserId === selectedUserId ? <span className="text-emerald-600 font-medium">يكتب الآن...</span> : "متصل"}
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <p className="px-2 py-1.5 text-[10px] text-muted-foreground">هل تم حل المشكلة؟</p>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleResolve(true)} className="gap-2 text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> نعم، تم حل المشكلة
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleResolve(false)} className="gap-2 text-rose-600">
                      <XCircle className="h-4 w-4" /> لا، لم يتم حل المشكلة
                    </DropdownMenuItem>
                    <p className="px-2 py-1 text-[9px] text-muted-foreground">سيتم نقل الطلب إلى السجلات</p>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3 max-w-2xl mx-auto">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.is_from_admin ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                          msg.is_from_admin
                            ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-br-sm"
                            : "bg-white border border-violet-100 rounded-bl-sm"
                        }`}
                      >
                        {msg.file_url && msg.file_type === "image" && (
                          <img src={msg.file_url} alt="مرفق" className="rounded-lg max-w-full max-h-48 mb-2 cursor-pointer" onClick={() => window.open(msg.file_url!, "_blank")} />
                        )}
                        {msg.file_url && msg.file_type === "audio" && (
                          <audio controls src={msg.file_url} className="max-w-full mb-2" />
                        )}
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                        <p className={`text-[10px] mt-1 ${msg.is_from_admin ? "text-white/60" : "text-violet-400"}`}>
                          {formatTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {typingUserId === selectedUserId && (
                    <div className="flex justify-end">
                      <div className="bg-white border border-violet-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Reply box */}
              {!selectedConv.is_resolved ? (
                <div className="p-3 border-t border-violet-100 bg-white/90 backdrop-blur-sm shrink-0">
                  <div className="flex gap-2 max-w-2xl mx-auto">
                    <Textarea
                      placeholder="اكتب رسالتك..."
                      value={newMessage}
                      onChange={(e) => {
                        setNewMessage(e.target.value);
                        sendTypingPing();
                      }}
                      className="min-h-[44px] max-h-[120px] rounded-xl text-sm resize-none border-violet-200 focus-visible:ring-violet-400"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                    />
                    <Button
                      onClick={handleSendReply}
                      disabled={sending || !newMessage.trim()}
                      size="icon"
                      className="shrink-0 rounded-xl h-11 w-11 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-3 border-t border-violet-100 bg-white/90 backdrop-blur-sm shrink-0 text-center">
                  <p className="text-xs text-muted-foreground">📋 هذه المحادثة مؤرشفة. يمكنك إعادة فتحها بإرسال رسالة جديدة.</p>
                  <Button size="sm" variant="outline" onClick={() => handleResolve(false)} className="mt-2 h-8 text-xs gap-1.5">
                    <RefreshCw className="h-3 w-3" /> إعادة فتح
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center p-8">
                <div className="h-20 w-20 rounded-full bg-violet-50 border-2 border-violet-100 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="h-10 w-10 text-violet-200" />
                </div>
                <p className="text-lg font-bold text-foreground/60">اختر محادثة</p>
                <p className="text-sm text-muted-foreground mt-1">اختر طالب أو معلم من القائمة للرد عليه</p>
              </div>
            </div>
          )}
        </div>

        {/* Right info panel: internal notes */}
        <div className={`rounded-2xl border border-border bg-card overflow-hidden flex-col ${selectedUserId ? "hidden lg:flex" : "hidden"}`}>
          <div className="px-4 py-3 border-b border-border bg-amber-50/50 flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold">ملاحظات داخلية</h3>
          </div>
          <div className="p-3 border-b border-border space-y-2">
            <Textarea
              placeholder="اكتب ملاحظة خاصة بك (لا يراها المستخدم)..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="min-h-[70px] text-xs rounded-lg border-amber-200 focus-visible:ring-amber-400 bg-amber-50/30"
            />
            <Button
              onClick={handleAddNote}
              disabled={savingNote || !newNote.trim()}
              size="sm"
              className="w-full h-8 text-xs rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 gap-1.5"
            >
              {savingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : <StickyNote className="h-3 w-3" />}
              حفظ الملاحظة
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {notes.length === 0 ? (
                <div className="text-center py-8">
                  <StickyNote className="h-10 w-10 mx-auto text-muted-foreground/15 mb-2" />
                  <p className="text-xs text-muted-foreground">لا توجد ملاحظات بعد</p>
                </div>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className="p-3 bg-amber-50/50 border border-amber-100 rounded-lg">
                    <p className="text-xs whitespace-pre-wrap leading-relaxed text-amber-900">{n.note}</p>
                    <p className="text-[10px] text-amber-600 mt-1.5 flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" /> {formatDate(n.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────── Sub-components ───────────────────────────
const COLOR_MAP = {
  violet: { bg: "bg-violet-500", soft: "bg-violet-50", text: "text-violet-600", border: "border-violet-200", gradient: "from-violet-500 to-purple-600", ring: "ring-violet-300" },
  emerald: { bg: "bg-emerald-500", soft: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200", gradient: "from-emerald-500 to-green-600", ring: "ring-emerald-300" },
  sky: { bg: "bg-sky-500", soft: "bg-sky-50", text: "text-sky-600", border: "border-sky-200", gradient: "from-sky-500 to-blue-600", ring: "ring-sky-300" },
  amber: { bg: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-600", border: "border-amber-200", gradient: "from-amber-500 to-orange-500", ring: "ring-amber-300" },
} as const;

function StatCard({
  title, subtitle, count, icon: Icon, color, active, onClick, badge,
}: {
  title: string; subtitle: string; count: number; icon: any;
  color: keyof typeof COLOR_MAP; active: boolean; onClick: () => void; badge?: number;
}) {
  const c = COLOR_MAP[color];
  return (
    <button
      onClick={onClick}
      className={`group relative text-right p-4 rounded-2xl border transition-all duration-200 ${
        active
          ? `bg-white shadow-lg ${c.border} ring-2 ${c.ring}`
          : "bg-card border-border hover:shadow-md hover:-translate-y-0.5"
      }`}
    >
      {(badge ?? 0) > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-md">
          {badge}
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold mb-0.5 ${c.text}`}>{title}</p>
          <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">{subtitle}</p>
        </div>
        <div className={`h-10 w-10 rounded-xl ${c.soft} flex items-center justify-center shrink-0`}>
          <Icon className={`h-5 w-5 ${c.text}`} />
        </div>
      </div>
      <p className={`text-2xl font-extrabold mt-3 ${c.text}`}>{count}</p>
    </button>
  );
}

function ConversationItem({
  conv, selected, onClick,
}: { conv: Conversation; selected: boolean; onClick: () => void; }) {
  const isTeacher = conv.is_teacher;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-right transition-all ${
        selected ? (isTeacher ? "bg-emerald-50 border border-emerald-200" : "bg-violet-50 border border-violet-200") : "hover:bg-muted/50 border border-transparent"
      }`}
    >
      <div
        className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
          conv.unread_count > 0
            ? isTeacher ? "bg-gradient-to-br from-emerald-400 to-green-600 text-white" : "bg-gradient-to-br from-violet-400 to-purple-600 text-white"
            : isTeacher ? "bg-emerald-100 text-emerald-600" : "bg-violet-100 text-violet-600"
        }`}
      >
        {conv.avatar_url ? (
          <img src={conv.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
        ) : isTeacher ? (
          <GraduationCap className="h-5 w-5" />
        ) : (
          (conv.user_name || "U").charAt(0)
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm font-bold truncate">{conv.user_name || (isTeacher ? "معلم" : "طالب")}</p>
          {conv.unread_count > 0 && (
            <Badge className="bg-red-500 text-white text-[10px] h-5 min-w-[20px] p-0 flex items-center justify-center rounded-full shrink-0 border-0">
              {conv.unread_count}
            </Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">{conv.user_code || "---"}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{(conv.last_message || "").substring(0, 45)}</p>
      </div>
    </button>
  );
}

export default SupportPage;
