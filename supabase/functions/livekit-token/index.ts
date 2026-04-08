import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple JWT creation for LiveKit
function createLiveKitToken(apiKey: string, apiSecret: string, roomName: string, participantName: string, isPublisher: boolean): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  
  const videoGrant: Record<string, unknown> = {
    room: roomName,
    roomJoin: true,
    canPublish: isPublisher,
    canSubscribe: true,
    canPublishData: true,
  };

  const payload = {
    iss: apiKey,
    sub: participantName,
    nbf: now,
    exp: now + 3600 * 6,
    jti: crypto.randomUUID(),
    video: videoGrant,
  };

  const enc = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const headerB64 = enc(header);
  const payloadB64 = enc(payload);
  const data = `${headerB64}.${payloadB64}`;

  const encoder = new TextEncoder();
  return crypto.subtle.importKey("raw", encoder.encode(apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then(key => crypto.subtle.sign("HMAC", key, encoder.encode(data)))
    .then(sig => {
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      return `${data}.${sigB64}`;
    }) as unknown as string;
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
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, groupId, title, sessionId, allowCamera, allowMic } = body;

    // Get user profile
    const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).single();
    const userName = profile?.full_name || "مستخدم";
    const role = profile?.role || "student";

    if (action === "start") {
      // Teacher starts a live session
      if (role !== "teacher" && role !== "admin") {
        return new Response(JSON.stringify({ error: "Only teachers can start live sessions" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      const header = { alg: "HS256", typ: "JWT" };
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: LIVEKIT_API_KEY,
        sub: user.id,
        name: userName,
        nbf: now,
        exp: now + 3600 * 6,
        jti: crypto.randomUUID(),
        video: { room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
        metadata: JSON.stringify({ role: "teacher", name: userName }),
      };

      const enc = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      const headerB64 = enc(header);
      const payloadB64 = enc(payload);
      const sigData = `${headerB64}.${payloadB64}`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", encoder.encode(LIVEKIT_API_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(sigData));
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      const jwt = `${sigData}.${sigB64}`;

      return new Response(JSON.stringify({ token: jwt, url: LIVEKIT_URL, session, roomName }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "join") {
      // Student joins a live session
      const { data: session } = await supabase.from("live_sessions")
        .select("*").eq("id", sessionId).eq("status", "live").single();

      if (!session) {
        return new Response(JSON.stringify({ error: "Session not found or ended" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if student is subscribed to the group
      const { data: purchase } = await supabase.from("student_group_purchases")
        .select("id").eq("group_id", session.group_id).eq("student_id", user.id).maybeSingle();

      if (!purchase && role !== "admin") {
        return new Response(JSON.stringify({ error: "Not subscribed to this group" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if student is banned
      const { data: banAction } = await supabase.from("live_session_actions")
        .select("action").eq("session_id", sessionId).eq("student_id", user.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      if (banAction?.action === "ban") {
        return new Response(JSON.stringify({ error: "You are banned from this session" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check mute status
      const { data: muteAction } = await supabase.from("live_session_actions")
        .select("action").eq("session_id", sessionId).eq("student_id", user.id)
        .in("action", ["mute", "unmute"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const isMuted = muteAction?.action === "mute";

      const canPublish = !isMuted && session.allow_student_mic;
      const canPublishVideo = session.allow_student_camera;

      const header = { alg: "HS256", typ: "JWT" };
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: LIVEKIT_API_KEY,
        sub: user.id,
        name: userName,
        nbf: now,
        exp: now + 3600 * 6,
        jti: crypto.randomUUID(),
        video: {
          room: session.room_name,
          roomJoin: true,
          canPublish: canPublish || canPublishVideo,
          canSubscribe: true,
          canPublishData: true,
        },
        metadata: JSON.stringify({ role: "student", name: userName, muted: isMuted }),
      };

      const enc = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      const headerB64 = enc(header);
      const payloadB64 = enc(payload);
      const sigData = `${headerB64}.${payloadB64}`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", encoder.encode(LIVEKIT_API_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(sigData));
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      const jwt = `${sigData}.${sigB64}`;

      // Increment viewer count
      await supabase.rpc("", {}).catch(() => {});
      await supabase.from("live_sessions").update({ viewer_count: (session.viewer_count || 0) + 1 }).eq("id", sessionId);

      return new Response(JSON.stringify({
        token: jwt,
        url: LIVEKIT_URL,
        session,
        isMuted,
        canPublishVideo: canPublishVideo,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "end") {
      await supabase.from("live_sessions").update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", sessionId).eq("teacher_id", user.id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "moderate") {
      const { studentId, moderateAction } = body;
      await supabase.from("live_session_actions").insert({
        session_id: sessionId,
        student_id: studentId,
        action: moderateAction,
      });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("LiveKit token error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
