import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Loader2,
  Package,
  DollarSign,
  Image,
  Calendar,
  AlertTriangle,
  BookOpen,
} from "lucide-react";

interface ContentGroup {
  id: string;
  title: string;
  description: string | null;
  month_label: string | null;
  image_url: string | null;
  price: number;
  price_approved: boolean | null;
  section_name: string;
  subject_id: string;
  is_active: boolean;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  lesson_count: number | null;
}

interface TeacherGroupManagerProps {
  subjectId: string;
  sectionName: string;
}

const TeacherGroupManager = ({ subjectId, sectionName }: TeacherGroupManagerProps) => {
  const { user } = useAuth();
  const [groups, setGroups] = useState<ContentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showPriceChange, setShowPriceChange] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<ContentGroup | null>(null);
  const [saving, setSaving] = useState(false);

  // Create form
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newMonthLabel, setNewMonthLabel] = useState("");
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [newLessonCount, setNewLessonCount] = useState("");

  // Price change form
  const [requestedPrice, setRequestedPrice] = useState("");
  const [priceReason, setPriceReason] = useState("");

  const [defaultPrice, setDefaultPrice] = useState(50);

  useEffect(() => {
    fetchGroups();
    fetchDefaultPrice();
  }, [subjectId]);

  const fetchDefaultPrice = async () => {
    const { data } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "subscription_default_price")
      .maybeSingle();
    if (data?.value) setDefaultPrice(Number(data.value) || 50);
  };

  const fetchGroups = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("content_groups")
      .select("*")
      .eq("subject_id", subjectId)
      .or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`)
      .order("created_at", { ascending: false });
    setGroups((data as ContentGroup[]) || []);
    setLoading(false);
  };

  const handleCreateGroup = async () => {
    if (!user || !newTitle.trim()) return;
    setSaving(true);
    try {
      let imageUrl: string | null = null;
      if (newImageFile) {
        const ext = newImageFile.name.split(".").pop();
        const path = `group-images/${user.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("books").upload(path, newImageFile);
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from("books").getPublicUrl(path);
          imageUrl = urlData.publicUrl;
        }
      }

      const { error } = await supabase.from("content_groups").insert({
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        month_label: newMonthLabel.trim() || null,
        image_url: imageUrl,
        price: defaultPrice,
        section_name: sectionName,
        subject_id: subjectId,
        teacher_id: user.id,
        created_by: user.id,
        is_active: true,
        price_approved: true,
        start_date: newStartDate || null,
        end_date: newEndDate || null,
        lesson_count: newLessonCount ? parseInt(newLessonCount) : 0,
      });

      if (error) throw error;
      toast.success("تم إنشاء المجموعة بنجاح - ستظهر للطلاب فوراً");
      setShowCreate(false);
      setNewTitle(""); setNewDescription(""); setNewMonthLabel(""); setNewImageFile(null);
      setNewStartDate(""); setNewEndDate(""); setNewLessonCount("");
      fetchGroups();
    } catch (e) {
      console.error(e);
      toast.error("خطأ في إنشاء المجموعة");
    } finally {
      setSaving(false);
    }
  };

  const handleRequestPriceChange = async () => {
    if (!user || !selectedGroup || !requestedPrice || !priceReason.trim()) return;
    setSaving(true);
    try {
      await supabase.from("price_change_requests").insert({
        teacher_id: user.id,
        group_id: selectedGroup.id,
        current_price: selectedGroup.price,
        requested_price: Number(requestedPrice),
        reason: priceReason.trim(),
      });

      await supabase
        .from("content_groups")
        .update({ price_approved: false })
        .eq("id", selectedGroup.id);

      toast.success("تم تقديم طلب تغيير السعر. الكورس لن يظهر للطلبة حتى الموافقة.");
      setShowPriceChange(false);
      setSelectedGroup(null); setRequestedPrice(""); setPriceReason("");
      fetchGroups();
    } catch (e) {
      console.error(e);
      toast.error("خطأ في تقديم الطلب");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          المجموعات / الكورسات
        </h3>
        <Button onClick={() => setShowCreate(true)} className="gap-2" size="sm">
          <Plus className="h-4 w-4" />
          إنشاء مجموعة جديدة
        </Button>
      </div>

      {groups.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="p-8 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">لا توجد مجموعات بعد. أنشئ مجموعة جديدة لتنظيم المحتوى.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((group) => (
            <Card key={group.id} className="overflow-hidden">
              {group.image_url && (
                <div className="h-32 bg-muted overflow-hidden">
                  <img src={group.image_url} alt={group.title} className="w-full h-full object-cover" />
                </div>
              )}
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold">{group.title}</h4>
                    {group.month_label && (
                      <Badge variant="outline" className="gap-1 text-xs mt-1">
                        <Calendar className="h-3 w-3" />
                        {group.month_label}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge className="bg-primary text-primary-foreground font-bold">{group.price} جنيه</Badge>
                    {group.price_approved === false && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <AlertTriangle className="h-3 w-3" />
                        بانتظار الموافقة
                      </Badge>
                    )}
                  </div>
                </div>
                {group.description && <p className="text-sm text-muted-foreground line-clamp-2">{group.description}</p>}
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {group.lesson_count ? <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />{group.lesson_count} حصة</span> : null}
                  {group.start_date && <span>من: {group.start_date}</span>}
                  {group.end_date && <span>إلى: {group.end_date}</span>}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 w-full"
                  onClick={() => { setSelectedGroup(group); setShowPriceChange(true); }}
                >
                  <DollarSign className="h-3 w-3" />
                  طلب تغيير السعر
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Group Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />إنشاء مجموعة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>اسم المجموعة *</Label><Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="مثال: كورس شهر 6" /></div>
            <div><Label>وصف المجموعة</Label><Textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="وصف مختصر للكورس..." rows={3} /></div>
            <div><Label>شهر الكورس</Label><Input value={newMonthLabel} onChange={(e) => setNewMonthLabel(e.target.value)} placeholder="مثال: كورس شهر 6" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>تاريخ بداية الحصص</Label><Input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} /></div>
              <div><Label>تاريخ انتهاء الحصص</Label><Input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} /></div>
            </div>
            <div><Label>عدد الحصص</Label><Input type="number" value={newLessonCount} onChange={(e) => setNewLessonCount(e.target.value)} placeholder="0" min={0} /></div>
            <div><Label>صورة المجموعة (اختياري)</Label><Input type="file" accept="image/*" onChange={(e) => setNewImageFile(e.target.files?.[0] || null)} /></div>
            <div className="p-3 rounded-lg bg-accent/50">
              <p className="text-sm text-muted-foreground">السعر الافتراضي: <span className="font-bold text-foreground">{defaultPrice} جنيه</span></p>
              <p className="text-xs text-muted-foreground mt-1">يمكنك طلب تغيير السعر بعد الإنشاء</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
            <Button onClick={handleCreateGroup} disabled={saving || !newTitle.trim()} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              إنشاء المجموعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price Change Dialog */}
      <Dialog open={showPriceChange} onOpenChange={setShowPriceChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />طلب تغيير سعر الكورس</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedGroup && (
              <div className="p-3 rounded-lg bg-accent/50">
                <p className="font-medium">{selectedGroup.title}</p>
                <p className="text-sm text-muted-foreground">السعر الحالي: {selectedGroup.price} جنيه</p>
              </div>
            )}
            <div><Label>السعر الجديد (جنيه) *</Label><Input type="number" value={requestedPrice} onChange={(e) => setRequestedPrice(e.target.value)} placeholder="أدخل السعر الجديد" min={0} /></div>
            <div><Label>سبب التغيير *</Label><Textarea value={priceReason} onChange={(e) => setPriceReason(e.target.value)} placeholder="اشرح سبب طلب تغيير السعر..." rows={3} /></div>
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900">
              <p className="text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                الكورس لن يظهر للطلبة حتى موافقة المطور على السعر الجديد.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPriceChange(false)}>إلغاء</Button>
            <Button onClick={handleRequestPriceChange} disabled={saving || !requestedPrice || !priceReason.trim()} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              تقديم الطلب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherGroupManager;
