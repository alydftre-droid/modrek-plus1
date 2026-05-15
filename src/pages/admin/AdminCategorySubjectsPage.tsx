import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChevronLeft, Beaker, Microscope, Atom, FlaskConical,
  Landmark, Globe2, BookOpen, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Subject = {
  id: string;
  name: string;
  icon: typeof Atom;
  gradient: string;
  emoji: string;
};

const SCIENTIFIC_SUBJECTS: Subject[] = [
  { id: "الفيزياء", name: "الفيزياء", icon: Atom, gradient: "linear-gradient(135deg, hsl(220 85% 55%), hsl(245 80% 50%))", emoji: "⚡" },
  { id: "الكيمياء", name: "الكيمياء", icon: FlaskConical, gradient: "linear-gradient(135deg, hsl(160 75% 45%), hsl(175 80% 40%))", emoji: "🧪" },
  { id: "الأحياء", name: "الأحياء", icon: Microscope, gradient: "linear-gradient(135deg, hsl(140 70% 45%), hsl(95 70% 45%))", emoji: "🔬" },
  { id: "الرياضيات", name: "الرياضيات", icon: Beaker, gradient: "linear-gradient(135deg, hsl(265 80% 60%), hsl(255 75% 50%))", emoji: "📐" },
];

const LITERARY_SUBJECTS: Subject[] = [
  { id: "التاريخ", name: "التاريخ", icon: Landmark, gradient: "linear-gradient(135deg, hsl(35 90% 50%), hsl(45 85% 45%))", emoji: "📜" },
  { id: "الجغرافيا", name: "الجغرافيا", icon: Globe2, gradient: "linear-gradient(135deg, hsl(180 75% 45%), hsl(195 80% 50%))", emoji: "🗺️" },
  { id: "الفلسفة", name: "الفلسفة والمنطق", icon: BookOpen, gradient: "linear-gradient(135deg, hsl(28 90% 55%), hsl(20 85% 45%))", emoji: "🧠" },
  { id: "الرياضيات", name: "الرياضيات", icon: Beaker, gradient: "linear-gradient(135deg, hsl(265 80% 60%), hsl(255 75% 50%))", emoji: "📐" },
];

const PREP_SCIENCE: Subject[] = [
  { id: "العلوم", name: "العلوم", icon: Beaker, gradient: "linear-gradient(135deg, hsl(220 85% 55%), hsl(240 80% 50%))", emoji: "🔬" },
  { id: "الرياضيات", name: "الرياضيات", icon: Atom, gradient: "linear-gradient(135deg, hsl(265 80% 60%), hsl(255 75% 50%))", emoji: "📐" },
];

const PREP_SOCIAL: Subject[] = [
  { id: "الدراسات", name: "الدراسات الاجتماعية", icon: Globe2, gradient: "linear-gradient(135deg, hsl(265 80% 60%), hsl(255 75% 50%))", emoji: "🌍" },
];

export default function AdminCategorySubjectsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const stage = params.get("stage") || "";
  const grade = params.get("grade") || "";
  const category = params.get("category") || "";

  let subjects: Subject[] = [];
  let title = "";

  if (category === "scientific") { subjects = SCIENTIFIC_SUBJECTS; title = "المواد العلمية"; }
  else if (category === "literary") { subjects = LITERARY_SUBJECTS; title = "المواد الأدبية"; }
  else if (category === "science") { subjects = PREP_SCIENCE; title = "العلوم"; }
  else if (category === "social") { subjects = PREP_SOCIAL; title = "الدراسات"; }

  const handleSubjectClick = (subjectId: string) => {
    navigate(
      `/admin/upload/content?stage=${stage}&grade=${grade}&category=${category}&subject_name=${encodeURIComponent(subjectId)}`
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4">
          <Link to="/admin" className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl gradient-mudrik shadow-lg">
              <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
            </div>
            <span className="text-base sm:text-xl font-bold text-gradient-mudrik">مدرك Plus</span>
          </Link>
          <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
            <span className="text-xs sm:text-sm font-medium text-primary">وضع الرفع</span>
          </div>
        </div>
      </header>

      <main className="px-4 pt-4 pb-20 max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" className="gap-1.5 mb-2" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-4 w-4 rotate-180" /> رجوع
        </Button>

        <div className="text-center mb-5">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">{title}</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">اختر المادة لإدارة محتواها</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {subjects.map((sub, i) => {
            const Icon = sub.icon;
            return (
              <motion.button
                key={sub.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, type: "spring", stiffness: 200 }}
                onClick={() => handleSubjectClick(sub.id)}
                style={{ background: sub.gradient }}
                className="group relative overflow-hidden rounded-2xl p-4 flex flex-col items-center gap-2.5 shadow-lg hover:shadow-xl active:scale-[0.96] transition-all duration-300 min-h-[140px] justify-center"
              >
                <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-6 translate-x-6" />
                <div className="absolute bottom-0 left-0 w-12 h-12 bg-white/5 rounded-full translate-y-4 -translate-x-4" />
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm relative">
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <span className="text-sm sm:text-base font-bold text-white drop-shadow-sm relative">{sub.name}</span>
                <span className="text-lg absolute top-2 left-2 opacity-30">{sub.emoji}</span>
              </motion.button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
