// Timezone-aware weekly lesson reminders.
// Reads the normalized public.group_weekly_schedule table (mirrored from
// content_groups.weekly_schedule), finds slots starting within the next ~30
// minutes in each slot's own timezone, and notifies purchasers exactly once
// per occurrence (guarded by public.group_lesson_reminder_log).
// Designed to be invoked every 1-5 minutes.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DAY_LABELS: Record<string, string> = {
  Saturday: "السبت",
  Sunday: "الأحد",
  Monday: "الإثنين",
  Tuesday: "الثلاثاء",
  Wednesday: "الأربعاء",
  Thursday: "الخميس",
  Friday: "الجمعة",
};

const LEAD_MINUTES = 30; // notify this long before the lesson
const WINDOW_MINUTES = 6; // tolerance so a 1-5 min cron never misses a slot

function formatArabicTime(time: string) {
  const [h, m] = time.split(":");
  const h24 = Number(h);
  const period = h24 < 12 ? "صباحاً" : "مساءً";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m} ${period}`;
}

/** Current wall-clock in a given IANA timezone. */
function nowInTimezone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return {
    dayKey: get("weekday"),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function slotMinutes(time: string): number | null {
  const [h, m] = String(time).split(":");
  const value = Number(h) * 60 + Number(m);
  return Number.isFinite(value) ? value : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!bearer) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Accept either the service role key or the cron secret stored in the vault.
    let authorized = bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      bearer === Deno.env.get("LESSON_REMINDER_CRON_SECRET");
    if (!authorized) {
      const { data: valid } = await supabase.rpc("verify_cron_secret", {
        _name: "lesson_reminder_cron_secret",
        _secret: bearer,
      });
      authorized = valid === true;
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only active slots of active groups. Inactive/deleted groups are handled by
    // the sync trigger + ON DELETE CASCADE, so nothing stale can fire.
    const { data: slots, error: slotsError } = await supabase
      .from("group_weekly_schedule")
      .select("id, group_id, day_of_week, time, timezone, content_groups!inner(id, title, is_active)")
      .eq("is_active", true)
      .eq("content_groups.is_active", true);

    if (slotsError) throw slotsError;

    // Minute-floored "now" keeps occurrence_at deterministic across runs, so the
    // unique index on (schedule_id, occurrence_at) makes sending idempotent.
    const nowFloorMs = Math.floor(Date.now() / 60000) * 60000;

    type Due = {
      scheduleId: string;
      groupId: string;
      title: string;
      time: string;
      dayKey: string;
      occurrenceAt: string;
    };
    const due: Due[] = [];
    const tzCache = new Map<string, { dayKey: string; minutes: number }>();

    for (const slot of slots || []) {
      const tz = slot.timezone || "Africa/Cairo";
      if (!tzCache.has(tz)) {
        try {
          tzCache.set(tz, nowInTimezone(tz));
        } catch {
          tzCache.set(tz, nowInTimezone("Africa/Cairo"));
        }
      }
      const now = tzCache.get(tz)!;
      if (slot.day_of_week !== now.dayKey) continue;

      const target = slotMinutes(slot.time);
      if (target === null) continue;

      const deltaMinutes = target - now.minutes;
      const lower = LEAD_MINUTES - WINDOW_MINUTES / 2;
      const upper = LEAD_MINUTES + WINDOW_MINUTES / 2;
      if (deltaMinutes < lower || deltaMinutes >= upper) continue;

      const group = (slot as any).content_groups;
      due.push({
        scheduleId: slot.id,
        groupId: slot.group_id,
        title: group?.title || "الكورس",
        time: slot.time,
        dayKey: slot.day_of_week,
        occurrenceAt: new Date(nowFloorMs + deltaMinutes * 60000).toISOString(),
      });
    }

    if (due.length === 0) {
      return new Response(
        JSON.stringify({ success: true, notificationsSent: 0, lessonsDue: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let sent = 0;
    let skipped = 0;

    for (const item of due) {
      // Claim the occurrence first — the unique index guarantees one send only.
      const { error: claimError } = await supabase
        .from("group_lesson_reminder_log")
        .insert({
          schedule_id: item.scheduleId,
          group_id: item.groupId,
          occurrence_at: item.occurrenceAt,
        });
      if (claimError) {
        skipped++; // already claimed by an earlier run
        continue;
      }

      const { data: purchases } = await supabase
        .from("student_group_purchases")
        .select("student_id")
        .eq("group_id", item.groupId);

      const studentIds = [...new Set((purchases || []).map((p) => p.student_id))];
      if (studentIds.length === 0) continue;

      const title = "📅 موعد نزول الحصة قريباً";
      const message = `حصة مجموعة "${item.title}" تنزل اليوم ${DAY_LABELS[item.dayKey] || item.dayKey} الساعة ${formatArabicTime(item.time)}.`;

      const rows = studentIds.map((id) => ({
        user_id: id,
        title,
        message,
        notification_type: "lesson_schedule",
        is_read: false,
      }));

      const { error: insertError } = await supabase.from("notifications").insert(rows);
      if (insertError) {
        console.error("Failed inserting reminders:", insertError);
        continue;
      }

      await supabase
        .from("group_lesson_reminder_log")
        .update({ recipients: rows.length })
        .eq("schedule_id", item.scheduleId)
        .eq("occurrence_at", item.occurrenceAt);

      sent += rows.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        notificationsSent: sent,
        lessonsDue: due.length,
        alreadyNotified: skipped,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("lesson-schedule-reminder failed:", error);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
