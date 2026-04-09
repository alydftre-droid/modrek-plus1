import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AccessToken } from "npm:livekit-server-sdk@2.15.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

async function signLiveKitJwt(
  apiKey: string,
  apiSecret: string,
  identity: string,
  name: string,
  metadata: string,
  videoGrant: Record<string, unknown>,
) {
  const token = new AccessToken(apiKey.trim(), apiSecret.trim(), {
    identity,
    name,
    metadata,
    ttl: "6h",
  });

  token.addGrant(videoGrant);
  return await token.toJwt();
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(sigData));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return `${sigData}.${sigB64}`;
}

async function getUserContext(supabase: ReturnType<typeof createClient>, userId: string) {
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);

  const roles = new Set((roleRows || []).map((row: { role: string }) => row.role));
  const resolvedRole = roles.has("admin")
    ? "admin"
    : roles.has("teacher")
      ? "teacher"
      : profile?.role || "student";

  return {
    userName: profile?.full_name || "مستخدم",
    role: resolvedRole,
    isAdmin: roles.has("admin") || profile?.role === "admin",
    isTeacher: roles.has("teacher") || profile?.role === "teacher",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY");
    const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET");
    const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      return new Response(JSON.stringify({ error: "LiveKit not configured" }), {
        status: 500, headers: jsonHeaders,
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: jsonHeaders,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: jsonHeaders,
      });
    }

    const body = await req.json();
    const { action, groupId, title, sessionId, allowCamera, allowMic } = body;

    const { userName, role, isAdmin, isTeacher } = await getUserContext(supabase, user.id);

    if (action === "start") {
      // Teacher starts a live session
      if (!isTeacher && !isAdmin) {
        return new Response(JSON.stringify({ error: "Only teachers can start live sessions" }), {
          status: 403, headers: jsonHeaders,
        });
      }

      // End any existing live sessions for this group
      await supabase.from("live_sessions").update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("teacher_id", user.id).eq("status", "live");

      const roomName = `live-${groupId}-${Date.now()}`;
      const { data: session, error: sessErr } = await supabase.from("live_sessions").insert({
        group_id: groupId,
        teacher_id: user.id,
        title: title || "حصة مباشرة",
        room_name: roomName,
        allow_student_camera: allowCamera ?? false,
        allow_student_mic: allowMic ?? true,
      }).select().single();

      if (sessErr) {
        return new Response(JSON.stringify({ error: sessErr.message }), {
          status: 500, headers: jsonHeaders,
        });
      }

      // Send notification to subscribed students
      const { data: subscribers } = await supabase.from("student_group_purchases")
        .select("student_id").eq("group_id", groupId);
      
      if (subscribers && subscribers.length > 0) {
        const notifications = subscribers.map(s => ({
          user_id: s.student_id,
          title: "🔴 بث مباشر الآن!",
          message: `بدأ المعلم ${userName} حصة مباشرة: ${title || "حصة مباشرة"}`,
          notification_type: "live",
          created_by: user.id,
        }));
        await supabase.from("notifications").insert(notifications);
      }

      // Generate teacher token (publisher)
      const jwt = await signLiveKitJwt(
        LIVEKIT_API_KEY,
        LIVEKIT_API_SECRET,
        user.id,
        userName,
        JSON.stringify({ role: isAdmin ? "admin" : "teacher", name: userName }),
        { room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
      );

      return new Response(JSON.stringify({ token: jwt, url: LIVEKIT_URL, session, roomName }), {
        headers: jsonHeaders,
      });
    }

    if (action === "join") {
      // Student joins a live session
      const { data: session } = await supabase.from("live_sessions")
        .select("*").eq("id", sessionId).eq("status", "live").single();

      if (!session) {
        return new Response(JSON.stringify({ error: "Session not found or ended" }), {
          status: 404, headers: jsonHeaders,
        });
      }

      // Check if student is subscribed to the group
      const { data: purchase } = await supabase.from("student_group_purchases")
        .select("id").eq("group_id", session.group_id).eq("student_id", user.id).maybeSingle();

      if (!purchase && !isAdmin) {
        return new Response(JSON.stringify({ error: "Not subscribed to this group" }), {
          status: 403, headers: jsonHeaders,
        });
      }

      // Check if student is banned
      const { data: banAction } = await supabase.from("live_session_actions")
        .select("action").eq("session_id", sessionId).eq("student_id", user.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      if (banAction?.action === "ban") {
        return new Response(JSON.stringify({ error: "You are banned from this session" }), {
          status: 403, headers: jsonHeaders,
        });
      }

      // Check mute status
      const { data: muteAction } = await supabase.from("live_session_actions")
        .select("action").eq("session_id", sessionId).eq("student_id", user.id)
        .in("action", ["mute", "unmute"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const isMuted = muteAction?.action === "mute";

      const canPublish = !isMuted && session.allow_student_mic;
      const canPublishVideo = session.allow_student_camera;

      const jwt = await signLiveKitJwt(
        LIVEKIT_API_KEY,
        LIVEKIT_API_SECRET,
        user.id,
        userName,
        JSON.stringify({ role: isAdmin ? "admin" : role, name: userName, muted: isMuted }),
        {
          room: session.room_name,
          roomJoin: true,
          canPublish: canPublish || canPublishVideo,
          canSubscribe: true,
          canPublishData: true,
        },
      );

      // Increment viewer count
      await supabase.from("live_sessions").update({ viewer_count: (session.viewer_count || 0) + 1 }).eq("id", sessionId);

      return new Response(JSON.stringify({
        token: jwt,
        url: LIVEKIT_URL,
        session,
        isMuted,
        canPublishVideo: canPublishVideo,
      }), {
        headers: jsonHeaders,
      });
    }

    if (action === "end") {
      await supabase.from("live_sessions").update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", sessionId).eq("teacher_id", user.id);
      return new Response(JSON.stringify({ success: true }), {
        headers: jsonHeaders,
      });
    }

    if (action === "moderate") {
      const { studentId, moderateAction } = body;
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
      status: 400, headers: jsonHeaders,
    });
  } catch (error) {
    console.error("LiveKit token error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal error" }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
