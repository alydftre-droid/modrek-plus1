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
import { queueExternalSync } from "@/lib/externalSync";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Loader2,
  Package,
  DollarSign,
  Image,
  Calendar,
  AlertTriangle,
  BookOpen,
  Pencil,
  Trash2,
  EllipsisVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  teacherIdOverride?: string;
  renderTriggerOnly?: boolean;
  onGroupCreated?: () => void;
}

const TeacherGroupManager = ({ subjectId, sectionName, teacherIdOverride, renderTriggerOnly, onGroupCreated }: TeacherGroupManagerProps) => {
  const { user } = useAuth();
  const effectiveUserId = teacherIdOverride || user?.id;
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

  // Edit form
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMonthLabel, setEditMonthLabel] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editLessonCount, setEditLessonCount] = useState("");
  const [editImageFile, setEditImageFile] = useState<File | null>(null);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pressedGroupId, setPressedGroupId] = useState<string | null>(null);

  const [defaultPrice, setDefaultPrice] = useState(50);

  const openGroupActions = (group: ContentGroup) => {
    setSelectedGroup(group);
    setPressedGroupId(group.id);
  };

  const openEditDialog = (group: ContentGroup) => {
    setSelectedGroup(group);
    setEditTitle(group.title || "");
    setEditDescription(group.description || "");
    setEditMonthLabel(group.month_label || "");
    setEditStartDate(group.start_date || "");
    setEditEndDate(group.end_date || "");
    setEditLessonCount(group.lesson_count != null ? String(group.lesson_count) : "");
    setEditImageFile(null);
    setShowEdit(true);
  };

  const handleUpdateGroup = async () => {
    if (!effectiveUserId || !selectedGroup || !editTitle.trim()) return;
    setSaving(true);
    try {
      let imageUrl: string | undefined;
      if (editImageFile) {
        const ext = editImageFile.name.split(".").pop();
        const path = `group-images/${effectiveUserId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("books").upload(path, editImageFile);
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from("books").getPublicUrl(path);
          imageUrl = urlData.publicUrl;
        }
      }

      const updatePayload: Record<string, unknown> = {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        month_label: editMonthLabel.trim() || null,
        start_date: editStartDate || null,
        end_date: editEndDate || null,
        lesson_count: editLessonCount ? parseInt(editLessonCount) : 0,
      };
      if (imageUrl) updatePayload.image_url = imageUrl;

      const { error } = await supabase
        .from("content_groups")
        .update(updatePayload)
        .eq("id", selectedGroup.id);
      if (error) throw error;

      queueExternalSync(["tables"], true);
      toast.success("تم تحديث بيانات المجموعة بنجاح");
      setShowEdit(false);
      setSelectedGroup(null);
      if (!renderTriggerOnly) fetchGroups();
      onGroupCreated?.();
    } catch (e) {
      console.error(e);
      toast.error("خطأ في تحديث المجموعة");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!effectiveUserId || !selectedGroup) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("content_groups")
        .delete()
        .eq("id", selectedGroup.id);
      if (error) throw error;

      queueExternalSync(["tables"], true);
      toast.success(`تم حذف المجموعة "${selectedGroup.title}" نهائياً`);
      setGroups((prev) => prev.filter((g) => g.id !== selectedGroup.id));
      setShowDeleteConfirm(false);
      setSelectedGroup(null);
      onGroupCreated?.();
    } catch (e) {
      console.error(e);
      toast.error("تعذر حذف المجموعة. تأكد من صلاحياتك وحاول مرة أخرى.");
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!renderTriggerOnly) {
      fetchGroups();
    }
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
    if (!effectiveUserId) return;
    setLoading(true);
    // Get current term for this subject
    const { data: subjectInfo } = await supabase.from("subjects").select("stage, grade").eq("id", subjectId).maybeSingle();
    let termFilter = "term1";
    if (subjectInfo) {
      const gradeNum = subjectInfo.grade === "first" ? "1" : subjectInfo.grade === "second" ? "2" : subjectInfo.grade === "third" ? "3" : subjectInfo.grade;
      const { data: termData } = await supabase.from("system_terms").select("current_term").eq("stage", subjectInfo.stage).eq("grade", gradeNum).maybeSingle();
      termFilter = (termData?.current_term as string) || "term1";
    }
    const { data } = await supabase
      .from("content_groups")
      .select("*")
      .eq("subject_id", subjectId)
      .eq("term", termFilter)
      .or(`teacher_id.eq.${effectiveUserId},created_by.eq.${effectiveUserId}`)
      .order("created_at", { ascending: false });
    setGroups((data as ContentGroup[]) || []);
    setLoading(false);
  };

  const handleCreateGroup = async () => {
    if (!effectiveUserId || !newTitle.trim()) return;
    setSaving(true);
    try {
      let imageUrl: string | null = null;
      if (newImageFile) {
        const ext = newImageFile.name.split(".").pop();
        const path = `group-images/${effectiveUserId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("books").upload(path, newImageFile);
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from("books").getPublicUrl(path);
          imageUrl = urlData.publicUrl;
        }
      }

      // Get current term for this subject
      const { data: subjectInfo } = await supabase.from("subjects").select("stage, grade").eq("id", subjectId).maybeSingle();
      let termValue = "term1";
      if (subjectInfo) {
        const gradeNum = subjectInfo.grade === "first" ? "1" : subjectInfo.grade === "second" ? "2" : subjectInfo.grade === "third" ? "3" : subjectInfo.grade;
        const { data: termData } = await supabase.from("system_terms").select("current_term").eq("stage", subjectInfo.stage).eq("grade", gradeNum).maybeSingle();
        termValue = (termData?.current_term as string) || "term1";
      }

      const { error } = await supabase.from("content_groups").insert({
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        month_label: newMonthLabel.trim() || null,
        image_url: imageUrl,
        price: defaultPrice,
        section_name: sectionName,
        subject_id: subjectId,
        teacher_id: effectiveUserId,
        created_by: effectiveUserId,
        is_active: true,
        price_approved: true,
        start_date: newStartDate || null,
        end_date: newEndDate || null,
        lesson_count: newLessonCount ? parseInt(newLessonCount) : 0,
        term: termValue,
      });

      if (error) throw error;
        queueExternalSync(["tables"], true);
      toast.success("تم إنشاء المجموعة بنجاح - ستظهر للطلاب فوراً");
      setShowCreate(false);
      setNewTitle(""); setNewDescription(""); setNewMonthLabel(""); setNewImageFile(null);
      setNewStartDate(""); setNewEndDate(""); setNewLessonCount("");
      if (!renderTriggerOnly) fetchGroups();
      onGroupCreated?.();
    } catch (e) {
      console.error(e);
      toast.error("خطأ في إنشاء المجموعة");
    } finally {
      setSaving(false);
    }
  };

  const handleRequestPriceChange = async () => {
    if (!effectiveUserId || !selectedGroup || !requestedPrice || !priceReason.trim()) return;
    setSaving(true);
    try {
      await supabase.from("price_change_requests").insert({
        teacher_id: effectiveUserId,
        group_id: selectedGroup.id,
        current_price: selectedGroup.price,
        requested_price: Number(requestedPrice),
        reason: priceReason.trim(),
      });

      await supabase
        .from("content_groups")
        .update({ price_approved: false })
        .eq("id", selectedGroup.id);

      queueExternalSync(["tables"], true);

      toast.success("تم تقديم طلب تغيير السعر. الكورس لن يظهر للطلبة حتى الموافقة.");
      setShowPriceChange(false);
      setSelectedGroup(null); setRequestedPrice(""); setPriceReason("");
      if (!renderTriggerOnly) fetchGroups();
    } catch (e) {
      console.error(e);
      toast.error("خطأ في تقديم الطلب");
    } finally {
      setSaving(false);
    }
  };

  // If renderTriggerOnly, just show the create button and dialog
  if (renderTriggerOnly) {
    return (
      <>
        <Button onClick={() => setShowCreate(true)} className="gap-2" size="sm">
          <Plus className="h-4 w-4" />
          إنشاء مجموعة جديدة
        </Button>

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
      </>
    );
  }

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
            <Card
              key={group.id}
              className="overflow-hidden"
              onContextMenu={(e) => {
                e.preventDefault();
                openGroupActions(group);
              }}
              onTouchStart={() => openGroupActions(group)}
            >
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
                    <DropdownMenu open={pressedGroupId === group.id} onOpenChange={(open) => setPressedGroupId(open ? group.id : null)}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => openGroupActions(group)}
                        >
                          <EllipsisVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48" dir="rtl">
                        <DropdownMenuItem
                          className="gap-2"
                          onClick={() => {
                            setPressedGroupId(null);
                            openEditDialog(group);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                          تعديل المجموعة
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2 text-destructive focus:text-destructive"
                          onClick={() => {
                            setPressedGroupId(null);
                            setSelectedGroup(group);
                            setShowDeleteConfirm(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          حذف المجموعة
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-1 flex-1"
                    onClick={() => openEditDialog(group)}
                  >
                    <Pencil className="h-3 w-3" />
                    تعديل
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1 flex-1"
                    onClick={() => { setSelectedGroup(group); setShowDeleteConfirm(true); }}
                  >
                    <Trash2 className="h-3 w-3" />
                    حذف
                  </Button>
                </div>
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

      {/* Edit Group Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5" />تعديل بيانات المجموعة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>اسم المجموعة *</Label><Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="اسم المجموعة" /></div>
            <div><Label>وصف المجموعة</Label><Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="وصف مختصر للكورس..." rows={3} /></div>
            <div><Label>شهر الكورس</Label><Input value={editMonthLabel} onChange={(e) => setEditMonthLabel(e.target.value)} placeholder="مثال: كورس شهر 6" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>تاريخ بداية الحصص</Label><Input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} /></div>
              <div><Label>تاريخ انتهاء الحصص</Label><Input type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} /></div>
            </div>
            <div><Label>عدد الحصص</Label><Input type="number" value={editLessonCount} onChange={(e) => setEditLessonCount(e.target.value)} placeholder="0" min={0} /></div>
            <div><Label>تغيير صورة المجموعة (اختياري)</Label><Input type="file" accept="image/*" onChange={(e) => setEditImageFile(e.target.files?.[0] || null)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>إلغاء</Button>
            <Button onClick={handleUpdateGroup} disabled={saving || !editTitle.trim()} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              حذف المجموعة نهائياً؟
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedGroup ? `سيتم حذف المجموعة "${selectedGroup.title}" نهائياً ولن يتمكن الطلاب من رؤيتها بعد الآن. لا يمكن التراجع عن هذا الإجراء.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                handleDeleteGroup();
              }}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              تأكيد الحذف النهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TeacherGroupManager;
