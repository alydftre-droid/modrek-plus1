import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
  Plus,
  Trash2,
  Edit,
  ChevronLeft,
  Sparkles,
  GraduationCap,
  ScrollText,
  Feather,
  PenTool,
  Library,
  BookOpenCheck,
  Bookmark,
} from "lucide-react";
import { toast } from "sonner";

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

const CARD_STYLES = [
  {
    bg: "#EDF2FC",
    border: "#C8D6F0",
    iconBg: "#BDCDED",
    iconColor: "#3B72C4",
    shadow: "0 8px 24px -12px rgba(59,114,196,0.18)",
  },
  {
    bg: "#E8F7F2",
    border: "#B8E4D5",
    iconBg: "#ABD9CC",
    iconColor: "#1A8566",
    shadow: "0 8px 24px -12px rgba(26,133,102,0.18)",
  },
  {
    bg: "#F3ECFA",
    border: "#D6C2EC",
    iconBg: "#CEBAE8",
    iconColor: "#8B42C8",
    shadow: "0 8px 24px -12px rgba(139,66,200,0.18)",
  },
  {
    bg: "#FDF4E6",
    border: "#F0DEB8",
    iconBg: "#ECD5A5",
    iconColor: "#C8820A",
    shadow: "0 8px 24px -12px rgba(200,130,10,0.18)",
  },
  {
    bg: "#E8F4F8",
    border: "#B8DAE8",
    iconBg: "#ADD2E0",
    iconColor: "#1A7E9B",
    shadow: "0 8px 24px -12px rgba(26,126,155,0.18)",
  },
  {
    bg: "#FDEAEF",
    border: "#F0BFD0",
    iconBg: "#EAADC0",
    iconColor: "#D03060",
    shadow: "0 8px 24px -12px rgba(208,48,96,0.18)",
  },
  {
    bg: "#F5ECF8",
    border: "#E0C2E5",
    iconBg: "#D8B5DD",
    iconColor: "#9040A5",
    shadow: "0 8px 24px -12px rgba(144,64,165,0.18)",
  },
  {
    bg: "#ECF5E8",
    border: "#C5E0B8",
    iconBg: "#B8D8AA",
    iconColor: "#3D8530",
    shadow: "0 8px 24px -12px rgba(61,133,48,0.18)",
  },
] as const;

