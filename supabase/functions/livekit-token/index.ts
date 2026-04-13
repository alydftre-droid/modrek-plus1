import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const MEETING_DOMAIN = "meet.jit.si";

function buildMeetingRoomName(roomName: string) {
  return `azhars-${roomName}`
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 120);
}

function createMeetingPayload(session: any, extra: Record<string, unknown> = {}) {
  const meetingRoomName = buildMeetingRoomName(session.room_name);

  return {
    provider: "jitsi",
    meetingDomain: MEETING_DOMAIN,
    meetingRoomName,
    meetingUrl: `https://${MEETING_DOMAIN}/${meetingRoomName}`,
    roomName: session.room_name,
    session,
    ...extra,
  };
}

async function getUserContext(supabase: ReturnType<typeof createClient>, userId: string) {
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);

  const roles = new Set((roleRows || []).map((row: { role: string }) => row.role));

  return {
    userName: profile?.full_name || "مستخدم",
    role: roles.has("admin") ? "admin" : roles.has("teacher") ? "teacher" : profile?.role || "student",
    isAdmin: roles.has("admin") || profile?.role === "admin",
    isTeacher: roles.has("teacher") || profile?.role === "teacher",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const body = await req.json();
    const { action, groupId, title, sessionId, allowCamera, allowMic, studentId, moderateAction } = body;

    if (!action || typeof action !== "string") {
      return new Response(JSON.stringify({ error: "Invalid action payload" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const { userName, role, isAdmin, isTeacher } = await getUserContext(supabase, user.id);

    if (action === "start") {
      if (!isTeacher && !isAdmin) {
        return new Response(JSON.stringify({ error: "Only teachers can start live sessions" }), {
          status: 403,
          headers: jsonHeaders,
        });
      }

      await supabase
        .from("live_sessions")
        .update({ status: "ended", ended_at: new Date().toISOString(), viewer_count: 0 })
        .eq("teacher_id", user.id)
        .eq("status", "live");

      const roomName = `live-${groupId}-${Date.now()}`;
      const { data: session, error: sessionError } = await supabase
        .from("live_sessions")
        .insert({
          group_id: groupId,
          teacher_id: user.id,
          title: title || "حصة مباشرة",
          room_name: roomName,
          allow_student_camera: allowCamera ?? false,
          allow_student_mic: allowMic ?? true,
          viewer_count: 0,
        })
        .select()
        .single();

      if (sessionError || !session) {
        return new Response(JSON.stringify({ error: sessionError?.message || "Failed to create session" }), {
          status: 500,
          headers: jsonHeaders,
        });
      }

      const { data: subscribers } = await supabase
        .from("student_group_purchases")
        .select("student_id")
        .eq("group_id", groupId);

      if (subscribers?.length) {
        await supabase.from("notifications").insert(
          subscribers.map((subscriber) => ({
            user_id: subscriber.student_id,
            title: "🔴 بث مباشر الآن!",
            message: `بدأ المعلم ${userName} حصة مباشرة: ${title || "حصة مباشرة"}`,
            notification_type: "live",
            created_by: user.id,
          })),
        );
      }

      return new Response(JSON.stringify(createMeetingPayload(session, {
        role: isAdmin ? "admin" : role,
        canPublishAudio: true,
        canPublishVideo: true,
      })), {
        headers: jsonHeaders,
      });
    }

    if (action === "join") {
      const { data: session } = await supabase
        .from("live_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("status", "live")
        .maybeSingle();

      if (!session) {
        return new Response(JSON.stringify({ error: "Session not found or ended" }), {
          status: 404,
          headers: jsonHeaders,
        });
      }

      // Privacy: Only the session owner teacher, admins, or subscribed students can join
      // Other teachers are blocked
      if (isTeacher && session.teacher_id !== user.id && !isAdmin) {
        return new Response(JSON.stringify({ error: "لا يمكنك الانضمام لبث معلم آخر" }), {
          status: 403,
          headers: jsonHeaders,
        });
      }

      const { data: purchase } = await supabase
        .from("student_group_purchases")
        .select("id")
        .eq("group_id", session.group_id)
        .eq("student_id", user.id)
        .maybeSingle();

      if (!purchase && !isAdmin && session.teacher_id !== user.id) {
        return new Response(JSON.stringify({ error: "غير مشترك في هذه المجموعة" }), {
          status: 403,
          headers: jsonHeaders,
        });
      }

      const { data: banAction } = await supabase
        .from("live_session_actions")
        .select("action")
        .eq("session_id", sessionId)
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (banAction?.action === "ban") {
        return new Response(JSON.stringify({ error: "You are banned from this session" }), {
          status: 403,
          headers: jsonHeaders,
        });
      }

      const { data: muteAction } = await supabase
        .from("live_session_actions")
        .select("action")
        .eq("session_id", sessionId)
        .eq("student_id", user.id)
        .in("action", ["mute", "unmute"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isMuted = muteAction?.action === "mute";
      const nextViewerCount = (session.viewer_count || 0) + (session.teacher_id === user.id ? 0 : 1);

      if (session.teacher_id !== user.id) {
        await supabase
          .from("live_sessions")
          .update({ viewer_count: nextViewerCount })
          .eq("id", sessionId);
      }

      return new Response(JSON.stringify(createMeetingPayload({
        ...session,
        viewer_count: nextViewerCount,
      }, {
        role: isAdmin ? "admin" : role,
        isMuted,
        canPublishAudio: session.allow_student_mic && !isMuted,
        canPublishVideo: session.allow_student_camera,
      })), {
        headers: jsonHeaders,
      });
    }

    if (action === "leave") {
      const { data: session } = await supabase
        .from("live_sessions")
        .select("id, teacher_id, viewer_count")
        .eq("id", sessionId)
        .maybeSingle();

      if (session && session.teacher_id !== user.id) {
        await supabase
          .from("live_sessions")
          .update({ viewer_count: Math.max(0, (session.viewer_count || 0) - 1) })
          .eq("id", sessionId);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: jsonHeaders,
      });
    }

    if (action === "end") {
      await supabase
        .from("live_sessions")
        .update({ status: "ended", ended_at: new Date().toISOString(), viewer_count: 0 })
        .eq("id", sessionId)
        .eq("teacher_id", user.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: jsonHeaders,
      });
    }

    if (action === "moderate") {
      const { data: ownedSession } = await supabase
        .from("live_sessions")
        .select("id, teacher_id")
        .eq("id", sessionId)
        .maybeSingle();

      if (!ownedSession || (!isAdmin && ownedSession.teacher_id !== user.id)) {
        return new Response(JSON.stringify({ error: "Unauthorized moderation action" }), {
          status: 403,
          headers: jsonHeaders,
        });
      }

      await supabase.from("live_session_actions").insert({
        session_id: sessionId,
        student_id: studentId,
        action: moderateAction,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: jsonHeaders,
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error("live session error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
