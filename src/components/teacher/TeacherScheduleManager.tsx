import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  Loader2,
  Save,
} from "lucide-react";

interface Schedule {
  id: string;
  day_of_week: string;
  time_slot: string;
}

const DAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

const TeacherScheduleManager = () => {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newDay, setNewDay] = useState("");
  const [newTime, setNewTime] = useState("");

  useEffect(() => {
    if (user) fetchSchedules();
  }, [user]);

  const fetchSchedules = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("teacher_schedules")
      .select("*")
      .eq("teacher_id", user.id)
      .order("created_at");
    setSchedules(data || []);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!user || !newDay || !newTime) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("teacher_schedules").insert({
        teacher_id: user.id,
        day_of_week: newDay,
        time_slot: newTime,
      });
      if (error) throw error;
      toast.success("تم إضافة الموعد");
      setShowAdd(false);
      setNewDay("");
      setNewTime("");
      fetchSchedules();
    } catch (e) {
      toast.error("خطأ في إضافة الموعد");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("teacher_schedules").delete().eq("id", id);
    setSchedules(prev => prev.filter(s => s.id !== id));
    toast.success("تم حذف الموعد");
  };

  if (loading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            مواعيد الحصص
          </h3>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            إضافة موعد
          </Button>
        </div>

        {schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">لم يتم تحديد مواعيد بعد</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {schedules.map(s => (
              <Badge key={s.id} variant="secondary" className="gap-1 pl-1 pr-2 py-1.5 text-sm">
                <Button variant="ghost" size="icon" className="h-5 w-5 hover:bg-destructive/20" onClick={() => handleDelete(s.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
                <Clock className="h-3 w-3" />
                {s.day_of_week} - {s.time_slot}
              </Badge>
            ))}
          </div>
        )}

        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>إضافة موعد حصة</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>اليوم</Label>
                <Select value={newDay} onValueChange={setNewDay}>
                  <SelectTrigger><SelectValue placeholder="اختر اليوم" /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الوقت</Label>
                <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdd(false)}>إلغاء</Button>
              <Button onClick={handleAdd} disabled={saving || !newDay || !newTime} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                إضافة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default TeacherScheduleManager;
