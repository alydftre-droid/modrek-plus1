import { createClient } from "npm:@supabase/supabase-js@2";

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

const BUNNY_API_URL = "https://video.bunnycdn.com";
const BUNNY_LIBRARY_ID = "637783";
const BUNNY_CDN_HOSTNAME = "vz-94218f57-770.b-cdn.net";
const DEVELOPER_EMAILS = new Set(["alyedaft@gmail.com", "aliana200713@gmail.com"]);

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function createUserClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

async function getVerifiedClaims(authHeader: string) {
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;
  const sb = createUserClient(authHeader);
  const { data, error } = await sb.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return data.claims;
}

async function hasRole(sb: ReturnType<typeof createClient>, userId: string, role: "teacher" | "admin") {
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId).eq("role", role).maybeSingle();
  return Boolean(data?.role);
}

async function canCreateTeacherVideo(sb: ReturnType<typeof createClient>, userId: string, email?: string | null) {
  if (email && DEVELOPER_EMAILS.has(email.toLowerCase())) return true;
  return (await hasRole(sb, userId, "teacher")) || (await hasRole(sb, userId, "admin"));
}

async function canAccessVideo(sb: ReturnType<typeof createClient>, videoId: string) {
  const { data, error } = await sb.from("content").select("id").eq("file_url", `bunny://${videoId}`).limit(1);
  return !error && Array.isArray(data) && data.length > 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const BUNNY_API_KEY = Deno.env.get("BUNNY_API_KEY");
  if (!BUNNY_API_KEY) {
    return new Response(JSON.stringify({ error: "Stream not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- Authentication ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const claims = await getVerifiedClaims(authHeader);
  const userId = claims?.sub;
  if (!userId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const userClient = createUserClient(authHeader);

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Action: create-video — creates a video object in Bunny and returns direct upload credentials
    if (action === "create-video") {
      const body = await req.json();
      const { title } = body;
      if (!title || typeof title !== "string" || title.length > 500) {
        return new Response(JSON.stringify({ error: "title is required (max 500 chars)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!(await canCreateTeacherVideo(userClient, userId, claims.email as string | undefined))) {
        return jsonResponse({ error: "Teacher video permission required" }, 403);
      }

      const res = await fetch(`${BUNNY_API_URL}/library/${BUNNY_LIBRARY_ID}/videos`, {
        method: "POST",
        headers: {
          AccessKey: BUNNY_API_KEY,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: title.substring(0, 500) }),
      });

      if (!res.ok) {
        return new Response(JSON.stringify({ error: `Video creation failed [${res.status}]` }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      const videoId = data.guid;
      const expirationTime = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
      const signature = await sha256Hex(`${BUNNY_LIBRARY_ID}${BUNNY_API_KEY}${expirationTime}${videoId}`);

      return new Response(JSON.stringify({
        videoId,
        libraryId: BUNNY_LIBRARY_ID,
        expirationTime,
        signature,
        tusEndpoint: `${BUNNY_API_URL}/tusupload`,
        playbackUrl: `https://${BUNNY_CDN_HOSTNAME}/${videoId}/playlist.m3u8`,
        embedUrl: `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${videoId}`,
        thumbnailUrl: `https://${BUNNY_CDN_HOSTNAME}/${videoId}/thumbnail.jpg`,
        directPlayUrl: `https://${BUNNY_CDN_HOSTNAME}/${videoId}/play_720p.mp4`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: get-video — get video status/info
    if (action === "get-video") {
      const videoId = url.searchParams.get("videoId");
      if (!videoId) {
        return new Response(JSON.stringify({ error: "videoId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!(await canAccessVideo(userClient, videoId))) {
        return jsonResponse({ error: "Not found or no access" }, 404);
      }

      const res = await fetch(`${BUNNY_API_URL}/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`, {
        headers: {
          AccessKey: BUNNY_API_KEY,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        return new Response(JSON.stringify({ error: `Video not found [${res.status}]` }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      return new Response(JSON.stringify({
        videoId: data.guid,
        title: data.title,
        status: data.status,
        encodeProgress: data.encodeProgress,
        length: data.length,
        width: data.width,
        height: data.height,
        availableResolutions: data.availableResolutions,
        thumbnailUrl: `https://${BUNNY_CDN_HOSTNAME}/${data.guid}/thumbnail.jpg`,
        playbackUrl: `https://${BUNNY_CDN_HOSTNAME}/${data.guid}/playlist.m3u8`,
        directPlayUrl: `https://${BUNNY_CDN_HOSTNAME}/${data.guid}/play_720p.mp4`,
        embedUrl: `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${data.guid}`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: delete-video
    if (action === "delete-video") {
      const videoId = url.searchParams.get("videoId");
      if (!videoId) {
        return new Response(JSON.stringify({ error: "videoId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!(await canAccessVideo(userClient, videoId))) {
        return jsonResponse({ error: "Not found or no access" }, 404);
      }

      const res = await fetch(`${BUNNY_API_URL}/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`, {
        method: "DELETE",
        headers: {
          AccessKey: BUNNY_API_KEY,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        return new Response(JSON.stringify({ error: `Delete failed [${res.status}]` }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use: create-video, get-video, delete-video" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
