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
const DEVELOPER_EMAILS = new Set(["alyedaft@gmail.com", "aliana200713@gmail.com"]);

// Defaults match src/lib/bunnyStream.ts so student playback keeps working even if
// only a subset of the BUNNY_STREAM_* secrets are configured. Signing only needs
// the token key + library/cdn; the API key is used by create/get/delete-video.
const DEFAULT_BUNNY_STREAM_LIBRARY_ID = "686928";
const DEFAULT_BUNNY_STREAM_CDN_HOSTNAME = "vz-9fc4b938-1b7.b-cdn.net";

function getBunnyStreamConfig() {
  const apiKey = Deno.env.get("BUNNY_STREAM_API_KEY")
    || Deno.env.get("BUNNY_API_KEY")
    || "";
  const libraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID") || DEFAULT_BUNNY_STREAM_LIBRARY_ID;
  const cdnHostname = Deno.env.get("BUNNY_STREAM_CDN_HOSTNAME") || DEFAULT_BUNNY_STREAM_CDN_HOSTNAME;

  return {
    apiKey,
    libraryId,
    cdnHostname,
    missing: [
      !apiKey ? "BUNNY_STREAM_API_KEY" : null,
      !libraryId ? "BUNNY_STREAM_LIBRARY_ID" : null,
      !cdnHostname ? "BUNNY_STREAM_CDN_HOSTNAME" : null,
    ].filter(Boolean),
  };
}

