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

// Lighter pastel colors matching reference screenshots exactly
const CARD_STYLES = [
  {
    bg: "#F7F9FE",
    border: "#DCE4F5",
    iconBg: "#D6E0F5",
    iconColor: "#4D83D8",
    shadow: "0 10px 28px -18px rgba(77,131,216,0.22)",
  },
  {
    bg: "#F3FCF8",
    border: "#D2F0E6",
    iconBg: "#CFEFE2",
    iconColor: "#1F9A76",
    shadow: "0 10px 28px -18px rgba(31,154,118,0.22)",
  },
  {
    bg: "#FAF4FE",
    border: "#E6D7F3",
    iconBg: "#E3D0F4",
    iconColor: "#A14FE0",
    shadow: "0 10px 28px -18px rgba(161,79,224,0.22)",
  },
  {
    bg: "#FFF9F0",
    border: "#F6E7C8",
    iconBg: "#F9E7BD",
    iconColor: "#D88912",
    shadow: "0 10px 28px -18px rgba(216,137,18,0.2)",
  },
  {
    bg: "#F2FBFF",
    border: "#CDECF5",
    iconBg: "#CDEFF7",
    iconColor: "#1E99C1",
    shadow: "0 10px 28px -18px rgba(30,153,193,0.22)",
  },
  {
    bg: "#FFF2F7",
    border: "#F5D5E2",
    iconBg: "#F7CFDA",
    iconColor: "#E33768",
    shadow: "0 10px 28px -18px rgba(227,55,104,0.2)",
  },
  {
    bg: "#FFF3FF",
    border: "#F0D5F3",
    iconBg: "#F0CCF0",
    iconColor: "#C42CD8",
    shadow: "0 10px 28px -18px rgba(196,44,216,0.18)",
  },
  {
    bg: "#F6FFF0",
    border: "#DDF2C8",
    iconBg: "#E2F4C8",
    iconColor: "#76B61B",
    shadow: "0 10px 28px -18px rgba(118,182,27,0.2)",
  },
];
...
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

                {/* Icon */}
                <div
                  className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                  style={{
                    background: `linear-gradient(180deg, #FFFFFF 0%, ${style.iconBg} 100%)`,
                  }}
                >
                  <IconComp className="h-7 w-7" style={{ color: style.iconColor }} />
                </div>

                {/* Title */}
                <h3 className="relative mb-3 text-xl font-bold leading-snug" style={{ color: "#1F483B" }}>
                  {sub.name}
                </h3>

                {/* Dots + label */}
                <div className="relative flex items-center justify-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#9ECDBE" }} />
                  <span className="text-sm font-medium" style={{ color: "#6F9488" }}>اضغط للدخول</span>
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#9ECDBE" }} />
                </div>

                {/* Teacher edit/delete controls */}
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
            <Input placeholder="اسم القسم (مثل: نحو)" value={newName} onChange={(e) => setNewName(e.target.value)} dir="rtl" className="h-12 rounded-xl text-base" />
            <Input placeholder="وصف اختياري" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} dir="rtl" className="h-12 rounded-xl" />
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
            <Input placeholder="اسم القسم" value={newName} onChange={(e) => setNewName(e.target.value)} dir="rtl" className="h-12 rounded-xl text-base" />
            <Input placeholder="وصف اختياري" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} dir="rtl" className="h-12 rounded-xl" />
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
