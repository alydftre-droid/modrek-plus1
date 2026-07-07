import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Normalize Arabic / English aliases to a single canonical key so filtering
// works regardless of how each row was written.
const norm = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v).trim().toLowerCase();
  const map: Record<string, string> = {
    // education types
    "عام": "general", "general": "general", "public": "general",
    "أزهر": "azhar", "ازهر": "azhar", "azhar": "azhar",
    // stages
    "preparatory": "preparatory", "الإعدادية": "preparatory", "الاعدادية": "preparatory",
    "المرحلة الإعدادية": "preparatory", "المرحلة الاعدادية": "preparatory",
    "اعدادي": "preparatory", "إعدادي": "preparatory",
    "secondary": "secondary", "الثانوية": "secondary", "المرحلة الثانوية": "secondary", "ثانوي": "secondary",
    // grades
    "first": "first", "الأول": "first", "الاول": "first", "اول": "first",
    "الصف الأول": "first", "الصف الاول": "first",
    "second": "second", "الثاني": "second", "تاني": "second", "الصف الثاني": "second",
    "third": "third", "الثالث": "third", "تالت": "third", "الصف الثالث": "third",
    // sections
    "scientific": "scientific", "علمي": "scientific", "علمي علوم": "scientific", "علمي رياضة": "scientific",
    "literary": "literary", "أدبي": "literary", "ادبي": "literary",
  };
  return map[s] ?? s;
};

const matches = (a: unknown, b: unknown): boolean => {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth: allow (a) service role bearer (internal) or (b) authenticated teacher/admin
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    let callerUserId: string | null = null;
    let isServiceCall = false;
    if (bearer && bearer === serviceKey) {
      isServiceCall = true;
    } else if (bearer) {
      const authClient = createClient(supabaseUrl, anonKey);
      const { data, error } = await authClient.auth.getUser(bearer);
      if (error || !data?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      callerUserId = data.user.id;
    } else {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { teacherId, subjectId, contentType, contentTitle, groupId, contentEducationType } =
      await req.json();

    if (!teacherId || !subjectId || !contentType || !contentTitle) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If not a service call, caller must be the teacher themselves or an admin
    if (!isServiceCall && callerUserId !== teacherId) {
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: callerUserId,
        _role: "admin",
      });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch teacher name + subject details in parallel
    const [teacherRes, subjectRes, groupRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", teacherId).maybeSingle(),
      supabase.from("subjects")
        .select("name, category, stage, grade, section")
        .eq("id", subjectId).maybeSingle(),
      groupId
        ? supabase.from("content_groups")
            .select("id, education_type, section_name")
            .eq("id", groupId).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    const teacherName = teacherRes.data?.full_name || "المعلم";
    const subject = subjectRes.data;
    const group = groupRes.data as any | null;
    if (!subject) {
      return new Response(JSON.stringify({ error: "Subject not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subjectName = subject.name || "المادة";
    // Filter targets (canonical)
    const targetEducation = norm(contentEducationType ?? group?.education_type ?? subject.category);
    const targetStage = norm(subject.stage);
    const targetGrade = norm(subject.grade);
    const targetSection = norm(group?.section_name ?? subject.section); // may be empty

    // Step 1: Candidate students = those who chose this teacher for this
    // (category, stage, grade). This is the same anchor as before.
    const { data: choices, error: choicesErr } = await supabase
      .from("student_teacher_choices")
      .select("student_id")
      .eq("teacher_id", teacherId)
      .eq("category", subject.category || "")
      .eq("stage", subject.stage || "")
      .eq("grade", subject.grade || "");
    if (choicesErr) throw choicesErr;

    let candidateIds = Array.from(new Set((choices || []).map((c: any) => c.student_id)));
    if (candidateIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_choices" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: If content is scoped to a specific group, restrict to students
    // who actually purchased THAT group. Never leak to other groups' students.
    if (groupId) {
      const { data: purchases } = await supabase
        .from("student_group_purchases")
        .select("student_id")
        .eq("group_id", groupId)
        .in("student_id", candidateIds);
      const buyers = new Set((purchases || []).map((p: any) => p.student_id));
      candidateIds = candidateIds.filter((id) => buyers.has(id));
    } else {
      // No group scope: require an active subscription to the subject itself.
      const nowIso = new Date().toISOString();
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("student_id, end_date, is_active")
        .eq("subject_id", subjectId)
        .eq("is_active", true)
        .gt("end_date", nowIso)
        .in("student_id", candidateIds);
      const active = new Set((subs || []).map((s: any) => s.student_id));
      candidateIds = candidateIds.filter((id) => active.has(id));
    }

    if (candidateIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_active_students" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Load profiles in chunks and apply strict per-student filters
    const chunks: string[][] = [];
    for (let i = 0; i < candidateIds.length; i += 500) {
      chunks.push(candidateIds.slice(i, i + 500));
    }

    const eligible: string[] = [];
    for (const chunk of chunks) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, is_banned, education_type, stage, grade, section")
        .in("id", chunk);
      for (const p of (profs || []) as any[]) {
        if (p.is_banned) continue;
        // Stage/grade already gated by student_teacher_choices + active
        // subscription/group-purchase. Re-checking profile.stage/grade caused
        // students to be dropped when profiles stored differently-cased or
        // Arabic aliases. We rely on the payment/choice gate above.
        // Education type is only enforced when the content specifies one.
        if (targetEducation && p.education_type && !matches(p.education_type, targetEducation)) continue;
        // Section is only enforced when the subject/group actually specifies one.
        if (targetSection && p.section && !matches(p.section, targetSection)) continue;
        eligible.push(p.id);
      }
    }

    if (eligible.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_eligible_after_filter" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const typeMap: Record<string, string> = {
      video: "فيديو جديد 🎥",
      pdf: "كتاب جديد 📚",
      summary: "ملخص جديد 📝",
      exam: "امتحان جديد 📋",
    };
    const typeLabel = typeMap[contentType] || "محتوى جديد";
    const title = `${typeLabel} - ${subjectName}`;
    const message = `قام ${teacherName} بإضافة ${typeLabel}: "${contentTitle}" في مادة ${subjectName}`;

    const rows = eligible.map((sid) => ({
      user_id: sid,
      title,
      message,
      notification_type: contentType,
      is_read: false,
      created_by: teacherId,
    }));

    const { error: insErr } = await supabase.from("notifications").insert(rows);
    if (insErr) {
      console.error("send-content-notification insert error:", insErr);
      throw insErr;
    }

    // Audit log for delivery
    console.log(JSON.stringify({
      event: "content_notification_sent",
      teacherId, teacherName, subjectId, subjectName, groupId: groupId ?? null,
      contentType, contentTitle,
      filters: { targetEducation, targetStage, targetGrade, targetSection },
      recipientCount: eligible.length,
      recipientIds: eligible,
      at: new Date().toISOString(),
    }));

    // Best-effort cleanup
    supabase.rpc("cleanup_old_notifications").then(() => {}, () => {});

    return new Response(
      JSON.stringify({ sent: eligible.length, filters: { targetEducation, targetStage, targetGrade, targetSection } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("send-content-notification error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "حدث خطأ" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
