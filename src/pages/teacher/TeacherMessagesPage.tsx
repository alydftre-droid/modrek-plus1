import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, MessageSquare, Send, Search, ArrowRight, Users
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

  // Compose mode
  const [showCompose, setShowCompose] = useState(false);
  const [composeSearch, setComposeSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; full_name: string; student_code: string | null }[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("teacher-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "teacher_messages", filter: `teacher_id=eq.${user.id}` },
        () => {
          if (selectedStudent) fetchMessages(selectedStudent.student_id);
          fetchData();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, selectedStudent]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    if (profile) setTeacherName(profile.full_name);

    // Get all messages for this teacher
    const { data: allMessages } = await supabase
      .from("teacher_messages")
      .select("*")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false });

    if (!allMessages || allMessages.length === 0) {
      setThreads([]);
      setLoading(false);
      return;
    }

    // Group by student
    const studentMap = new Map<string, { messages: any[] }>();
    for (const msg of allMessages) {
      if (!studentMap.has(msg.student_id)) studentMap.set(msg.student_id, { messages: [] });
      studentMap.get(msg.student_id)!.messages.push(msg);
    }

    // Get student profiles
    const studentIds = [...studentMap.keys()];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, student_code")
      .in("id", studentIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const threadList: StudentThread[] = studentIds.map(sid => {
      const msgs = studentMap.get(sid)!.messages;
      const p = profileMap.get(sid);
      const unread = msgs.filter(m => !m.is_from_teacher && !m.is_read).length;
      return {
        student_id: sid,
        student_name: p?.full_name || "طالب",
        student_code: p?.student_code || null,
        last_message: msgs[0].message,
        last_time: msgs[0].created_at,
        unread_count: unread,
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
      .from("teacher_messages")
      .select("*")
      .eq("teacher_id", user.id)
      .eq("student_id", studentId)
      .order("created_at", { ascending: true });

    setMessages((data || []) as Message[]);

    // Mark as read
    await supabase
      .from("teacher_messages")
      .update({ is_read: true })
      .eq("teacher_id", user.id)
      .eq("student_id", studentId)
      .eq("is_from_teacher", false);

    setLoadingMessages(false);
  };

  const handleSelectThread = (thread: StudentThread) => {
    setSelectedStudent(thread);
    fetchMessages(thread.student_id);
    setShowCompose(false);
  };

  const handleSend = async () => {
    if (!user || !selectedStudent || !newMessage.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.from("teacher_messages").insert({
        teacher_id: user.id,
        student_id: selectedStudent.student_id,
        message: newMessage.trim(),
        is_from_teacher: true,
      });
      if (error) throw error;
      setNewMessage("");
      fetchMessages(selectedStudent.student_id);
    } catch (e) {
      toast.error("خطأ في إرسال الرسالة");
    } finally {
      setSending(false);
    }
  };

  const handleComposeSearch = async () => {
    if (!composeSearch.trim() || !user) return;
    // Search in students who chose this teacher
    const { data: choices } = await supabase
      .from("student_teacher_choices")
      .select("student_id")
      .eq("teacher_id", user.id);

    const studentIds = [...new Set(choices?.map(c => c.student_id) || [])];
    if (studentIds.length === 0) { setSearchResults([]); return; }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, student_code")
      .in("id", studentIds)
      .or(`full_name.ilike.%${composeSearch}%,student_code.ilike.%${composeSearch}%`);

    setSearchResults(profiles || []);
  };

  const handleStartThread = (studentId: string, name: string, code: string | null) => {
    const existing = threads.find(t => t.student_id === studentId);
    if (existing) {
      handleSelectThread(existing);
    } else {
      const newThread: StudentThread = {
        student_id: studentId,
        student_name: name,
        student_code: code,
        last_message: "",
        last_time: new Date().toISOString(),
        unread_count: 0,
      };
      setSelectedStudent(newThread);
      setMessages([]);
    }
    setShowCompose(false);
  };

  const filteredThreads = threads.filter(t =>
    !searchQuery || t.student_name.includes(searchQuery) || (t.student_code || "").includes(searchQuery)
  );

  if (loading) {
    return (
      <TeacherSidebarLayout title="الرسائل" teacherName={teacherName}>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
      </TeacherSidebarLayout>
    );
  }

  return (
    <TeacherSidebarLayout title="الرسائل" teacherName={teacherName}>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Thread List */}
        <div className={`w-full md:w-80 border-l border-border flex flex-col ${selectedStudent ? "hidden md:flex" : "flex"}`}>
          <div className="p-3 border-b border-border space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث بالاسم أو الكود..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pr-9 h-9"
                />
              </div>
              <Button size="sm" onClick={() => setShowCompose(true)} className="gap-1 shrink-0">
                <Send className="h-3 w-3" />
                <span className="hidden sm:inline">رسالة جديدة</span>
              </Button>
            </div>
          </div>

          {showCompose ? (
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowCompose(false)}>
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <span className="font-medium text-sm">إرسال رسالة لطالب</span>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="ابحث بالاسم أو الكود..."
                  value={composeSearch}
                  onChange={e => setComposeSearch(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleComposeSearch()}
                  className="h-9"
                />
                <Button size="sm" onClick={handleComposeSearch}>بحث</Button>
              </div>
              <div className="space-y-1">
                {searchResults.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleStartThread(s.id, s.full_name, s.student_code)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-right"
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{s.full_name}</p>
                      {s.student_code && <p className="text-xs text-muted-foreground">#{s.student_code}</p>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              {filteredThreads.length === 0 ? (
                <div className="p-6 text-center">
                  <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">لا توجد رسائل بعد</p>
                </div>
              ) : (
                filteredThreads.map(thread => (
                  <button
                    key={thread.student_id}
                    onClick={() => handleSelectThread(thread)}
                    className={`w-full flex items-center gap-3 p-4 border-b border-border/50 hover:bg-accent/50 transition-colors text-right ${
                      selectedStudent?.student_id === thread.student_id ? "bg-accent" : ""
                    }`}
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold truncate">{thread.student_name}</p>
                        {thread.unread_count > 0 && (
                          <Badge className="bg-primary text-primary-foreground text-xs h-5 w-5 p-0 flex items-center justify-center rounded-full">
                            {thread.unread_count}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{thread.last_message}</p>
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
                <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">اختر محادثة أو أرسل رسالة جديدة</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="flex items-center gap-3 p-4 border-b border-border bg-card">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSelectedStudent(null)}>
                  <ArrowRight className="h-5 w-5" />
                </Button>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-sm">{selectedStudent.student_name}</p>
                  {selectedStudent.student_code && <p className="text-xs text-muted-foreground">#{selectedStudent.student_code}</p>}
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                {loadingMessages ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">لا توجد رسائل بعد - ابدأ المحادثة</div>
                ) : (
                  <div className="space-y-3">
                    {messages.map(msg => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.is_from_teacher ? "justify-start" : "justify-end"}`}
                      >
                        <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                          msg.is_from_teacher
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-accent rounded-bl-sm"
                        }`}>
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

              {/* Input */}
              <div className="p-3 border-t border-border bg-card">
                <div className="flex gap-2">
                  <Input
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="اكتب رسالتك..."
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                    className="flex-1"
                  />
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
