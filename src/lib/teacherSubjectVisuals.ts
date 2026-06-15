/**
 * Subject + grade themed visuals for teacher dashboard.
 * Pure UI mapping — no business logic, no data side effects.
 */

export type SubjectPattern =
  | "math"
  | "physics"
  | "chem"
  | "bio"
  | "geology"
  | "arabic"
  | "english"
  | "french"
  | "sharia"
  | "history"
  | "geography"
  | "philosophy"
  | "studies"
  | "default";

export type SubjectVisual = {
  gradient: string;
  ring: string;
  iconBg: string;
  accent: string;
  emoji: string;
  pattern: SubjectPattern;
};

type PaletteEntry = {
  base: string[];
  emojis: string[];
  pattern: SubjectPattern;
  accent: string;
  iconBg: string;
  ring: string;
};

const PALETTES: Record<string, PaletteEntry> = {
  math: {
    base: [
      "from-indigo-500 via-violet-500 to-fuchsia-500",
      "from-violet-500 via-purple-600 to-indigo-600",
      "from-fuchsia-500 via-pink-500 to-rose-500",
    ],
    emojis: ["📐", "∫", "📊"],
    pattern: "math",
    accent: "text-violet-700",
    iconBg: "bg-violet-100",
    ring: "ring-violet-300/60",
  },
  physics: {
    base: [
      "from-sky-500 via-blue-500 to-indigo-500",
      "from-blue-500 via-indigo-600 to-violet-600",
      "from-cyan-500 via-sky-500 to-blue-600",
    ],
    emojis: ["⚛️", "🧲", "🔌"],
    pattern: "physics",
    accent: "text-sky-700",
    iconBg: "bg-sky-100",
    ring: "ring-sky-300/60",
  },
  chemistry: {
    base: [
      "from-teal-500 via-emerald-500 to-green-500",
      "from-emerald-500 via-teal-600 to-cyan-600",
      "from-lime-500 via-emerald-500 to-teal-500",
    ],
    emojis: ["⚗️", "🧪", "🧫"],
    pattern: "chem",
    accent: "text-emerald-700",
    iconBg: "bg-emerald-100",
    ring: "ring-emerald-300/60",
  },
  bio: {
    base: [
      "from-emerald-500 via-green-500 to-lime-500",
      "from-green-600 via-emerald-600 to-teal-600",
      "from-lime-500 via-emerald-600 to-green-700",
    ],
    emojis: ["🧬", "🔬", "🌿"],
    pattern: "bio",
    accent: "text-emerald-800",
    iconBg: "bg-emerald-100",
    ring: "ring-emerald-300/60",
  },
  geology: {
    base: [
      "from-stone-500 via-amber-600 to-orange-600",
      "from-amber-600 via-orange-600 to-red-600",
      "from-orange-500 via-amber-700 to-stone-700",
    ],
    emojis: ["🪨", "🌋", "⛰️"],
    pattern: "geology",
    accent: "text-amber-800",
    iconBg: "bg-amber-100",
    ring: "ring-amber-300/60",
  },
  arabic: {
    base: [
      "from-amber-500 via-orange-500 to-rose-500",
      "from-orange-500 via-amber-600 to-yellow-600",
      "from-rose-500 via-orange-500 to-amber-500",
    ],
    emojis: ["📖", "✒️", "📜"],
    pattern: "arabic",
    accent: "text-amber-700",
    iconBg: "bg-amber-100",
    ring: "ring-amber-300/60",
  },
  english: {
    base: [
      "from-rose-500 via-red-500 to-orange-500",
      "from-red-500 via-rose-600 to-pink-600",
      "from-pink-500 via-rose-500 to-red-500",
    ],
    emojis: ["🇬🇧", "🔤", "📚"],
    pattern: "english",
    accent: "text-rose-700",
    iconBg: "bg-rose-100",
    ring: "ring-rose-300/60",
  },
  french: {
    base: [
      "from-blue-500 via-indigo-500 to-purple-500",
      "from-indigo-600 via-blue-600 to-cyan-600",
      "from-violet-500 via-indigo-600 to-blue-600",
    ],
    emojis: ["🇫🇷", "🗼", "📕"],
    pattern: "french",
    accent: "text-indigo-700",
    iconBg: "bg-indigo-100",
    ring: "ring-indigo-300/60",
  },
  sharia: {
    base: [
      "from-emerald-600 via-green-600 to-teal-600",
      "from-green-600 via-emerald-700 to-teal-700",
      "from-teal-600 via-emerald-700 to-green-700",
    ],
    emojis: ["🕌", "📿", "🕋"],
    pattern: "sharia",
    accent: "text-emerald-800",
    iconBg: "bg-emerald-100",
    ring: "ring-emerald-300/60",
  },
  studies: {
    base: [
      "from-orange-500 via-amber-500 to-yellow-500",
      "from-yellow-500 via-orange-600 to-red-600",
      "from-amber-600 via-orange-600 to-rose-600",
    ],
    emojis: ["🗺️", "🌍", "🏛️"],
    pattern: "studies",
    accent: "text-orange-700",
    iconBg: "bg-orange-100",
    ring: "ring-orange-300/60",
  },
  history: {
    base: [
      "from-amber-600 via-orange-700 to-red-700",
      "from-stone-600 via-amber-700 to-orange-700",
      "from-red-700 via-amber-800 to-stone-800",
    ],
    emojis: ["🏛️", "📜", "🗿"],
    pattern: "history",
    accent: "text-amber-800",
    iconBg: "bg-amber-100",
    ring: "ring-amber-300/60",
  },
  geography: {
    base: [
      "from-cyan-500 via-teal-500 to-emerald-500",
      "from-blue-500 via-cyan-600 to-teal-600",
      "from-emerald-500 via-teal-600 to-cyan-700",
    ],
    emojis: ["🌍", "🗺️", "🧭"],
    pattern: "geography",
    accent: "text-teal-700",
    iconBg: "bg-teal-100",
    ring: "ring-teal-300/60",
  },
  philosophy: {
    base: [
      "from-slate-600 via-indigo-600 to-violet-600",
      "from-indigo-700 via-purple-700 to-slate-700",
      "from-violet-700 via-fuchsia-700 to-pink-700",
    ],
    emojis: ["🧠", "💭", "📖"],
    pattern: "philosophy",
    accent: "text-indigo-700",
    iconBg: "bg-indigo-100",
    ring: "ring-indigo-300/60",
  },
  literary: {
    base: [
      "from-rose-500 via-pink-500 to-fuchsia-500",
      "from-pink-600 via-rose-600 to-red-600",
      "from-fuchsia-600 via-pink-600 to-rose-600",
    ],
    emojis: ["📜", "🖋️", "🎭"],
    pattern: "studies",
    accent: "text-pink-700",
    iconBg: "bg-pink-100",
    ring: "ring-pink-300/60",
  },
};

