import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, MessageSquare, Send, Search, ArrowRight, Users, Megaphone, ChevronLeft
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface StudentThread {
  student_id: string;
  student_name: string;
  student_code: string | null;
  last_message: string;
  last_time: string;
  unread_count: number;
}

interface Message {
  id: string;
  message: string;
  is_from_teacher: boolean;
  created_at: string;
  is_read: boolean;
}

export default function TeacherMessagesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState("");
  const [threads, setThreads] = useState<StudentThread[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentThread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Views: threads | compose | broadcast
  const [view, setView] = useState<"threads" | "compose" | "broadcast">("threads");
  const [composeSearch, setComposeSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; full_name: string; student_code: string | null }[]>([]);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user?.id]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("teacher-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "teacher_messages", filter: `teacher_id=eq.${user.id}` },
        () => { if (selectedStudent) fetchMessages(selectedStudent.student_id); fetchData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, selectedStudent]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    if (profile) setTeacherName(profile.full_name);

    const { data: allMessages } = await supabase
      .from("teacher_messages").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false });

    if (!allMessages?.length) { setThreads([]); setLoading(false); return; }

    const studentMap = new Map<string, any[]>();
    for (const msg of allMessages) {
      if (!studentMap.has(msg.student_id)) studentMap.set(msg.student_id, []);
      studentMap.get(msg.student_id)!.push(msg);
    }

    const studentIds = [...studentMap.keys()];
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, student_code").in("id", studentIds);
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const threadList: StudentThread[] = studentIds.map(sid => {
      const msgs = studentMap.get(sid)!;
      const p = profileMap.get(sid);
      return {
        student_id: sid, student_name: p?.full_name || "طالب", student_code: p?.student_code || null,
        last_message: msgs[0].message, last_time: msgs[0].created_at,
        unread_count: msgs.filter(m => !m.is_from_teacher && !m.is_read).length,
      };
    });
    threadList.sort((a, b) => new Date(b.last_time).getTime() - new Date(a.last_time).getTime());
    setThreads(threadList);
    setLoading(false);
  };

  const fetchMessages = async (studentId: string) => {
    if (!user) return;
    setLoadingMessages(true);
    const { data } = await supabase
      .from("teacher_messages").select("*").eq("teacher_id", user.id).eq("student_id", studentId)
      .order("created_at", { ascending: true });
    setMessages((data || []) as Message[]);
    await supabase
      .from("teacher_messages").update({ is_read: true })
      .eq("teacher_id", user.id).eq("student_id", studentId).eq("is_from_teacher", false);
    setLoadingMessages(false);
  };

  const handleSelectThread = (thread: StudentThread) => {
    setSelectedStudent(thread);
    fetchMessages(thread.student_id);
    setView("threads");
  };

  const handleSend = async () => {
    if (!user || !selectedStudent || !newMessage.trim()) return;
    setSending(true);
    try {
      await supabase.from("teacher_messages").insert({
        teacher_id: user.id, student_id: selectedStudent.student_id,
        message: newMessage.trim(), is_from_teacher: true,
      });
      setNewMessage("");
      fetchMessages(selectedStudent.student_id);
    } catch { toast.error("خطأ في إرسال الرسالة"); }
    finally { setSending(false); }
  };

  const handleComposeSearch = async () => {
    if (!composeSearch.trim() || !user) return;
    const { data: choices } = await supabase.from("student_teacher_choices").select("student_id").eq("teacher_id", user.id);
    const studentIds = [...new Set(choices?.map(c => c.student_id) || [])];
    if (!studentIds.length) { setSearchResults([]); return; }
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, student_code").in("id", studentIds)
      .or(`full_name.ilike.%${composeSearch}%,student_code.ilike.%${composeSearch}%`);
    setSearchResults(profiles || []);
  };

  const handleStartThread = (id: string, name: string, code: string | null) => {
    const existing = threads.find(t => t.student_id === id);
    if (existing) { handleSelectThread(existing); }
    else {
      setSelectedStudent({ student_id: id, student_name: name, student_code: code, last_message: "", last_time: new Date().toISOString(), unread_count: 0 });
      setMessages([]);
    }
    setView("threads");
  };

  const handleBroadcast = async () => {
    if (!user || !broadcastMessage.trim()) return;
    setBroadcastSending(true);
    try {
      const { data: choices } = await supabase.from("student_teacher_choices").select("student_id").eq("teacher_id", user.id);
      const studentIds = [...new Set(choices?.map(c => c.student_id) || [])];
      if (!studentIds.length) { toast.error("لا يوجد طلاب مسجلين"); setBroadcastSending(false); return; }
      const rows = studentIds.map(sid => ({
        teacher_id: user.id, student_id: sid, message: `📢 رسالة جماعية:\n${broadcastMessage.trim()}`, is_from_teacher: true,
      }));
      await supabase.from("teacher_messages").insert(rows);
      toast.success(`تم إرسال الرسالة لـ ${studentIds.length} طالب`);
      setBroadcastMessage("");
      setView("threads");
      fetchData();
    } catch { toast.error("خطأ في الإرسال"); }
    finally { setBroadcastSending(false); }
  };

  const filteredThreads = threads.filter(t =>
    !searchQuery || t.student_name.includes(searchQuery) || (t.student_code || "").includes(searchQuery)
  );

  const totalUnread = threads.reduce((sum, t) => sum + t.unread_count, 0);

  if (loading) {
    return (
      <TeacherSidebarLayout title="الرسائل" teacherName={teacherName}>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
      </TeacherSidebarLayout>
    );
  }

  return (
    <TeacherSidebarLayout title="التواصل مع الطلبة" teacherName={teacherName}>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Thread List */}
        <div className={`w-full md:w-80 border-l border-border flex flex-col bg-card ${selectedStudent ? "hidden md:flex" : "flex"}`}>
          <div className="p-3 border-b border-border space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="بحث بالاسم أو الكود..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pr-9 h-9" />
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant={view === "compose" ? "default" : "outline"} onClick={() => setView("compose")} className="flex-1 text-xs gap-1">
                <Send className="h-3 w-3" /> رسالة جديدة
              </Button>
              <Button size="sm" variant={view === "broadcast" ? "default" : "outline"} onClick={() => setView("broadcast")} className="flex-1 text-xs gap-1">
                <Megaphone className="h-3 w-3" /> رسالة جماعية
              </Button>
            </div>
          </div>

          {view === "compose" ? (
            <div className="p-3 space-y-3">
              <Button variant="ghost" size="sm" onClick={() => setView("threads")} className="gap-1">
                <ArrowRight className="h-4 w-4" /> رجوع
              </Button>
              <div className="flex gap-2">
                <Input placeholder="ابحث بالاسم أو الكود..." value={composeSearch} onChange={e => setComposeSearch(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleComposeSearch()} className="h-9" />
                <Button size="sm" onClick={handleComposeSearch}>بحث</Button>
              </div>
              <ScrollArea className="max-h-60">
                {searchResults.map(s => (
                  <button key={s.id} onClick={() => handleStartThread(s.id, s.full_name, s.student_code)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-right">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center"><Users className="h-4 w-4 text-primary" /></div>
                    <div>
                      <p className="text-sm font-medium">{s.full_name}</p>
                      {s.student_code && <p className="text-xs text-muted-foreground">#{s.student_code}</p>}
                    </div>
                  </button>
                ))}
              </ScrollArea>
            </div>
          ) : view === "broadcast" ? (
            <div className="p-3 space-y-3">
              <Button variant="ghost" size="sm" onClick={() => setView("threads")} className="gap-1">
                <ArrowRight className="h-4 w-4" /> رجوع
              </Button>
              <div className="p-3 rounded-lg bg-accent/50">
                <p className="text-sm font-medium flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" /> رسالة جماعية</p>
                <p className="text-xs text-muted-foreground mt-1">ستصل لجميع الطلاب المسجلين معك</p>
              </div>
              <Textarea placeholder="اكتب رسالتك لجميع الطلاب..." value={broadcastMessage} onChange={e => setBroadcastMessage(e.target.value)}
                className="min-h-[100px]" dir="rtl" />
              <Button onClick={handleBroadcast} disabled={broadcastSending || !broadcastMessage.trim()} className="w-full gap-2">
                {broadcastSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                إرسال للجميع
              </Button>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              {filteredThreads.length === 0 ? (
                <div className="p-6 text-center">
                  <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">لا توجد رسائل بعد</p>
                </div>
              ) : (
                filteredThreads.map(thread => (
                  <button key={thread.student_id} onClick={() => handleSelectThread(thread)}
                    className={`w-full flex items-center gap-3 p-3 border-b border-border/50 hover:bg-accent/50 transition-colors text-right ${
                      selectedStudent?.student_id === thread.student_id ? "bg-accent" : ""}`}>
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold truncate">{thread.student_name}</p>
                        {thread.unread_count > 0 && (
                          <Badge className="bg-primary text-primary-foreground text-xs h-5 min-w-[20px] p-0 flex items-center justify-center rounded-full">
                            {thread.unread_count}
                          </Badge>
                        )}
                      </div>
                      {thread.student_code && <p className="text-[10px] text-muted-foreground">#{thread.student_code}</p>}
                      <p className="text-xs text-muted-foreground truncate">{thread.last_message.substring(0, 40)}</p>
                    </div>
                  </button>
                ))
              )}
            </ScrollArea>
          )}
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col ${!selectedStudent ? "hidden md:flex" : "flex"}`}>
          {!selectedStudent ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground/20 mb-4" />
                <p className="text-muted-foreground">اختر محادثة أو أرسل رسالة جديدة</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 p-3 border-b border-border bg-card">
                <Button variant="ghost" size="icon" className="md:hidden shrink-0" onClick={() => setSelectedStudent(null)}>
                  <ChevronLeft className="h-5 w-5 rotate-180" />
                </Button>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{selectedStudent.student_name}</p>
                  {selectedStudent.student_code && <p className="text-xs text-muted-foreground">#{selectedStudent.student_code}</p>}
                </div>
              </div>

              <ScrollArea className="flex-1 p-4">
                {loadingMessages ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">ابدأ المحادثة</div>
                ) : (
                  <div className="space-y-3">
                    {messages.map(msg => (
                      <motion.div key={msg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.is_from_teacher ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[80%] p-3 rounded-2xl text-sm whitespace-pre-wrap ${
                          msg.is_from_teacher ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-accent rounded-bl-sm"}`}>
                          <p>{msg.message}</p>
                          <p className={`text-[10px] mt-1 ${msg.is_from_teacher ? "text-primary-foreground/50" : "text-muted-foreground"}`}>
                            {new Date(msg.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              <div className="p-3 border-t border-border bg-card">
                <div className="flex gap-2">
                  <Input value={newMessage} onChange={e => setNewMessage(e.target.value)}
                    placeholder="اكتب رسالتك..." onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()} className="flex-1" />
                  <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="icon">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </TeacherSidebarLayout>
  );
}
