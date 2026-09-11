// Read-only view of the student's shared AI quota (explanation + exams).
// The real enforcement lives in the backend; this hook only drives the UI.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type StudentAiQuota = {
  plan: "free" | "premium" | "exempt" | "unknown";
  unlimited: boolean;
  limit: number;
  used: number;
  remaining: number;
  resetAt: string | null;
  premiumUntil: string | null;
};

const FALLBACK: StudentAiQuota = {
  plan: "unknown",
  unlimited: false,
  limit: 10,
  used: 0,
  remaining: 10,
  resetAt: null,
  premiumUntil: null,
};

function normalize(raw: any): StudentAiQuota {
  if (!raw || typeof raw !== "object") return FALLBACK;
  const plan = (raw.plan as StudentAiQuota["plan"]) || "unknown";
  const limit = typeof raw.limit === "number" ? raw.limit : 10;
  const used = typeof raw.used === "number" ? raw.used : 0;
  return {
    plan,
    unlimited: raw.unlimited === true || plan === "premium" || plan === "exempt",
    limit,
    used,
    remaining: typeof raw.remaining === "number" ? raw.remaining : Math.max(limit - used, 0),
    resetAt: typeof raw.reset_at === "string" ? raw.reset_at : null,
    premiumUntil: typeof raw.premium_until === "string" ? raw.premium_until : null,
  };
}

/** Formats a server timestamp in the platform timezone (Africa/Cairo). */
export function formatCairo(iso?: string | null): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: new Intl.DateTimeFormat("ar-EG", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d),
    time: new Intl.DateTimeFormat("ar-EG", {
      timeZone: "Africa/Cairo",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d),
  };
}

export function useStudentAiQuota(enabled = true) {
  const [quota, setQuota] = useState<StudentAiQuota | null>(null);
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const { data, error } = await supabase.rpc("get_student_ai_quota" as any, {} as any);
      if (error) throw error;
      setQuota(normalize(data));
    } catch (err) {
      console.warn("[useStudentAiQuota] failed to read quota", err);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    // Keeps the badge honest when premium expires or the day rolls over,
    // without any reload from the student.
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  return { quota, loading, refresh };
}
