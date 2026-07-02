import { supabase } from "@/integrations/supabase/client";
import type { TargetConfig, ResolvedUser } from "./types";

const BASE_COLS = "id, full_name, email, phone, role, student_code, teacher_code";

async function fetchProfiles(role: "student" | "teacher", filters: (q: any) => any = (q) => q): Promise<ResolvedUser[]> {
  let q = supabase.from("profiles").select(BASE_COLS).eq("role", role).limit(5000);
  q = filters(q);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as ResolvedUser[];
}

async function fetchByIds(ids: string[]): Promise<ResolvedUser[]> {
  if (!ids.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));
  const results: ResolvedUser[] = [];
  for (const chunk of chunks) {
    const { data } = await supabase.from("profiles").select(BASE_COLS).in("id", chunk);
    if (data) results.push(...(data as ResolvedUser[]));
  }
  return results;
}

export async function resolveRecipients(cfg: TargetConfig): Promise<ResolvedUser[]> {
  const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();

  if (cfg.audience === "parents") return []; // placeholder — no parents table yet
  if (cfg.audience === "all") {
    const { data } = await supabase.from("profiles").select(BASE_COLS).in("role", ["student", "teacher"]).limit(10000);
    return (data || []) as ResolvedUser[];
  }

  const role = cfg.audience === "teachers" ? "teacher" : "student";

  switch (cfg.method) {
    case "all":
      return fetchProfiles(role);

    case "manual":
      return fetchByIds(cfg.manualIds || []);

    case "by_stage":
      if (!cfg.stage) return [];
      return fetchProfiles(role, (q) => q.eq("stage", cfg.stage));

    case "by_grade":
      if (!cfg.grade) return [];
      return fetchProfiles(role, (q) => q.eq("grade", cfg.grade));

    case "by_subject": {
      if (!cfg.subjectId) return [];
      if (role === "student") {
        const { data } = await supabase.from("subscriptions")
          .select("student_id").eq("subject_id", cfg.subjectId).eq("is_active", true).limit(10000);
        return fetchByIds([...new Set((data || []).map((r: any) => r.student_id))]);
      } else {
        const { data } = await supabase.from("teacher_assignments")
          .select("teacher_id").eq("subject_id", cfg.subjectId).limit(1000);
        return fetchByIds([...new Set((data || []).map((r: any) => r.teacher_id))]);
      }
    }

    case "by_group": {
      if (!cfg.groupId) return [];
      const { data } = await supabase.from("student_group_purchases")
        .select("student_id").eq("group_id", cfg.groupId).limit(10000);
      return fetchByIds([...new Set((data || []).map((r: any) => r.student_id))]);
    }

    case "by_teacher": {
      if (!cfg.teacherId) return [];
      // students of teacher via their group purchases
      const { data: groups } = await supabase.from("content_groups")
        .select("id").eq("teacher_id", cfg.teacherId).limit(500);
      const gIds = (groups || []).map((g: any) => g.id);
      if (!gIds.length) return [];
      const { data: purchases } = await supabase.from("student_group_purchases")
        .select("student_id").in("group_id", gIds).limit(10000);
      return fetchByIds([...new Set((purchases || []).map((p: any) => p.student_id))]);
    }

    case "new_users": {
      const days = cfg.windowDays ?? 7;
      return fetchProfiles(role, (q) => q.gte("created_at", daysAgo(days)));
    }

    case "inactive": {
      const days = cfg.windowDays ?? 7;
      const cutoff = daysAgo(days);
      const all = await fetchProfiles(role);
      if (role === "student") {
        const { data: recent } = await supabase.from("student_activity_logs")
          .select("student_id").gte("created_at", cutoff).limit(20000);
        const activeIds = new Set((recent || []).map((r: any) => r.student_id));
        return all.filter((u) => !activeIds.has(u.id));
      } else {
        const { data: recent } = await supabase.from("teacher_activity_logs")
          .select("teacher_id").gte("created_at", cutoff).limit(20000);
        const activeIds = new Set((recent || []).map((r: any) => r.teacher_id));
        return all.filter((u) => !activeIds.has(u.id));
      }
    }

    case "expired_subscription": {
      const { data } = await supabase.from("subscriptions")
        .select("student_id").lt("end_date", new Date().toISOString()).limit(10000);
      return fetchByIds([...new Set((data || []).map((r: any) => r.student_id))]);
    }

    case "expiring_soon": {
      const days = cfg.windowDays ?? 7;
      const now = new Date().toISOString();
      const soon = new Date(Date.now() + days * 86400_000).toISOString();
      const { data } = await supabase.from("subscriptions")
        .select("student_id").eq("is_active", true).gte("end_date", now).lte("end_date", soon).limit(10000);
      return fetchByIds([...new Set((data || []).map((r: any) => r.student_id))]);
    }

    case "top_teachers": {
      const { data } = await supabase.from("teacher_wallets")
        .select("teacher_id, total_earned").order("total_earned", { ascending: false }).limit(20);
      return fetchByIds((data || []).map((r: any) => r.teacher_id));
    }

    case "pending_withdrawal": {
      const { data } = await supabase.from("teacher_withdrawal_requests")
        .select("teacher_id").eq("status", "pending").limit(1000);
      return fetchByIds([...new Set((data || []).map((r: any) => r.teacher_id))]);
    }

    default:
      return [];
  }
}
