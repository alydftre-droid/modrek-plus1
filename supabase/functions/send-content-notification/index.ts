import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// Normalize Arabic / English aliases to a single canonical key so filtering
// works regardless of how each row was written.
const norm = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v).trim().toLowerCase();
  const map: Record<string, string> = {
    "": "", "both": "", "all": "", "none": "", "null": "", "الكل": "", "كلاهما": "",
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

const normalizeEducationTarget = (v: unknown): string => {
  const n = norm(v);
  return n === "general" || n === "azhar" ? n : "";
};

const normalizeSectionTarget = (v: unknown): string => {
  const n = norm(v);
  return n === "scientific" || n === "literary" ? n : "";
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

    const {
      teacherId,
      subjectId,
      contentId,
      contentType,
      contentTitle,
      groupId,
      subSubjectId,
      subSubjectName: subSubjectNameInput,
      contentEducationType,
    } = await req.json();

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
            .select("id, subject_id, teacher_id, created_by, education_type, section_name")
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
    if (groupId && (!group || group.subject_id !== subjectId || (group.teacher_id && group.teacher_id !== teacherId && group.created_by !== teacherId))) {
      return new Response(JSON.stringify({ error: "Group does not belong to this teacher/subject" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subjectName = subject.name || "المادة";
    // Filter targets (canonical). Important: subject.category is the material
    // category (math/arabic/etc), not the student's education_type. Using it as
    // an education filter drops every subscribed student.
    const targetEducation = normalizeEducationTarget(contentEducationType ?? group?.education_type);
    const targetStage = norm(subject.stage);
    const targetGrade = norm(subject.grade);
    const targetSection = normalizeSectionTarget(group?.section_name ?? subject.section); // may be empty

    let candidateIds: string[] = [];

    // If content is scoped to a specific group, the source of truth is the
    // students who bought that exact group. Do not require a separate teacher
    // choice row; many paid students may not have one.
    if (groupId) {
      const { data: purchases } = await supabase
        .from("student_group_purchases")
        .select("student_id")
        .eq("group_id", groupId);
      candidateIds = Array.from(new Set((purchases || []).map((p: any) => p.student_id).filter(Boolean)));
    } else {
      // No group scope: prefer active subscriptions to this teacher+subject.
      // Keep a fallback to student_teacher_choices for older rows that were
      // created before subscriptions.teacher_id was consistently filled.
      const nowIso = new Date().toISOString();
      const { data: subs, error: subsErr } = await supabase
        .from("subscriptions")
        .select("student_id, teacher_id, end_date, is_active")
        .eq("subject_id", subjectId)
        .eq("is_active", true)
        .gt("end_date", nowIso);
      if (subsErr) throw subsErr;

      const subscribed = (subs || [])
        .filter((s: any) => !s.teacher_id || s.teacher_id === teacherId)
        .map((s: any) => s.student_id)
        .filter(Boolean);

      if (subscribed.length > 0) {
        candidateIds = Array.from(new Set(subscribed));
      } else {
        const { data: choices, error: choicesErr } = await supabase
          .from("student_teacher_choices")
          .select("student_id")
          .eq("teacher_id", teacherId)
          .eq("category", subject.category || "")
          .eq("stage", subject.stage || "")
          .eq("grade", subject.grade || "");
        if (choicesErr) throw choicesErr;
        candidateIds = Array.from(new Set((choices || []).map((c: any) => c.student_id).filter(Boolean)));
      }
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

    // Resolve sub-subject display name from DB (fallback to caller-provided name).
    let subSubjectName: string | null = subSubjectNameInput?.trim() || null;
    if (subSubjectId && !subSubjectName) {
      const { data: subRow } = await supabase
        .from("sub_subjects")
        .select("name")
        .eq("id", subSubjectId)
        .maybeSingle();
      subSubjectName = (subRow as any)?.name || null;
    }

    const typeMap: Record<string, { label: string; verb: string }> = {
      video: { label: "درس فيديو 🎥", verb: "برفع" },
      pdf: { label: "ملف PDF 📚", verb: "برفع" },
      summary: { label: "ملخص 📝", verb: "بإضافة" },
      exam: { label: "امتحان 📋", verb: "بإضافة" },
    };
    const info = typeMap[contentType] || { label: "محتوى جديد", verb: "بإضافة" };
    const scopeName = subSubjectName || subjectName;

    // Deep link: send the student directly to the right group + sub-subject on
    // the subject page. StudentSubjectView reads these params and auto-navigates.
    const linkParams = new URLSearchParams({
      stage: targetStage || subject.stage || "",
      grade: targetGrade || subject.grade || "",
      category: subject.category || "",
      subject_name: subjectName,
    });
    if (targetSection) linkParams.set("section", targetSection);
    if (groupId) linkParams.set("group_id", groupId);
    if (subSubjectId) linkParams.set("sub_subject_id", subSubjectId);
    if (contentId && contentType !== "exam") linkParams.set("content_id", contentId);
    const link = contentType === "exam" ? "/student/exams" : `/student-subject?${linkParams.toString()}`;
    const scopeParams = new URLSearchParams(linkParams);
    scopeParams.delete("content_id");
    const scopeLink = contentType === "exam" ? "/student/exams" : `/student-subject?${scopeParams.toString()}`;

    const buildTitle = (count: number) =>
      count > 1 ? `${info.label} - ${scopeName} (${count})` : `${info.label} - ${scopeName}`;
    const buildMessage = (count: number) =>
      count > 1
        ? `قام الأستاذ ${teacherName} ${info.verb} ${count} ${info.label} جديدة داخل ${scopeName}`
        : `قام الأستاذ ${teacherName} ${info.verb} ${info.label} جديد: "${contentTitle}" داخل ${scopeName}`;

    // Smart aggregation: collapse repeated uploads within the same scope into a
    // single unread notification per student (10-minute window). Only applies
    // when we have a sub-subject / group scope so unrelated content is not
    // merged.
    const AGG_WINDOW_MIN = 10;
    const sinceIso = new Date(Date.now() - AGG_WINDOW_MIN * 60_000).toISOString();
    const aggregatedUserIds = new Set<string>();
    if (groupId || subSubjectId) {
      const { data: recent } = await supabase
        .from("notifications")
        .select("id, user_id, title, message, link")
        .in("user_id", eligible)
        .eq("created_by", teacherId)
        .eq("notification_type", contentType)
        .eq("is_read", false)
        .gte("created_at", sinceIso);
      for (const row of ((recent || []) as any[]).filter((item) => String(item.link || "").startsWith(scopeLink))) {
        const match = /\((\d+)\)\s*$/.exec(row.title || "");
        const nextCount = (match ? parseInt(match[1], 10) : 1) + 1;
        await supabase
          .from("notifications")
          .update({
            title: buildTitle(nextCount),
            message: buildMessage(nextCount),
            link,
            is_read: false,
            created_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        aggregatedUserIds.add(row.user_id);
      }
    }

    const freshRecipients = eligible.filter((sid) => !aggregatedUserIds.has(sid));
    const rows = freshRecipients.map((sid) => ({
      user_id: sid,
      title: buildTitle(1),
      message: buildMessage(1),
      notification_type: contentType,
      link,
      is_read: false,
      created_by: teacherId,
    }));

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("notifications").insert(rows);
      if (insErr) {
        console.error("send-content-notification insert error:", insErr);
        throw insErr;
      }
    }

    // Audit log for delivery
    console.log(JSON.stringify({
      event: "content_notification_sent",
      teacherId, teacherName, subjectId, subjectName,
      groupId: groupId ?? null, subSubjectId: subSubjectId ?? null, subSubjectName, contentId: contentId ?? null,
      contentType, contentTitle,
      filters: { targetEducation, targetStage, targetGrade, targetSection },
      recipientCount: eligible.length,
      inserted: rows.length,
      aggregated: aggregatedUserIds.size,
      link,
      at: new Date().toISOString(),
    }));

    // Best-effort cleanup
    supabase.rpc("cleanup_old_notifications").then(() => {}, () => {});

    return new Response(
      JSON.stringify({ sent: eligible.length, link, filters: { targetEducation, targetStage, targetGrade, targetSection } }),
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
