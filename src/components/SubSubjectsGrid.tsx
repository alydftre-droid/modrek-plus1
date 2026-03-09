import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  BookOpen,
  BookText,
  BookMarked,
  Loader2,
  Plus,
  Trash2,
  Edit,
  ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";

// Default sub-subjects for seeding
const DEFAULT_ARABIC_SUBS = ["النحو", "الصرف", "البلاغة", "الأدب", "النصوص", "القراءة", "الإملاء", "التعبير"];
const DEFAULT_SHARIA_SUBS = ["الفقه", "الحديث", "التفسير", "التوحيد", "السيرة"];

export type SubSubjectRow = {
  id: string;
  group_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  order_index: number;
  created_by: string | null;
  is_active: boolean;
};

interface SubSubjectsGridProps {
  groupId: string;
  groupTitle: string;
  category: string;
  userId: string;
  isTeacher?: boolean;
  onSelectSubSubject: (sub: SubSubjectRow) => void;
  onBack: () => void;
}

function getDefaultSubs(category: string): string[] {
  const cat = (category || "").toLowerCase();
  if (cat.includes("عربي") || cat === "arabic") return DEFAULT_ARABIC_SUBS;
  if (cat.includes("شرعي") || cat === "religious" || cat === "sharia") return DEFAULT_SHARIA_SUBS;
  return [];
}

const SubSubjectsGrid = ({
  groupId,
  groupTitle,
  category,
  userId,
  isTeacher = false,
  onSelectSubSubject,
  onBack,
}: SubSubjectsGridProps) => {
  const [subSubjects, setSubSubjects] = useState<SubSubjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingSub, setEditingSub] = useState<SubSubjectRow | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  useEffect(() => {
    fetchSubSubjects();
  }, [groupId]);

  const fetchSubSubjects = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sub_subjects")
        .select("*")
        .eq("group_id", groupId)
        .eq("is_active", true)
        .order("order_index", { ascending: true });

      if (error) throw error;

      let subs = (data || []) as SubSubjectRow[];

      // Auto-seed defaults if empty and teacher
      if (subs.length === 0 && isTeacher) {
        const defaults = getDefaultSubs(category);
        if (defaults.length > 0) {
          const rows = defaults.map((name, i) => ({
            group_id: groupId,
            name,
            order_index: i,
            created_by: userId,
          }));
          const { data: inserted, error: insertErr } = await supabase
            .from("sub_subjects")
            .insert(rows)
            .select("*");
          if (!insertErr && inserted) {
            subs = inserted as SubSubjectRow[];
          }
        }
      }

      // Also auto-seed for students if empty (use service role or just show empty)
      if (subs.length === 0 && !isTeacher) {
        // Student sees no sub-subjects yet
      }

      setSubSubjects(subs);
    } catch (e) {
      console.error("Error fetching sub_subjects:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      const { error } = await supabase.from("sub_subjects").insert({
        group_id: groupId,
        name: newName.trim(),
        description: newDesc.trim() || null,
        order_index: subSubjects.length,
        created_by: userId,
      });
      if (error) throw error;
      toast.success("تمت إضافة المادة الفرعية");
      setShowAddDialog(false);
      setNewName("");
      setNewDesc("");
      fetchSubSubjects();
    } catch (e: any) {
      if (e?.code === "23505") {
        toast.error("هذه المادة موجودة بالفعل");
      } else {
        toast.error("حدث خطأ");
      }
    }
  };

  const handleEdit = async () => {
    if (!editingSub || !newName.trim()) return;
    try {
      const { error } = await supabase
        .from("sub_subjects")
        .update({ name: newName.trim(), description: newDesc.trim() || null })
        .eq("id", editingSub.id);
      if (error) throw error;
      toast.success("تم التعديل");
      setShowEditDialog(false);
      setEditingSub(null);
      setNewName("");
      setNewDesc("");
      fetchSubSubjects();
    } catch (e) {
      toast.error("حدث خطأ");
    }
  };

  const handleDelete = async () => {
    if (!editingSub) return;
    try {
      const { error } = await supabase
        .from("sub_subjects")
        .update({ is_active: false })
        .eq("id", editingSub.id);
      if (error) throw error;
      toast.success("تم الحذف");
      setShowDeleteConfirm(false);
      setEditingSub(null);
      fetchSubSubjects();
    } catch (e) {
      toast.error("حدث خطأ");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <Button variant="ghost" className="mb-6" onClick={onBack}>
        <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
        رجوع للمجموعات
      </Button>

      <div className="text-center mb-8">
        <Badge variant="secondary" className="mb-3 text-base px-4 py-1">{groupTitle}</Badge>
        <h2 className="text-2xl font-bold text-foreground">أقسام المادة</h2>
        <p className="text-muted-foreground mt-1">اختر القسم الذي تريد الدخول إليه</p>
      </div>

      {isTeacher && (
        <div className="flex justify-center mb-6">
          <Button
            onClick={() => {
              setNewName("");
              setNewDesc("");
              setShowAddDialog(true);
            }}
            className="gap-2"
          >
            <Plus className="h-5 w-5" />
            إضافة مادة فرعية
          </Button>
        </div>
      )}

      {subSubjects.length === 0 ? (
        <Card className="max-w-md mx-auto border-2 border-dashed">
          <CardContent className="p-8 text-center">
            <BookText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-bold mb-2">لا توجد أقسام فرعية</h3>
            <p className="text-muted-foreground">
              {isTeacher ? "أضف أقسام المادة الفرعية مثل نحو، صرف، بلاغة..." : "لم يقم المعلم بإضافة أقسام بعد"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {subSubjects.map((sub) => (
            <Card
              key={sub.id}
              className="cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all duration-300 group relative"
              onClick={() => onSelectSubSubject(sub)}
            >
              <CardContent className="p-5 text-center">
                <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <BookMarked className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">
                  {sub.name}
                </h3>
                {sub.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                    مادة {sub.name}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">اضغط للدخول</p>

                {/* Teacher edit/delete buttons */}
                {isTeacher && (
                  <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSub(sub);
                        setNewName(sub.name);
                        setNewDesc(sub.description || "");
                        setShowEditDialog(true);
                      }}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSub(sub);
                        setShowDeleteConfirm(true);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>إضافة مادة فرعية</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="اسم المادة الفرعية (مثل: نحو)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              dir="rtl"
            />
            <Input
              placeholder="وصف اختياري"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              dir="rtl"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>إلغاء</Button>
            <Button onClick={handleAdd} disabled={!newName.trim()}>إضافة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>تعديل المادة الفرعية</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="اسم المادة"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              dir="rtl"
            />
            <Input
              placeholder="وصف اختياري"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              dir="rtl"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>إلغاء</Button>
            <Button onClick={handleEdit} disabled={!newName.trim()}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المادة الفرعية</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف "{editingSub?.name}"؟ المحتوى المرتبط بها لن يُحذف.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SubSubjectsGrid;
