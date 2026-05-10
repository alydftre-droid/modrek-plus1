import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Bell, Send, Loader2, Users, User, Search, Settings, Clock, Archive,
  ChevronRight, X, Calendar, Plus, Trash2, CheckCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type NotifRecord = {
  id: string;
  title: string;
  message: string;
  user_id: string | null;
  created_at: string;
  is_sent: boolean;
  scheduled_at: string | null;
  notification_type: string | null;
};

type StudentResult = {
  id: string;
  full_name: string;
  student_code: string | null;
  email: string;
};

type PageView = "compose" | "records";

const NotificationsPage = () => {
  const [view, setView] = useState<PageView>("compose");
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetType, setTargetType] = useState<"all" | "selected">("all");
  const [selectedStudents, setSelectedStudents] = useState<StudentResult[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  // Records
  const [records, setRecords] = useState<NotifRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordSearch, setRecordSearch] = useState("");

  // Pending (unsent scheduled)
  const [pending, setPending] = useState<NotifRecord[]>([]);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("id, title, message, user_id, created_at, is_sent, scheduled_at, notification_type")
      .eq("is_sent", true)
      .order("created_at", { ascending: false })
      .limit(100);
    setRecords((data as any[]) || []);
    setRecordsLoading(false);
  }, []);

  const loadPending = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id, title, message, user_id, created_at, is_sent, scheduled_at, notification_type")
      .eq("is_sent", false)
      .order("scheduled_at", { ascending: true })
      .limit(50);
    setPending((data as any[]) || []);
  }, []);

  useEffect(() => {
    loadRecords();
    loadPending();
  }, [loadRecords, loadPending]);

  // Student search
  useEffect(() => {
    if (!studentSearch.trim()) { setStudentResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const q = studentSearch.trim();
      const { data } = await supabase.from("profiles")
        .select("id, full_name, student_code, email")
        .or(`full_name.ilike.%${q}%,student_code.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(10);
      setStudentResults((data || []).filter(s => !selectedStudents.find(ss => ss.id === s.id)));
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [studentSearch, selectedStudents]);

  const addStudent = (s: StudentResult) => {
    setSelectedStudents(prev => [...prev, s]);
    setStudentSearch("");
    setStudentResults([]);
  };

  const removeStudent = (id: string) => {
    setSelectedStudents(prev => prev.filter(s => s.id !== id));
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("يرجى إدخال العنوان والرسالة");
      return;
    }
    if (targetType === "selected" && selectedStudents.length === 0) {
      toast.error("يرجى تحديد طالب واحد على الأقل");
      return;
    }

    setSending(true);
    try {
      const isScheduled = scheduleEnabled && scheduledDate && scheduledTime;
      const scheduledAt = isScheduled ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString() : null;
      const isSent = !isScheduled;

      if (targetType === "all") {
        // Use server-side RPC: it inserts one notification per user so
        // each user gets their own row → push notification trigger fires
        // for everyone, not just for users with user_id IS NULL.
        const { error: rpcErr } = await supabase.rpc("broadcast_notification" as any, {
          _title: title.trim(),
          _message: message.trim(),
          _link: null,
          _scheduled_at: scheduledAt,
        });
        if (rpcErr) throw rpcErr;
      } else {
        const rows = selectedStudents.map(s => ({
          title: title.trim(),
          message: message.trim(),
          user_id: s.id,
          is_sent: isSent,
          scheduled_at: scheduledAt,
          notification_type: "admin",
        }));
        await supabase.from("notifications").insert(rows as any);
      }

      toast.success(isScheduled ? "تم جدولة الإشعار بنجاح" : "تم إرسال الإشعار بنجاح");
      setTitle("");
      setMessage("");
      setSelectedStudents([]);
      setScheduleEnabled(false);
      setScheduledDate("");
      setScheduledTime("");
      loadRecords();
      loadPending();
    } catch (error) {
      console.error(error);
      toast.error("خطأ في إرسال الإشعار");
    } finally {
      setSending(false);
    }
  };

  const deletePending = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    toast.success("تم حذف الإشعار المجدول");
    loadPending();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredRecords = recordSearch.trim()
    ? records.filter(r =>
      r.title.includes(recordSearch) ||
      r.message.includes(recordSearch) ||
      formatDate(r.created_at).includes(recordSearch)
    )
    : records;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" />
          مركز الإشعارات
        </h2>
        <div className="flex gap-2">
          <Button
            variant={view === "compose" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("compose")}
            className="gap-1"
          >
            <Plus className="h-4 w-4" /> إشعار جديد
          </Button>
          <Button
            variant={view === "records" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("records")}
            className="gap-1"
          >
            <Archive className="h-4 w-4" /> السجلات
            {records.length > 0 && (
              <Badge variant="secondary" className="mr-1 text-xs">{records.length}</Badge>
            )}
          </Button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {view === "compose" && (
          <motion.div key="compose" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="space-y-4">
              {/* Pending scheduled notifications */}
              {pending.length > 0 && (
                <Card className="border-amber-200 bg-amber-50/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
                      <Clock className="h-4 w-4" /> إشعارات مجدولة ({pending.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {pending.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-2 bg-white rounded-lg border">
                        <div>
                          <p className="text-sm font-medium">{p.title}</p>
                          <p className="text-xs text-muted-foreground">
                            <Clock className="h-3 w-3 inline ml-1" />
                            {formatDate(p.scheduled_at)}
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => deletePending(p.id)} className="text-destructive h-8 w-8">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Compose Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5 text-primary" /> إنشاء إشعار جديد
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Target selection */}
                  <div>
                    <Label className="mb-2 block font-semibold">إرسال إلى</Label>
                    <div className="flex gap-3">
                      <Button
                        variant={targetType === "all" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTargetType("all")}
                        className="gap-1"
                      >
                        <Users className="h-4 w-4" /> جميع الطلاب
                      </Button>
                      <Button
                        variant={targetType === "selected" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTargetType("selected")}
                        className="gap-1"
                      >
                        <User className="h-4 w-4" /> طلاب محددين
                      </Button>
                    </div>
                  </div>

                  {/* Student selection */}
                  {targetType === "selected" && (
                    <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
                      <div className="relative">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={studentSearch}
                          onChange={e => setStudentSearch(e.target.value)}
                          placeholder="ابحث بالاسم أو الكود أو البريد..."
                          className="pr-9"
                        />
                        {searching && <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                      </div>

                      {/* Search results dropdown */}
                      {studentResults.length > 0 && (
                        <div className="bg-card border rounded-lg shadow-md max-h-40 overflow-y-auto">
                          {studentResults.map(s => (
                            <button
                              key={s.id}
                              onClick={() => addStudent(s)}
                              className="w-full flex items-center gap-2 p-2 hover:bg-accent/50 text-right transition-colors"
                            >
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <User className="h-4 w-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{s.full_name}</p>
                                <p className="text-xs text-muted-foreground">#{s.student_code || "-"}</p>
                              </div>
                              <Plus className="h-4 w-4 text-primary shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Selected students chips */}
                      {selectedStudents.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {selectedStudents.map(s => (
                            <Badge key={s.id} variant="secondary" className="gap-1 py-1 px-2">
                              {s.full_name}
                              <button onClick={() => removeStudent(s.id)}>
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}

                      {selectedStudents.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          تم تحديد {selectedStudents.length} طالب
                        </p>
                      )}
                    </div>
                  )}

                  {/* Title */}
                  <div>
                    <Label className="mb-1 block">عنوان الإشعار *</Label>
                    <Input
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="عنوان الإشعار"
                    />
                  </div>

                  {/* Message */}
                  <div>
                    <Label className="mb-1 block">نص الرسالة *</Label>
                    <Textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="اكتب رسالة الإشعار هنا..."
                      rows={4}
                    />
                  </div>

                  {/* Schedule toggle */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scheduleEnabled}
                        onChange={e => setScheduleEnabled(e.target.checked)}
                        className="rounded"
                      />
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">جدولة الإشعار لوقت لاحق</span>
                    </label>
                    {scheduleEnabled && (
                      <div className="flex gap-3">
                        <Input
                          type="date"
                          value={scheduledDate}
                          onChange={e => setScheduledDate(e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          type="time"
                          value={scheduledTime}
                          onChange={e => setScheduledTime(e.target.value)}
                          className="w-32"
                        />
                      </div>
                    )}
                  </div>

                  {/* Send button */}
                  <Button onClick={handleSend} disabled={sending} className="w-full gap-2">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {scheduleEnabled ? "جدولة الإشعار" : "إرسال الإشعار"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}

        {view === "records" && (
          <motion.div key="records" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Archive className="h-5 w-5 text-primary" /> سجل الإشعارات المرسلة
                  </CardTitle>
                  <div className="relative w-64">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={recordSearch}
                      onChange={e => setRecordSearch(e.target.value)}
                      placeholder="بحث في السجلات..."
                      className="pr-9 h-9"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {recordsLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : filteredRecords.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Archive className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">لا توجد سجلات</p>
                    <p className="text-sm">ستظهر هنا جميع الإشعارات المرسلة</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[60vh]">
                    <div className="space-y-2">
                      {filteredRecords.map(notif => (
                        <div
                          key={notif.id}
                          className="p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-sm">{notif.title}</h4>
                                <Badge variant="outline" className="text-[10px] px-1.5">
                                  {notif.user_id ? "خاص" : "عام"}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {notif.message}
                              </p>
                            </div>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap mr-3">
                              {formatDate(notif.created_at)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationsPage;
