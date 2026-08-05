// Weekly lesson release schedule helpers (content_groups.weekly_schedule)
// Stored shape: [{ "day": "Sunday", "time": "19:00" }, ...]

export type WeeklyScheduleSlot = {
  day: string;
  time: string;
};

export const WEEK_DAYS: { key: string; label: string }[] = [
  { key: "Saturday", label: "السبت" },
  { key: "Sunday", label: "الأحد" },
  { key: "Monday", label: "الإثنين" },
  { key: "Tuesday", label: "الثلاثاء" },
  { key: "Wednesday", label: "الأربعاء" },
  { key: "Thursday", label: "الخميس" },
  { key: "Friday", label: "الجمعة" },
];

const DAY_ORDER = new Map(WEEK_DAYS.map((d, i) => [d.key, i]));

export function dayLabel(day: string): string {
  return WEEK_DAYS.find((d) => d.key === day)?.label || day;
}

const TIME_RE = /^([0-1]?\d|2[0-3]):([0-5]\d)$/;

/** Safely read a schedule value coming from the database (jsonb) or from a legacy text column. */
export function parseWeeklySchedule(raw: unknown): WeeklyScheduleSlot[] {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const day = String((item as any).day || "").trim();
      const time = String((item as any).time || "").trim();
      if (!DAY_ORDER.has(day) || !TIME_RE.test(time)) return null;
      const [h, m] = time.split(":");
      return { day, time: `${h.padStart(2, "0")}:${m}` } satisfies WeeklyScheduleSlot;
    })
    .filter((slot): slot is WeeklyScheduleSlot => slot !== null);
}

export function sortWeeklySchedule(slots: WeeklyScheduleSlot[]): WeeklyScheduleSlot[] {
  return [...slots].sort((a, b) => {
    const dayDiff = (DAY_ORDER.get(a.day) ?? 99) - (DAY_ORDER.get(b.day) ?? 99);
    if (dayDiff !== 0) return dayDiff;
    return a.time.localeCompare(b.time);
  });
}

/** "19:00" -> "7:00 مساءً" */
export function formatArabicTime(time: string): string {
  if (!TIME_RE.test(time)) return time;
  const [hStr, m] = time.split(":");
  const h24 = Number(hStr);
  const period = h24 < 12 ? "صباحاً" : "مساءً";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m} ${period}`;
}

export function splitTime(time: string): { hour12: number; minute: string; period: "am" | "pm" } {
  if (!TIME_RE.test(time)) return { hour12: 7, minute: "00", period: "pm" };
  const [hStr, m] = time.split(":");
  const h24 = Number(hStr);
  return {
    hour12: h24 % 12 === 0 ? 12 : h24 % 12,
    minute: m,
    period: h24 < 12 ? "am" : "pm",
  };
}

export function joinTime(hour12: number, minute: string, period: "am" | "pm"): string {
  let h24 = hour12 % 12;
  if (period === "pm") h24 += 12;
  return `${String(h24).padStart(2, "0")}:${minute}`;
}

export function formatSlot(slot: WeeklyScheduleSlot): string {
  return `${dayLabel(slot.day)} — ${formatArabicTime(slot.time)}`;
}
