// Sends a reminder notification ~30 minutes before each weekly lesson slot
// of a course group, to every student who purchased that group.
// Intended to be invoked by a scheduled job every 15 minutes.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DAY_KEYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DAY_LABELS: Record<string, string> = {
  Saturday: "السبت",
  Sunday: "الأحد",
  Monday: "الإثنين",
  Tuesday: "الثلاثاء",
  Wednesday: "الأربعاء",
  Thursday: "الخميس",
  Friday: "الجمعة",
};

function formatArabicTime(time: string) {
  const [h, m] = time.split(":");
  const h24 = Number(h);
  const period = h24 < 12 ? "صباحاً" : "مساءً";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m} ${period}`;
}

/** Current time in Africa/Cairo as { dayKey, minutes-since-midnight }. */
function cairoNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const weekday = get("weekday");
  const dayKey = DAY_KEYS.find((d) => d === weekday) || weekday;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return { dayKey, minutes };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!bearer || bearer !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
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

    const { dayKey, minutes } = cairoNow();
    const windowStart = minutes + 20;
    const windowEnd = minutes + 40;

    const { data: groups, error: groupsError } = await supabase
      .from("content_groups")
      .select("id, title, weekly_schedule, subject_id")
      .eq("is_active", true)
      .not("weekly_schedule", "is", null);

    if (groupsError) throw groupsError;

    const due: { groupId: string; title: string; time: string }[] = [];
    for (const group of groups || []) {
      const slots = Array.isArray(group.weekly_schedule) ? group.weekly_schedule : [];
      for (const slot of slots as { day?: string; time?: string }[]) {
        if (!slot?.day || !slot?.time || slot.day !== dayKey) continue;
        const [h, m] = String(slot.time).split(":");
        const slotMinutes = Number(h) * 60 + Number(m);
        if (Number.isNaN(slotMinutes)) continue;
        if (slotMinutes >= windowStart && slotMinutes < windowEnd) {
          due.push({ groupId: group.id, title: group.title, time: slot.time });
        }
      }
    }

    if (due.length === 0) {
      return new Response(
        JSON.stringify({ success: true, notificationsSent: 0, message: "No lessons due" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let sent = 0;
    for (const item of due) {
      const { data: purchases } = await supabase
        .from("student_group_purchases")
        .select("student_id")
        .eq("group_id", item.groupId);

      const studentIds = [...new Set((purchases || []).map((p) => p.student_id))];
      if (studentIds.length === 0) continue;

      const title = "📅 موعد نزول الحصة قريباً";
      const message = `حصة مجموعة "${item.title}" تنزل اليوم ${DAY_LABELS[dayKey] || dayKey} الساعة ${formatArabicTime(item.time)}.`;

      // Avoid duplicates for the same group within the last 2 hours.
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabase
        .from("notifications")
        .select("user_id")
        .eq("title", title)
        .eq("message", message)
        .gte("created_at", since);
      const alreadyNotified = new Set((existing || []).map((n) => n.user_id));

      const rows = studentIds
        .filter((id) => !alreadyNotified.has(id))
        .map((id) => ({
          user_id: id,
          title,
          message,
          notification_type: "lesson_schedule",
          is_read: false,
        }));

      if (rows.length === 0) continue;

      const { error: insertError } = await supabase.from("notifications").insert(rows);
      if (insertError) {
        console.error("Failed inserting reminders:", insertError);
        continue;
      }
      sent += rows.length;
    }

    return new Response(
      JSON.stringify({ success: true, notificationsSent: sent, lessonsDue: due.length }),
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
