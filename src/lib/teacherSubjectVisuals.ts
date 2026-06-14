/**
 * Subject + grade themed visuals for teacher dashboard.
 * Pure UI mapping — no business logic, no data side effects.
 */

export type SubjectVisual = {
  gradient: string; // tailwind classes for bg gradient
  ring: string; // ring/border color class
  iconBg: string; // small icon tile bg
  accent: string; // accent text color class
  emoji: string; // contextual emoji
  pattern: "math" | "physics" | "chem" | "bio" | "arabic" | "english" | "french" | "sharia" | "studies" | "default";
};

const CATEGORY_PALETTES: Record<string, { base: string[]; emojis: string[]; pattern: SubjectVisual["pattern"]; accent: string; iconBg: string; ring: string }> = {
  math: {
    base: [
      "from-violet-400 via-fuchsia-400 to-pink-400",
      "from-indigo-400 via-violet-500 to-purple-500",
      "from-purple-500 via-fuchsia-500 to-rose-500",
    ],
    emojis: ["📐", "➗", "📊"],
    pattern: "math",
    accent: "text-violet-700",
    iconBg: "bg-violet-100",
    ring: "ring-violet-300/50",
  },
  science: {
    base: [
      "from-emerald-400 via-teal-400 to-cyan-400",
      "from-cyan-400 via-sky-500 to-blue-500",
      "from-teal-500 via-emerald-500 to-lime-500",
    ],
    emojis: ["⚗️", "🔬", "🧬"],
    pattern: "chem",
    accent: "text-emerald-700",
    iconBg: "bg-emerald-100",
    ring: "ring-emerald-300/50",
  },
  integrated_science: {
    base: [
      "from-cyan-400 via-blue-400 to-indigo-400",
      "from-sky-400 via-cyan-500 to-teal-500",
      "from-blue-500 via-indigo-500 to-violet-500",
    ],
    emojis: ["🧪", "🧫", "⚛️"],
    pattern: "physics",
    accent: "text-sky-700",
    iconBg: "bg-sky-100",
    ring: "ring-sky-300/50",
  },
  arabic: {
    base: [
      "from-amber-400 via-orange-400 to-rose-400",
      "from-yellow-400 via-amber-500 to-orange-500",
      "from-orange-500 via-amber-500 to-yellow-500",
    ],
    emojis: ["📖", "✒️", "📜"],
    pattern: "arabic",
    accent: "text-amber-700",
    iconBg: "bg-amber-100",
    ring: "ring-amber-300/50",
  },
  english: {
    base: [
      "from-red-400 via-rose-400 to-pink-400",
      "from-rose-500 via-red-500 to-orange-500",
      "from-pink-500 via-rose-500 to-red-500",
    ],
    emojis: ["🇬🇧", "🔤", "📚"],
    pattern: "english",
    accent: "text-rose-700",
    iconBg: "bg-rose-100",
    ring: "ring-rose-300/50",
  },
  french: {
    base: [
      "from-blue-400 via-indigo-400 to-purple-400",
      "from-indigo-500 via-blue-500 to-cyan-500",
      "from-violet-500 via-indigo-500 to-blue-500",
    ],
    emojis: ["🇫🇷", "🗼", "📕"],
    pattern: "french",
    accent: "text-indigo-700",
    iconBg: "bg-indigo-100",
    ring: "ring-indigo-300/50",
  },
  sharia: {
    base: [
      "from-emerald-500 via-green-500 to-teal-500",
      "from-green-500 via-emerald-600 to-teal-600",
      "from-teal-500 via-emerald-500 to-green-500",
    ],
    emojis: ["🕌", "📿", "🕋"],
    pattern: "sharia",
    accent: "text-emerald-800",
    iconBg: "bg-emerald-100",
    ring: "ring-emerald-300/50",
  },
  studies: {
    base: [
      "from-orange-400 via-amber-400 to-yellow-400",
      "from-yellow-500 via-orange-500 to-red-500",
      "from-amber-500 via-orange-500 to-rose-500",
    ],
    emojis: ["🗺️", "🌍", "🏛️"],
    pattern: "studies",
    accent: "text-orange-700",
    iconBg: "bg-orange-100",
    ring: "ring-orange-300/50",
  },
  literary: {
    base: [
      "from-rose-400 via-pink-400 to-fuchsia-400",
      "from-pink-500 via-rose-500 to-red-500",
      "from-fuchsia-500 via-pink-500 to-rose-500",
    ],
    emojis: ["📜", "🖋️", "🎭"],
    pattern: "studies",
    accent: "text-pink-700",
    iconBg: "bg-pink-100",
    ring: "ring-pink-300/50",
  },
};

const DEFAULT_PALETTE = {
  base: [
    "from-slate-400 via-slate-500 to-slate-600",
    "from-zinc-400 via-zinc-500 to-zinc-600",
    "from-gray-400 via-gray-500 to-gray-600",
  ],
  emojis: ["🎓", "📚", "🏆"],
  pattern: "default" as const,
  accent: "text-slate-700",
  iconBg: "bg-slate-100",
  ring: "ring-slate-300/50",
};

function gradeIndex(grade: string): number {
  const g = (grade || "").trim();
  if (g.includes("الأول") || g === "first") return 0;
  if (g.includes("الثاني") || g === "second") return 1;
  if (g.includes("الثالث") || g === "third") return 2;
  return 0;
}

export function getSubjectVisual(category: string, grade: string): SubjectVisual {
  const key = (category || "").trim();
  const palette = CATEGORY_PALETTES[key] || DEFAULT_PALETTE;
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
