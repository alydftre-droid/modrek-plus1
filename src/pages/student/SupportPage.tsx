import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/manualClient";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import StudentLayout from "@/components/student/StudentLayout";
import {
  MessageSquare,
  Send,
  Loader2,
  User,
  Phone,
  Mail,
} from "lucide-react";

interface Message {
  id: string;
  message: string;
  is_from_admin: boolean;
  created_at: string;
}

const StudentSupportPage = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const loadMessages = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from("support_messages").select("*").eq("user_id", user.id).order("created_at", { ascending: true });
      if (error) throw error;
      setMessages(data || []);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  useEffect(() => { loadMessages(); }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("support-messages").on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `user_id=eq.${user?.id}` }, (payload) => {
      setMessages((prev) => [...prev, payload.new as Message]);
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user) return;
    setSending(true);
    try {
      const { error } = await supabase.from("support_messages").insert({ user_id: user.id, message: newMessage.trim(), is_from_admin: false });
      if (error) throw error;
      setNewMessage("");
      toast.success("تم إرسال رسالتك");
    } catch (error) { console.error(error); toast.error("خطأ في إرسال الرسالة"); } finally { setSending(false); }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ar-EG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <StudentLayout title="الدعم الفني">
      <div className="p-3 lg:p-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* معلومات التواصل */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg">معلومات التواصل</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">علي محمد علي</p>
                    <p className="text-xs text-muted-foreground">مطور المنصة</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <a href="mailto:alyedaft@gmail.com" className="text-sm hover:text-primary transition-colors">alyedaft@gmail.com</a>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <a href="https://wa.me/201223909712" target="_blank" rel="noopener noreferrer" className="text-sm hover:text-primary transition-colors">01223909712</a>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* المحادثة */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  المحادثة مع الدعم
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : (
                  <>
                    <ScrollArea className="h-[400px] mb-4 p-4 border rounded-lg bg-muted/30">
                      {messages.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center">
                            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                            <p className="text-muted-foreground">ابدأ محادثة جديدة مع فريق الدعم</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {messages.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.is_from_admin ? "justify-start" : "justify-end"}`}>
                              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${msg.is_from_admin ? "bg-accent text-accent-foreground rounded-tr-none" : "bg-primary text-primary-foreground rounded-tl-none"}`}>
                                <p className="text-sm leading-relaxed">{msg.message}</p>
                                <p className={`text-[10px] mt-1 ${msg.is_from_admin ? "text-muted-foreground" : "text-primary-foreground/60"}`}>{formatDate(msg.created_at)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                    <div className="flex gap-2">
                      <Textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="اكتب رسالتك..." className="min-h-[48px] max-h-[120px] resize-none" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }} />
                      <Button onClick={handleSendMessage} disabled={sending || !newMessage.trim()} size="icon" className="h-12 w-12 shrink-0">
                        {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </StudentLayout>
  );
};

export default StudentSupportPage;