const ICONS = [BookMarked, ScrollText, Feather, PenTool, Library, BookOpenCheck, Bookmark, GraduationCap, BookText, BookOpen];

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

      toast.success("تمت إضافة المادة الفرعية بنجاح ✨");
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

      toast.success("تم التعديل بنجاح ✅");
      setShowEditDialog(false);
      setEditingSub(null);
      setNewName("");
      setNewDesc("");
      fetchSubSubjects();
    } catch {
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

      toast.success("تم الحذف بنجاح");
      setShowDeleteConfirm(false);
      setEditingSub(null);
      fetchSubSubjects();
    } catch {
      toast.error("حدث خطأ");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <div className="relative">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <Sparkles className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-primary" />
        </div>
        <p className="animate-pulse text-muted-foreground">جاري تحميل الأقسام...</p>
      </div>
    );
  }

  return (
    <motion.div
      className="mx-auto max-w-5xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
        <Button
          variant="ghost"
          className="group mb-6 gap-2 text-muted-foreground transition-colors hover:text-foreground"
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4 rotate-180 transition-transform group-hover:translate-x-1" />
          رجوع للمجموعات
        </Button>
      </motion.div>

      <motion.div
        className="mb-10 text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5, type: "spring", stiffness: 100 }}
      >
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-5 py-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          <span className="font-bold text-primary">{groupTitle}</span>
        </div>
        <h2 className="mb-2 text-3xl font-bold text-foreground">أقسام المادة</h2>
        <p className="text-lg text-muted-foreground">
          {isTeacher ? "أدِر أقسام المادة وارفع المحتوى داخل كل قسم" : "اختر القسم الذي تريد الدخول إليه"}
        </p>
      </motion.div>

      {isTeacher && (
        <motion.div
          className="mb-8 flex justify-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25, type: "spring", stiffness: 200, damping: 15 }}
        >
          <Button
            onClick={() => {
              setNewName("");
              setNewDesc("");
              setShowAddDialog(true);
            }}
            className="gap-3 rounded-2xl px-6 py-6 text-base shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
          >
            <Plus className="h-5 w-5" />
            إضافة قسم جديد
          </Button>
        </motion.div>
      )}

      {subSubjects.length === 0 ? (
        <motion.div
          className="mx-auto max-w-md"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <div className="relative rounded-3xl border-2 border-dashed border-primary/20 bg-primary/5 p-10 text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
              <BookText className="h-10 w-10 text-primary/60" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-foreground">لا توجد أقسام فرعية</h3>
            <p className="leading-relaxed text-muted-foreground">
              {isTeacher ? "أضف أقسام المادة مثل نحو، صرف، بلاغة..." : "لم يقم المعلم بإضافة أقسام بعد"}
            </p>
          </div>
        </motion.div>
      ) : (
        <motion.div
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
        >
          {subSubjects.map((sub, index) => {
            const style = CARD_STYLES[index % CARD_STYLES.length];
            const IconComp = ICONS[index % ICONS.length];

            return (
              <motion.div
                key={sub.id}
                variants={{
                  hidden: { opacity: 0, y: 20, scale: 0.95 },
                  visible: { opacity: 1, y: 0, scale: 1 },
                }}
                transition={{ type: "spring", stiffness: 220, damping: 18 }}
                whileHover={{ y: -3, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group relative cursor-pointer overflow-hidden rounded-[20px] px-4 py-5 text-center transition-all duration-300"
                style={{
                  background: `linear-gradient(180deg, #FFFFFF 0%, ${style.bg} 100%)`,
                  border: `1.5px solid ${style.border}`,
                  boxShadow: style.shadow,
                }}
                onClick={() => onSelectSubSubject(sub)}
              >
                <div className="pointer-events-none absolute inset-0 rounded-[20px] bg-white/35" />
                <div className="pointer-events-none absolute inset-x-5 top-3 h-10 rounded-full bg-white/55 blur-2xl" />

                <div
                  className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                  style={{
                    background: `linear-gradient(180deg, #FFFFFF 0%, ${style.iconBg} 100%)`,
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
                  }}
                >
                  <IconComp className="h-7 w-7" style={{ color: style.iconColor }} />
                </div>

                <h3 className="relative mb-3 text-xl font-bold leading-snug" style={{ color: "#1F483B" }}>
                  {sub.name}
                </h3>

                <div className="relative flex items-center justify-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#9ECDBE" }} />
                  <span className="text-sm font-medium" style={{ color: "#6F9488" }}>
                    اضغط للدخول
                  </span>
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#9ECDBE" }} />
                </div>

                {isTeacher && (
                  <div className="absolute left-3 top-3 flex gap-1 opacity-0 transition-all duration-300 group-hover:opacity-100">
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground shadow-sm transition-colors hover:text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSub(sub);
                        setNewName(sub.name);
                        setNewDesc(sub.description || "");
                        setShowEditDialog(true);
                      }}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground shadow-sm transition-colors hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSub(sub);
                        setShowDeleteConfirm(true);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Plus className="h-4 w-4 text-primary" />
              </div>
              إضافة قسم جديد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              placeholder="اسم القسم (مثل: نحو)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              dir="rtl"
              className="h-12 rounded-xl text-base"
            />
            <Input
              placeholder="وصف اختياري"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              dir="rtl"
              className="h-12 rounded-xl"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="rounded-xl">
              إلغاء
            </Button>
            <Button onClick={handleAdd} disabled={!newName.trim()} className="gap-2 rounded-xl">
              <Sparkles className="h-4 w-4" />
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Edit className="h-4 w-4 text-primary" />
              </div>
              تعديل القسم
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              placeholder="اسم القسم"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              dir="rtl"
              className="h-12 rounded-xl text-base"
            />
            <Input
              placeholder="وصف اختياري"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              dir="rtl"
              className="h-12 rounded-xl"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowEditDialog(false)} className="rounded-xl">
              إلغاء
            </Button>
            <Button onClick={handleEdit} disabled={!newName.trim()} className="rounded-xl">
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف القسم</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف "<span className="font-bold text-foreground">{editingSub?.name}</span>"؟ المحتوى المرتبط بها لن يُحذف.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl">إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-xl bg-destructive hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};

export default SubSubjectsGrid;
