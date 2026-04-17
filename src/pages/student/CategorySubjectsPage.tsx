import { useNavigate, useSearchParams } from "react-router-dom";
import StudentLayout from "@/components/student/StudentLayout";
import { motion } from "framer-motion";
import {
  ChevronRight, Beaker, Microscope, Atom, FlaskConical,
  Landmark, Globe2, Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getGeneralScientificSubjectNames, isMathSpecialty, isScienceSpecialty } from "@/lib/educationSection";

const SCIENCE_SPECIALTY_SUBJECTS = [
  { id: "الفيزياء", name: "الفيزياء", icon: Atom, gradient: "from-blue-500 to-indigo-600", emoji: "⚡" },
  { id: "الكيمياء", name: "الكيمياء", icon: FlaskConical, gradient: "from-emerald-500 to-teal-600", emoji: "🧪" },
  { id: "الأحياء", name: "الأحياء", icon: Microscope, gradient: "from-green-500 to-lime-600", emoji: "🔬" },
];

const MATH_SPECIALTY_SUBJECTS = [
  { id: "الفيزياء", name: "الفيزياء", icon: Atom, gradient: "from-blue-500 to-indigo-600", emoji: "⚡" },
  { id: "الكيمياء", name: "الكيمياء", icon: FlaskConical, gradient: "from-emerald-500 to-teal-600", emoji: "🧪" },
  { id: "الرياضيات", name: "الرياضيات", icon: Beaker, gradient: "from-purple-500 to-violet-600", emoji: "📐" },
];

const LITERARY_SUBJECTS = [
  { id: "history_geo_combo", name: "التاريخ والجغرافيا", icon: Landmark, gradient: "from-amber-500 to-orange-600", emoji: "📜" },
  { id: "الرياضيات", name: "الرياضيات", icon: Beaker, gradient: "from-purple-500 to-violet-600", emoji: "📐" },
];

const HISTORY_GEO_SUBJECTS = [
  { id: "التاريخ", name: "التاريخ", icon: Landmark, gradient: "from-amber-600 to-yellow-700", emoji: "📜" },
  { id: "الجغرافيا", name: "الجغرافيا", icon: Globe2, gradient: "from-teal-500 to-cyan-600", emoji: "🗺️" },
];

const PREPARATORY_SCIENCE = [
  { id: "العلوم", name: "العلوم", icon: Beaker, gradient: "from-blue-500 to-indigo-600", emoji: "🔬" },
  { id: "الرياضيات", name: "الرياضيات", icon: Atom, gradient: "from-purple-500 to-violet-600", emoji: "📐" },
];

const PREPARATORY_SOCIAL = [
  { id: "الدراسات", name: "الدراسات الاجتماعية", icon: Globe2, gradient: "from-purple-500 to-violet-600", emoji: "🌍" },
];

export default function CategorySubjectsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const stage = params.get("stage") || "";
  const grade = params.get("grade") || "";
  const section = params.get("section") || "";
  const category = params.get("category") || "";

  const isScientific = category === "scientific";
  const isLiterary = category === "literary";
  const isScience = category === "science";
  const isSocial = category === "social";
  const scientificSubjects = isMathSpecialty(section)
    ? MATH_SPECIALTY_SUBJECTS
    : isScienceSpecialty(section)
      ? SCIENCE_SPECIALTY_SUBJECTS
      : getGeneralScientificSubjectNames(section).map((name) => {
          if (name === "الفيزياء") return { id: "الفيزياء", name: "الفيزياء", icon: Atom, gradient: "from-blue-500 to-indigo-600", emoji: "⚡" };
          if (name === "الكيمياء") return { id: "الكيمياء", name: "الكيمياء", icon: FlaskConical, gradient: "from-emerald-500 to-teal-600", emoji: "🧪" };
          if (name === "الأحياء") return { id: "الأحياء", name: "الأحياء", icon: Microscope, gradient: "from-green-500 to-lime-600", emoji: "🔬" };
          return { id: "الرياضيات", name: "الرياضيات", icon: Beaker, gradient: "from-purple-500 to-violet-600", emoji: "📐" };
        });

  let subjects = isScientific ? scientificSubjects
    : isLiterary ? LITERARY_SUBJECTS
    : isScience ? PREPARATORY_SCIENCE
    : isSocial ? PREPARATORY_SOCIAL
    : [];

  const title = isScientific
    ? isScienceSpecialty(section)
      ? "مواد علمي علوم"
      : isMathSpecialty(section)
        ? "مواد علمي رياضة"
        : "المواد العلمية"
    : isLiterary ? "المواد الأدبية" : isScience ? "العلوم" : "الدراسات";

  const handleSubjectClick = (subjectName: string) => {
    navigate(`/student-subject?stage=${stage}&grade=${grade}${section ? `&section=${section}` : ""}&category=${category}&subject_name=${encodeURIComponent(subjectName)}`);
  };

  return (
    <StudentLayout title={title}>
      <div className="px-4 pt-4 pb-20 space-y-4">
        <Button variant="ghost" size="sm" className="gap-1.5 mb-1" onClick={() => navigate("/dashboard")}>
          <ChevronRight className="h-4 w-4" /> الرئيسية
        </Button>

        <div className="text-center mb-2">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">اختر المادة للدخول</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {subjects.map((sub, i) => {
            const Icon = sub.icon;
            return (
              <motion.button
                key={sub.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, type: "spring", stiffness: 200 }}
                onClick={() => handleSubjectClick(sub.id)}
                className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${sub.gradient} p-4 flex flex-col items-center gap-2.5
                  shadow-lg hover:shadow-xl active:scale-[0.96] transition-all duration-300`}
              >
                <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-6 translate-x-6" />
                <div className="absolute bottom-0 left-0 w-12 h-12 bg-white/5 rounded-full translate-y-4 -translate-x-4" />
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm relative">
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <span className="text-sm font-bold text-white drop-shadow-sm relative">{sub.name}</span>
                <span className="text-lg absolute top-2 left-2 opacity-30">{sub.emoji}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </StudentLayout>
  );
}