async function validateBunnyStreamCredentials(apiKey: string, libraryId: string) {
  const res = await fetch(`${BUNNY_API_URL}/library/${libraryId}/videos?page=1&itemsPerPage=1`, {
    headers: {
      AccessKey: apiKey,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const upstream = await res.text().catch(() => "");
    return { ok: false, status: res.status, upstream: upstream.slice(0, 500) };
  }
  return { ok: true, status: res.status, upstream: "" };
}

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
  try {
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return null;
    const sb = createUserClient(authHeader);
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return { sub: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}

function isServiceRoleHealthCheck(authHeader: string | null) {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, "").trim() || "";
  return Boolean(serviceRoleKey && bearerToken === serviceRoleKey);
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

  const bunny = getBunnyStreamConfig();
  if (bunny.missing.length > 0) {
    return jsonResponse({ error: "Bunny Stream production environment is not fully configured", missing: bunny.missing }, 500);
  }

  // --- Authentication ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const serviceRoleHealthCheck = action === "health" && isServiceRoleHealthCheck(authHeader);

  const claims = serviceRoleHealthCheck ? { sub: "service-role-health-check", email: null } : await getVerifiedClaims(authHeader);
  const userId = claims?.sub;
  if (!userId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const userClient = createUserClient(authHeader);

  try {
    if (action === "health") {
      if (!serviceRoleHealthCheck && !(await canCreateTeacherVideo(userClient, userId, claims.email as string | undefined))) {
        return jsonResponse({ error: "Teacher video permission required" }, 403);
      }

      const validation = await validateBunnyStreamCredentials(bunny.apiKey!, bunny.libraryId!);
      return jsonResponse({
        ok: validation.ok,
        provider: "bunny-stream",
        libraryId: bunny.libraryId,
        cdnHostname: bunny.cdnHostname,
        status: validation.status,
        error: validation.ok ? null : "BUNNY_STREAM_API_KEY_INVALID_FOR_LIBRARY",
      }, validation.ok ? 200 : 502);
    }

    // Action: sign-playback — issue a short-lived signed playback URL for a Bunny video.
    // Student-safe: verifies the caller has an active grant on the content record
    // that references this videoId (bunny://<videoId>). Returns HLS + embed URLs.
    if (action === "sign-playback") {
      let body: any = {};
      try { body = await req.json(); } catch { body = {}; }
      const videoId: string | undefined = body?.videoId;
      if (!videoId || typeof videoId !== "string" || !/^[a-zA-Z0-9-]{8,64}$/.test(videoId)) {
        return jsonResponse({ error: "videoId is required" }, 400);
      }

      // Access check — teachers/admins pass through; students must have a content row they can read.
      const isPrivileged = await canCreateTeacherVideo(userClient, userId, claims.email as string | undefined);
      if (!isPrivileged) {
        const { data: rows, error: rowsErr } = await userClient
          .from("content")
          .select("id")
          .eq("file_url", `bunny://${videoId}`)
          .limit(1);
        if (rowsErr || !rows || rows.length === 0) {
          // Log denied attempt (best-effort, do not fail the request on log error)
          try {
            await userClient.from("student_activity_logs").insert({
              user_id: userId,
              activity_type: "video_access_denied",
              activity_data: { videoId, reason: "no_grant" },
            } as any);
          } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
          return jsonResponse({ error: "Not found or no access" }, 404);
        }
      }

      const tokenKey = Deno.env.get("BUNNY_STREAM_TOKEN_KEY") || "";
      const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 4; // 4 hours

      const baseHls = `https://${bunny.cdnHostname}/${videoId}/playlist.m3u8`;
      const baseEmbed = `https://iframe.mediadelivery.net/embed/${bunny.libraryId}/${videoId}`;
      const baseThumb = `https://${bunny.cdnHostname}/${videoId}/thumbnail.jpg`;

      let playbackUrl = baseHls;
      let embedUrl = `${baseEmbed}?autoplay=true&preload=true&responsive=true`;
      let signed = false;

      if (tokenKey) {
        // Bunny Stream token auth: SHA256_hex(token_key + video_id + expires)
        const token = await sha256Hex(`${tokenKey}${videoId}${expires}`);
        const q = `token=${token}&expires=${expires}`;
        playbackUrl = `${baseHls}?${q}`;
        embedUrl = `${baseEmbed}?autoplay=true&preload=true&responsive=true&${q}`;
        signed = true;
      }

      return jsonResponse({
        videoId,
        playbackUrl,
        embedUrl,
        thumbnailUrl: baseThumb,
        expiresAt: expires,
        signed,
      });
    }


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

      const res = await fetch(`${BUNNY_API_URL}/library/${bunny.libraryId}/videos`, {
        method: "POST",
        headers: {
          AccessKey: bunny.apiKey!,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: title.substring(0, 500) }),
      });

      if (!res.ok) {
        const upstream = await res.text().catch(() => "");
        console.error("Bunny Stream create-video failed", {
          status: res.status,
          libraryId: bunny.libraryId,
          upstream: upstream.slice(0, 500),
        });
        const error = res.status === 401
          ? "BUNNY_STREAM_API_KEY_INVALID_FOR_LIBRARY"
          : `Video creation failed [${res.status}]`;
        return new Response(JSON.stringify({ error, provider: "bunny-stream", status: res.status }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      const videoId = data.guid;
      const expirationTime = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
      const signature = await sha256Hex(`${bunny.libraryId}${bunny.apiKey}${expirationTime}${videoId}`);

      return new Response(JSON.stringify({
        videoId,
        libraryId: bunny.libraryId,
        expirationTime,
        signature,
        tusEndpoint: `${BUNNY_API_URL}/tusupload`,
        playbackUrl: `https://${bunny.cdnHostname}/${videoId}/playlist.m3u8`,
        embedUrl: `https://iframe.mediadelivery.net/embed/${bunny.libraryId}/${videoId}`,
        thumbnailUrl: `https://${bunny.cdnHostname}/${videoId}/thumbnail.jpg`,
        directPlayUrl: `https://${bunny.cdnHostname}/${videoId}/play_720p.mp4`,
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

      const res = await fetch(`${BUNNY_API_URL}/library/${bunny.libraryId}/videos/${videoId}`, {
        headers: {
          AccessKey: bunny.apiKey!,
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
        thumbnailUrl: `https://${bunny.cdnHostname}/${data.guid}/thumbnail.jpg`,
        playbackUrl: `https://${bunny.cdnHostname}/${data.guid}/playlist.m3u8`,
        directPlayUrl: `https://${bunny.cdnHostname}/${data.guid}/play_720p.mp4`,
        embedUrl: `https://iframe.mediadelivery.net/embed/${bunny.libraryId}/${data.guid}`,
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

      const res = await fetch(`${BUNNY_API_URL}/library/${bunny.libraryId}/videos/${videoId}`, {
        method: "DELETE",
        headers: {
          AccessKey: bunny.apiKey!,
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

    return new Response(JSON.stringify({ error: "Unknown action. Use: create-video, get-video, delete-video, sign-playback, health" }), {
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
