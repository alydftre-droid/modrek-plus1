import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Loader2,
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

// Color palette for sub-subject cards
const CARD_COLORS = [
  { shell: "from-blue-100 via-indigo-50 to-blue-50", border: "border-blue-200", icon: "bg-blue-100 text-blue-600", dot: "bg-emerald-300", hover: "hover:border-blue-300 hover:shadow-blue-200/70" },
  { shell: "from-emerald-50 via-teal-50 to-emerald-100", border: "border-emerald-200", icon: "bg-emerald-100 text-emerald-600", dot: "bg-emerald-300", hover: "hover:border-emerald-300 hover:shadow-emerald-200/70" },
  { shell: "from-violet-50 via-fuchsia-50 to-purple-100", border: "border-fuchsia-200", icon: "bg-fuchsia-100 text-fuchsia-600", dot: "bg-emerald-300", hover: "hover:border-fuchsia-300 hover:shadow-fuchsia-200/70" },
  { shell: "from-amber-50 via-orange-50 to-yellow-100", border: "border-amber-200", icon: "bg-amber-100 text-amber-600", dot: "bg-emerald-300", hover: "hover:border-amber-300 hover:shadow-amber-200/70" },
  { shell: "from-cyan-50 via-sky-50 to-blue-50", border: "border-cyan-200", icon: "bg-cyan-100 text-cyan-600", dot: "bg-emerald-300", hover: "hover:border-cyan-300 hover:shadow-cyan-200/70" },
  { shell: "from-rose-50 via-pink-50 to-rose-100", border: "border-rose-200", icon: "bg-rose-100 text-rose-600", dot: "bg-emerald-300", hover: "hover:border-rose-300 hover:shadow-rose-200/70" },
  { shell: "from-purple-50 via-violet-50 to-fuchsia-50", border: "border-purple-200", icon: "bg-purple-100 text-purple-600", dot: "bg-emerald-300", hover: "hover:border-purple-300 hover:shadow-purple-200/70" },
  { shell: "from-lime-50 via-green-50 to-emerald-50", border: "border-lime-200", icon: "bg-lime-100 text-lime-600", dot: "bg-emerald-300", hover: "hover:border-lime-300 hover:shadow-lime-200/70" },
];

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
      toast.success("تم الحذف بنجاح");
      setShowDeleteConfirm(false);
      setEditingSub(null);
      fetchSubSubjects();
    } catch (e) {
      toast.error("حدث خطأ");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <Sparkles className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-muted-foreground animate-pulse">جاري تحميل الأقسام...</p>
      </div>
    );
  }

  return (
    <motion.div 
      className="max-w-5xl mx-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Back Button */}
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
        <Button 
          variant="ghost" 
          className="mb-6 gap-2 text-muted-foreground hover:text-foreground transition-colors group" 
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4 rotate-180 transition-transform group-hover:translate-x-1" />
          رجوع للمجموعات
        </Button>
      </motion.div>

      {/* Header Section */}
      <motion.div 
        className="text-center mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5, type: "spring", stiffness: 100 }}
      >
        <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-l from-primary/10 to-secondary/10 border border-primary/20 mb-4">
          <GraduationCap className="h-5 w-5 text-primary" />
          <span className="font-bold text-primary">{groupTitle}</span>
        </div>
        <h2 className="text-3xl font-bold text-foreground mb-2">
          أقسام المادة
        </h2>
        <p className="text-muted-foreground text-lg">
          {isTeacher ? "أدِر أقسام المادة وارفع المحتوى داخل كل قسم" : "اختر القسم الذي تريد الدخول إليه"}
        </p>
      </motion.div>

      {/* Teacher Add Button - Floating style */}
      {isTeacher && (
        <motion.div 
          className="flex justify-center mb-8"
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
            className="gap-3 px-6 py-6 text-base rounded-2xl bg-gradient-to-l from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 hover:-translate-y-0.5"
          >
            <motion.div 
              className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center"
              animate={{ rotate: [0, 90, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3, ease: "easeInOut" }}
            >
              <Plus className="h-5 w-5" />
            </motion.div>
            إضافة قسم جديد
          </Button>
        </motion.div>
      )}

      {/* Empty State */}
      {subSubjects.length === 0 ? (
        <motion.div 
          className="max-w-md mx-auto"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <div className="relative p-10 text-center rounded-3xl border-2 border-dashed border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary/15 to-secondary/15 flex items-center justify-center mb-5">
              <BookText className="h-10 w-10 text-primary/60" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">لا توجد أقسام فرعية</h3>
            <p className="text-muted-foreground leading-relaxed">
              {isTeacher ? "أضف أقسام المادة مثل نحو، صرف، بلاغة..." : "لم يقم المعلم بإضافة أقسام بعد"}
            </p>
          </div>
        </motion.div>
      ) : (
        <motion.div 
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.08 } }
          }}
        >
          {subSubjects.map((sub, index) => {
            const colorSet = CARD_COLORS[index % CARD_COLORS.length];
            const IconComp = ICONS[index % ICONS.length];

            return (
              <motion.div
                key={sub.id}
                variants={{
                  hidden: { opacity: 0, y: 26, scale: 0.92 },
                  visible: { opacity: 1, y: 0, scale: 1 }
                }}
                transition={{ type: "spring", stiffness: 220, damping: 18 }}
                whileHover={{ y: -4, scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className={`group relative cursor-pointer overflow-hidden rounded-[30px] border-2 ${colorSet.border} ${colorSet.hover} bg-gradient-to-br ${colorSet.shell} px-4 py-6 text-center shadow-[0_12px_34px_-18px_rgba(15,23,42,0.18)] transition-all duration-300`}
                onClick={() => onSelectSubSubject(sub)}
              >
                <div className="pointer-events-none absolute inset-0 rounded-[30px] border border-white/60" />
                <div className={`mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[28px] ${colorSet.icon} shadow-sm`}>
                  <IconComp className="h-10 w-10" />
                </div>

                <h3 className="text-2xl font-black text-foreground mb-2">
                  {sub.name}
                </h3>

                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <div className={`h-2.5 w-2.5 rounded-full ${colorSet.dot}`} />
                  <span className="text-[11px] sm:text-xs">اضغط للدخول</span>
                  <div className={`h-2.5 w-2.5 rounded-full ${colorSet.dot}`} />
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

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
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
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="rounded-xl">إلغاء</Button>
            <Button onClick={handleAdd} disabled={!newName.trim()} className="rounded-xl gap-2">
              <Sparkles className="h-4 w-4" />
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
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
            <Button variant="outline" onClick={() => setShowEditDialog(false)} className="rounded-xl">إلغاء</Button>
            <Button onClick={handleEdit} disabled={!newName.trim()} className="rounded-xl">حفظ التعديلات</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
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
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 rounded-xl">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};

export default SubSubjectsGrid;