const DEFAULT_PALETTE: PaletteEntry = {
  base: [
    "from-indigo-500 via-violet-500 to-fuchsia-500",
    "from-emerald-500 via-teal-500 to-cyan-500",
    "from-rose-500 via-pink-500 to-fuchsia-500",
  ],
  emojis: ["🎓", "📚", "🏆"],
  pattern: "default",
  accent: "text-indigo-700",
  iconBg: "bg-indigo-100",
  ring: "ring-indigo-300/60",
};

/**
 * Map any user-facing category/subject string (Arabic or English) to a palette key.
 */
function resolvePaletteKey(raw: string): keyof typeof PALETTES | null {
  const v = (raw || "").trim();
  if (!v) return null;

  if (PALETTES[v]) return v as keyof typeof PALETTES;

  // English keys
  if (v === "science") return "bio";
  if (v === "integrated_science") return "physics";

  // Math
  if (v.includes("رياض")) return "math";
  // Physics
  if (v.includes("فيزياء") || v.includes("الفيزياء")) return "physics";
  // Chemistry
  if (v.includes("كيمياء") || v.includes("الكيمياء")) return "chemistry";
  // Biology
  if (v.includes("أحياء") || v.includes("الأحياء") || v.includes("احياء")) return "bio";
  // Geology
  if (v.includes("جيولوج")) return "geology";
  // Arabic language
  if (v.includes("العربية") || v.includes("عربي") || v === "المواد العربية") return "arabic";
  // English
  if (v.includes("إنجليزي") || v.includes("انجليزي") || v.toLowerCase().includes("english")) return "english";
  // French
  if (v.includes("فرنسي") || v.toLowerCase().includes("french")) return "french";
  // Sharia / Islamic
  if (v.includes("شرعي") || v.includes("إسلامي") || v.includes("اسلامي") || v.includes("دين") || v === "المواد الشرعية") return "sharia";
  // History
  if (v.includes("تاريخ")) return "history";
  // Geography
  if (v.includes("جغراف")) return "geography";
  // Philosophy / Psychology
  if (v.includes("فلسف") || v.includes("نفس") || v.includes("منطق")) return "philosophy";
  // Studies / Social
  if (v.includes("دراسات") || v.includes("اجتماع")) return "studies";
  // Literary
  if (v.includes("أدبي") || v.includes("ادبي")) return "literary";

  return null;
}

function gradeIndex(grade: string): number {
  const g = (grade || "").trim();
  if (g.includes("الأول") || g === "first") return 0;
  if (g.includes("الثاني") || g === "second") return 1;
  if (g.includes("الثالث") || g === "third") return 2;
  return 0;
}

export function getSubjectVisual(category: string, grade: string): SubjectVisual {
  const key = resolvePaletteKey(category);
  const palette = (key && PALETTES[key]) || DEFAULT_PALETTE;
  const idx = gradeIndex(grade);
  return {
    gradient: palette.base[idx % palette.base.length],
    emoji: palette.emojis[idx % palette.emojis.length],
    pattern: palette.pattern,
    accent: palette.accent,
    iconBg: palette.iconBg,
    ring: palette.ring,
  };
}
