import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AccessToken } from "npm:livekit-server-sdk@2.15.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function cleanEnvFragment(rawValue: string) {
  return rawValue
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/^`|`$/g, "");
}

function getEnvAliases(keyName: string) {
  switch (keyName) {
    case "LIVEKIT_URL":
      return ["websocket url", "livekit url", "url"];
    case "LIVEKIT_API_KEY":
      return ["api key", "livekit api key"];
    case "LIVEKIT_API_SECRET":
      return ["api secret", "livekit api secret"];
    default:
      return [];
  }
}

function parseEnvValue(rawValue: string | undefined, keyName: string) {
  if (!rawValue) return "";

  const cleanedRaw = cleanEnvFragment(rawValue);
  if (cleanedRaw && !cleanedRaw.includes("\n") && !cleanedRaw.includes("\r") && !cleanedRaw.includes("=")) {
    return cleanedRaw;
  }

  const pattern = new RegExp(`(?:^|[\\r\\n])\\s*${keyName}\\s*=\\s*([^\\r\\n]+)`, "i");
  const match = rawValue.match(pattern);
  if (match?.[1]) return cleanEnvFragment(match[1]);

  const lines = rawValue
    .split(/\r?\n/)
    .map((line) => cleanEnvFragment(line))
    .filter(Boolean);

  const exactKeyLine = lines.find((line) => line.toUpperCase().startsWith(`${keyName}=`));
  if (exactKeyLine) return cleanEnvFragment(exactKeyLine.slice(exactKeyLine.indexOf("=") + 1));

  const aliases = getEnvAliases(keyName);
  const aliasIndex = lines.findIndex((line) => aliases.includes(line.toLowerCase().replace(/:$/, "")));
  if (aliasIndex >= 0) {
    const nextLine = lines[aliasIndex + 1];
    if (nextLine && !nextLine.includes("=")) return nextLine;
  }

  return "";
}

function resolveEnvValue(primaryRawValue: string | undefined, keyName: string, fallbackRawValues: Array<string | undefined>) {
  const primaryValue = parseEnvValue(primaryRawValue, keyName);
  if (primaryValue) return primaryValue;

  for (const rawValue of fallbackRawValues) {
    const fallbackValue = parseEnvValue(rawValue, keyName);
    if (fallbackValue) return fallbackValue;
  }

  return "";
}

function normalizeLiveKitUrl(rawValue: string | undefined, fallbackRawValues: Array<string | undefined>) {
  const normalized = resolveEnvValue(rawValue, "LIVEKIT_URL", fallbackRawValues).replace(/\/+$/, "");

  if (!normalized) return "";
  if (normalized.startsWith("wss://") || normalized.startsWith("ws://")) return normalized;
  if (normalized.startsWith("https://")) return `wss://${normalized.slice("https://".length)}`;
  if (normalized.startsWith("http://")) return `ws://${normalized.slice("http://".length)}`;

  return `wss://${normalized.replace(/^\/+/, "")}`;
}

// Encode non-ASCII strings to base64 for safe JWT embedding
function toBase64(str: string): string {
  return btoa(Array.from(new TextEncoder().encode(str), b => String.fromCharCode(b)).join(""));
}

async function signLiveKitJwt(
  apiKey: string,
  apiSecret: string,
  identity: string,
  displayName: string,
  metadataObj: Record<string, unknown>,
  videoGrant: Record<string, unknown>,
) {
  // Use identity (UUID, ASCII-safe) as name to avoid Latin1 encoding issues
  // Put the real Arabic display name inside metadata as base64
  const safeMeta = JSON.stringify({
    ...metadataObj,
    displayName: toBase64(displayName),
  });

  const token = new AccessToken(apiKey.trim(), apiSecret.trim(), {
    identity,
    name: identity, // ASCII-safe
    metadata: safeMeta,
    ttl: "6h",
  });

  token.addGrant(videoGrant);
  return await token.toJwt();
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
    const rawLiveKitUrl = Deno.env.get("LIVEKIT_URL");
    const rawLiveKitApiKey = Deno.env.get("LIVEKIT_API_KEY");
    const rawLiveKitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const fallbackLiveKitSources = [rawLiveKitUrl, rawLiveKitApiKey, rawLiveKitApiSecret];

    const LIVEKIT_API_KEY = resolveEnvValue(rawLiveKitApiKey, "LIVEKIT_API_KEY", fallbackLiveKitSources);
    const LIVEKIT_API_SECRET = resolveEnvValue(rawLiveKitApiSecret, "LIVEKIT_API_SECRET", fallbackLiveKitSources);
    const LIVEKIT_URL = normalizeLiveKitUrl(rawLiveKitUrl, fallbackLiveKitSources);
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      return new Response(JSON.stringify({ error: "LiveKit not configured" }), {
        status: 500, headers: jsonHeaders,
      });
    }

    console.info("LiveKit configuration loaded", {
      url: LIVEKIT_URL,
      apiKeyPrefix: LIVEKIT_API_KEY.slice(0, 4),
      secretLength: LIVEKIT_API_SECRET.length,
    });

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

    if (!action || typeof action !== "string") {
      return new Response(JSON.stringify({ error: "Invalid action payload" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

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
        { role: isAdmin ? "admin" : "teacher" },
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
        { role: isAdmin ? "admin" : role, muted: isMuted },
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
