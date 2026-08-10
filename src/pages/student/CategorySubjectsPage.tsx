import { useNavigate, useSearchParams } from "react-router-dom";
import StudentLayout from "@/components/student/StudentLayout";
import { motion } from "framer-motion";
import {
  ChevronRight, Beaker, Microscope, Atom, FlaskConical,
  Landmark, Globe2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getScientificSubjectNames, subjectCategoryOverrideForScope } from "@/lib/educationSection";

const SCIENTIFIC_SUBJECT_CARDS: Record<string, { id: string; name: string; icon: typeof Atom; gradient: string; emoji: string }> = {
  "الفيزياء": { id: "الفيزياء", name: "الفيزياء", icon: Atom, gradient: "linear-gradient(135deg, hsl(220 85% 55%), hsl(245 80% 50%))", emoji: "⚡" },
  "الكيمياء": { id: "الكيمياء", name: "الكيمياء", icon: FlaskConical, gradient: "linear-gradient(135deg, hsl(160 75% 45%), hsl(175 80% 40%))", emoji: "🧪" },
  "الأحياء": { id: "الأحياء", name: "الأحياء", icon: Microscope, gradient: "linear-gradient(135deg, hsl(140 70% 45%), hsl(95 70% 45%))", emoji: "🔬" },
  "الرياضيات": { id: "الرياضيات", name: "الرياضيات", icon: Beaker, gradient: "linear-gradient(135deg, hsl(265 80% 60%), hsl(255 75% 50%))", emoji: "📐" },
  "التاريخ": { id: "التاريخ", name: "التاريخ", icon: Landmark, gradient: "linear-gradient(135deg, hsl(35 90% 50%), hsl(45 85% 45%))", emoji: "📜" },
};


const LITERARY_SUBJECTS = [
  { id: "history_geo_combo", name: "التاريخ والجغرافيا", icon: Landmark, gradient: "linear-gradient(135deg, hsl(28 90% 55%), hsl(20 85% 45%))", emoji: "📜" },
  { id: "الرياضيات", name: "الرياضيات", icon: Beaker, gradient: "linear-gradient(135deg, hsl(265 80% 60%), hsl(255 75% 50%))", emoji: "📐" },
];

const HISTORY_GEO_SUBJECTS = [
  { id: "التاريخ", name: "التاريخ", icon: Landmark, gradient: "linear-gradient(135deg, hsl(35 90% 50%), hsl(45 85% 45%))", emoji: "📜" },
  { id: "الجغرافيا", name: "الجغرافيا", icon: Globe2, gradient: "linear-gradient(135deg, hsl(180 75% 45%), hsl(195 80% 50%))", emoji: "🗺️" },
];

const PREPARATORY_SCIENCE = [
  { id: "العلوم", name: "العلوم", icon: Beaker, gradient: "linear-gradient(135deg, hsl(220 85% 55%), hsl(240 80% 50%))", emoji: "🔬" },
  { id: "الرياضيات", name: "الرياضيات", icon: Atom, gradient: "linear-gradient(135deg, hsl(265 80% 60%), hsl(255 75% 50%))", emoji: "📐" },
];

const PREPARATORY_SOCIAL = [
  { id: "الدراسات", name: "الدراسات الاجتماعية", icon: Globe2, gradient: "linear-gradient(135deg, hsl(265 80% 60%), hsl(255 75% 50%))", emoji: "🌍" },
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
  const isHistoryGeo = category === "history_geo";
  const isScience = category === "science";
  const isSocial = category === "social";
  // First secondary (general + Azhar scientific): integrated science + math only.
  const isFirstSecondary = stage === "secondary" && grade === "first";
  const FIRST_SECONDARY_SCIENTIFIC = [
    { id: "العلوم المتكاملة", name: "العلوم المتكاملة", icon: Beaker, gradient: "linear-gradient(135deg, hsl(200 80% 50%), hsl(160 75% 45%))", emoji: "🔬" },
    { id: "الرياضيات", name: "الرياضيات", icon: Atom, gradient: "linear-gradient(135deg, hsl(265 80% 60%), hsl(255 75% 50%))", emoji: "📐" },
  ];

  const scientificSubjects = isFirstSecondary
    ? FIRST_SECONDARY_SCIENTIFIC
    : getScientificSubjectNames({ stage, grade, section })
        .map((name) => SCIENTIFIC_SUBJECT_CARDS[name])
        .filter(Boolean);

  let subjects = isScientific ? scientificSubjects
    : isLiterary ? LITERARY_SUBJECTS
    : isHistoryGeo ? HISTORY_GEO_SUBJECTS
    : isScience ? (isFirstSecondary ? FIRST_SECONDARY_SCIENTIFIC : PREPARATORY_SCIENCE)
    : isSocial ? PREPARATORY_SOCIAL
    : [];

  const title = isScientific
    ? isScienceSpecialty(section)
      ? "مواد علمي علوم"
      : isMathSpecialty(section)
        ? "مواد علمي رياضة"
        : "المواد العلمية"
    : isLiterary ? "المواد الأدبية"
    : isHistoryGeo ? "التاريخ والجغرافيا"
    : isScience ? "العلوم" : "الدراسات";


  const bundleId = params.get("bundleId") || "";
  const bundleCategory = params.get("bundleCategory") || "";
  const returnTo = params.get("returnTo") || "";
  const bundleSuffix = bundleId
    ? `&bundleId=${encodeURIComponent(bundleId)}&bundleCategory=${encodeURIComponent(bundleCategory)}&returnTo=${encodeURIComponent(returnTo)}`
    : "";

  const handleSubjectClick = (subjectId: string) => {
    // Combined History+Geography card opens its own sub-page with two buttons
    if (subjectId === "history_geo_combo") {
      navigate(`/category-subjects?stage=${stage}&grade=${grade}${section ? `&section=${section}` : ""}&category=history_geo${bundleSuffix}`);
      return;
    }
    // For history_geo sub-cards, route to literary category with subject_name
    const targetCategory = isHistoryGeo ? "literary" : category;
    navigate(`/student-subject?stage=${stage}&grade=${grade}${section ? `&section=${section}` : ""}&category=${targetCategory}&subject_name=${encodeURIComponent(subjectId)}${bundleSuffix}`);
  };

  return (
    <StudentLayout title={title}>
      <div className="px-4 pt-4 pb-20 space-y-4">
        <Button variant="ghost" size="sm" className="gap-1.5 mb-1" onClick={() => navigate(bundleId && returnTo ? returnTo : "/dashboard")}>
          <ChevronRight className="h-4 w-4" /> {bundleId && returnTo ? "رجوع للباقة" : "الرئيسية"}
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
                style={{ background: sub.gradient }}
                className="group relative overflow-hidden rounded-2xl p-4 flex flex-col items-center gap-2.5 shadow-lg hover:shadow-xl active:scale-[0.96] transition-all duration-300 min-h-[130px] justify-center"
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
