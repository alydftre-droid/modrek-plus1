import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { isDemoUserId, DEMO_READ_ONLY_CODE, DEMO_READ_ONLY_MESSAGE } from "../_shared/demoGuard.ts";

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function decodeHtmlUrl(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractFirstUrl(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlUrl(match[1]);
  }
  return null;
}

const BUNNY_API_URL = "https://video.bunnycdn.com";

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

async function getEmbedToken(tokenKey: string, videoId: string, expires: number) {
  if (!tokenKey) return null;
  return await sha256Hex(`${tokenKey}${videoId}${expires}`);
}

async function getCdnToken(tokenKey: string, path: string, expires: number) {
  if (!tokenKey) return null;
  const input = new TextEncoder().encode(`${tokenKey}${path}${expires}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function fetchPlaybackFromBunnyEmbed(embedUrl: string) {
  try {
    const res = await fetch(embedUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "ModrekPlus-PlaybackResolver/1.0",
      },
    });
    if (!res.ok) {
      const upstream = await res.text().catch(() => "");
      console.warn("Bunny embed resolver failed", { status: res.status, upstream: upstream.slice(0, 240) });
      return null;
    }
    const html = await res.text();
    const playbackUrl = extractFirstUrl(html, [
      /<source[^>]+type=["']application\/vnd\.apple\.mpegURL["'][^>]+src=["']([^"']+playlist\.m3u8[^"']*)["']/i,
      /urlPlaylistUrl\s*=\s*["']([^"']+playlist\.m3u8[^"']*)["']/i,
      /(https:\/\/[^"'\s<>]+playlist\.m3u8[^"'\s<>]*)/i,
    ]);
    const thumbnailUrl = extractFirstUrl(html, [
      /data-poster=["']([^"']+thumbnail\.jpg[^"']*)["']/i,
      /property=["']og:image["'][^>]+content=["']([^"']+thumbnail\.jpg[^"']*)["']/i,
      /content=["']([^"']+thumbnail\.jpg[^"']*)["'][^>]+property=["']og:image["']/i,
      /(https:\/\/[^"'\s<>]+thumbnail\.jpg[^"'\s<>]*)/i,
    ]);
    return playbackUrl ? { playbackUrl, thumbnailUrl, embedUrl } : null;
  } catch (error) {
    console.warn("Bunny embed resolver exception", error);
    return null;
  }
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
    const { data, error } = await sb.auth.getClaims(token);
    if (error || !data?.claims?.sub) return null;
    return { sub: String(data.claims.sub), email: typeof data.claims.email === "string" ? data.claims.email : null };
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

async function canCreateTeacherVideo(sb: ReturnType<typeof createClient>, userId: string, _email?: string | null) {
  // Role-based only: developer access comes from the admin role, never email.
  return (await hasRole(sb, userId, "teacher")) || (await hasRole(sb, userId, "admin"));
}

async function canAccessVideo(sb: ReturnType<typeof createClient>, videoId: string) {
  const { data, error } = await sb.from("content").select("id").eq("file_url", `bunny://${videoId}`).limit(1);
  if (!error && Array.isArray(data) && data.length > 0) return true;
  const { data: profileData, error: profileError } = await sb
    .from("teacher_profiles")
    .select("teacher_id")
    .eq("video_url", `bunny://${videoId}`)
    .limit(1);
  return !profileError && Array.isArray(profileData) && profileData.length > 0;
}

/* ---------------------------------------------------------------- */
/*  Bunny encoding status helpers                                    */
/* ---------------------------------------------------------------- */

// Bunny Stream video.status codes
// 0 Created · 1 Uploaded · 2 Processing · 3 Transcoding · 4 Finished
// 5 Error   · 6 UploadFailed · 7 JitSegmenting · 8 JitPlaylistsCreated
const BUNNY_STATUS_LABEL: Record<number, string> = {
  0: "created",
  1: "uploaded",
  2: "processing",
  3: "transcoding",
  4: "finished",
  5: "error",
  6: "upload_failed",
  7: "jit_segmenting",
  8: "jit_playlists_created",
};

function describeBunnyVideo(data: Record<string, any>) {
  const status = Number(data?.status ?? 0);
  const resolutions = String(data?.availableResolutions || "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  const isFailed = status === 5 || status === 6;
  // Playable as soon as at least one rendition is published (Bunny publishes
  // progressively during transcoding) or the encode is fully finished.
  const isPlayable = !isFailed && (status === 4 || status === 8 || resolutions.length > 0);
  const isProcessing = !isFailed && !isPlayable;
  return {
    videoId: data?.guid,
    title: data?.title ?? null,
    status,
    statusLabel: BUNNY_STATUS_LABEL[status] ?? `unknown_${status}`,
    encodeProgress: Number(data?.encodeProgress ?? 0),
    length: Number(data?.length ?? 0),
    width: Number(data?.width ?? 0),
    height: Number(data?.height ?? 0),
    storageSize: Number(data?.storageSize ?? 0),
    availableResolutions: resolutions,
    isPlayable,
    isProcessing,
    isFailed,
    // Bunny keeps a 0-byte record when the tus upload never finalized.
    neverUploaded: status <= 1 && Number(data?.storageSize ?? 0) === 0,
  };
}

async function fetchBunnyVideo(apiKey: string, libraryId: string, videoId: string) {
  const res = await fetch(`${BUNNY_API_URL}/library/${libraryId}/videos/${videoId}`, {
    headers: { AccessKey: apiKey, Accept: "application/json" },
  });
  if (!res.ok) {
    const upstream = await res.text().catch(() => "");
    return { ok: false as const, status: res.status, upstream: upstream.slice(0, 400) };
  }
  return { ok: true as const, data: await res.json() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const bunny = getBunnyStreamConfig();
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // sign-playback + health don't need the write API key — only library + cdn (+ optional token key).
  // Other actions (create/get/delete-video) need the full config.
    const readOnlyAction = action === "sign-playback" || action === "sign-thumbnail" || action === "health";
  const missingForAction = readOnlyAction
    ? bunny.missing.filter((m) => m !== "BUNNY_STREAM_API_KEY")
    : bunny.missing;
  if (missingForAction.length > 0) {
    return jsonResponse({ error: "Bunny Stream production environment is not fully configured", missing: missingForAction }, 500);
  }

  // --- Authentication ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const serviceRoleCall = isServiceRoleHealthCheck(authHeader);
  const serviceRoleHealthCheck = (action === "health" || action === "diagnose") && serviceRoleCall;

  const claims = serviceRoleHealthCheck ? { sub: "service-role-health-check", email: null } : await getVerifiedClaims(authHeader);
  const userId = claims?.sub;
  if (!userId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const userClient = createUserClient(authHeader);

  // Demo accounts: playback/thumbnail signing stays allowed, every Bunny Stream
  // mutation is refused server-side.
  const STREAM_WRITE_ACTIONS = new Set(["create-video", "delete-video", "reencode"]);
  if (STREAM_WRITE_ACTIONS.has(action ?? "") && (await isDemoUserId(userId))) {
    return jsonResponse({ error: DEMO_READ_ONLY_CODE, code: DEMO_READ_ONLY_CODE, message: DEMO_READ_ONLY_MESSAGE }, 403);
  }

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

      // Access check — teachers/admins pass through; students may play either a
      // lesson video or an intro referenced by a visible teacher profile.
      const isPrivileged = await canCreateTeacherVideo(userClient, userId, claims.email as string | undefined);
      if (!isPrivileged) {
        if (!(await canAccessVideo(userClient, videoId))) {
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
      let thumbnailUrl = baseThumb;
      let signed = false;

      if (tokenKey) {
        // Bunny Stream embed-view token auth. This signs the iframe/player, not
        // the direct CDN HLS URL. Direct CDN token auth uses a different bcdn
        // token format, so we resolve the real HLS URL from Bunny's embed page.
        const token = await getEmbedToken(tokenKey, videoId, expires);
        const q = `token=${token}&expires=${expires}`;
        embedUrl = `${baseEmbed}?autoplay=true&preload=true&responsive=true&${q}`;
        signed = true;
      }

      // Prefer the signed embed page. If the configured embed token key is
      // stale/wrong while the library allows normal embeds, retry without the
      // token instead of returning a direct CDN URL that Bunny rejects with 403.
      const embedPlayback = await fetchPlaybackFromBunnyEmbed(embedUrl)
        || await fetchPlaybackFromBunnyEmbed(`${baseEmbed}?autoplay=true&preload=true&responsive=true`);
      if (embedPlayback?.playbackUrl) {
        playbackUrl = embedPlayback.playbackUrl;
        embedUrl = embedPlayback.embedUrl || embedUrl;
        thumbnailUrl = embedPlayback.thumbnailUrl || thumbnailUrl;
        signed = true;
      }

      return jsonResponse({
        videoId,
        playbackUrl,
        embedUrl,
        thumbnailUrl,
        expiresAt: expires,
        signed,
      });
    }

    // Covers are intentionally available to every authenticated viewer who has
    // received the opaque video id in the student catalogue. Playback remains
    // protected by the stricter sign-playback access check above.
    if (action === "sign-thumbnail") {
      let body: any = {};
      try { body = await req.json(); } catch { body = {}; }
      const videoId: string | undefined = body?.videoId;
      if (!videoId || typeof videoId !== "string" || !/^[a-zA-Z0-9-]{8,64}$/.test(videoId)) {
        return jsonResponse({ error: "videoId is required" }, 400);
      }

      const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 4;
      const path = `/${videoId}/thumbnail.jpg`;
      const cdnTokenKey = Deno.env.get("BUNNY_CDN_TOKEN_KEY")
        || Deno.env.get("BUNNY_STREAM_TOKEN_KEY")
        || "";
      const token = await getCdnToken(cdnTokenKey, path, expires);
      const thumbnailUrl = token
        ? `https://${bunny.cdnHostname}${path}?token=${token}&expires=${expires}`
        : `https://${bunny.cdnHostname}${path}`;

      return jsonResponse({ videoId, thumbnailUrl, expiresAt: expires, signed: Boolean(token) });
    }

    // Action: video-status — encoding status for the player (students + teachers).
    // Lets the UI show real progress / a real error instead of an endless spinner.
    if (action === "video-status") {
      let body: any = {};
      try { body = await req.json(); } catch { body = {}; }
      const videoId: string | undefined = body?.videoId || url.searchParams.get("videoId") || undefined;
      if (!videoId || !/^[a-zA-Z0-9-]{8,64}$/.test(videoId)) {
        return jsonResponse({ error: "videoId is required" }, 400);
      }
      const isPrivileged = await canCreateTeacherVideo(userClient, userId, claims.email as string | undefined);
      if (!isPrivileged && !(await canAccessVideo(userClient, videoId))) {
        return jsonResponse({ error: "Not found or no access" }, 404);
      }
      if (!bunny.apiKey) {
        return jsonResponse({ error: "BUNNY_STREAM_API_KEY_MISSING", unknown: true }, 200);
      }
      const result = await fetchBunnyVideo(bunny.apiKey, bunny.libraryId!, videoId);
      if (!result.ok) {
        console.error("bunny video-status failed", { videoId, status: result.status, upstream: result.upstream });
        return jsonResponse({
          error: result.status === 404 ? "VIDEO_NOT_FOUND" : `BUNNY_STATUS_${result.status}`,
          videoId,
          status: -1,
          statusLabel: result.status === 404 ? "missing" : "unavailable",
          isPlayable: false,
          isProcessing: false,
          isFailed: true,
        }, 200);
      }
      const info = describeBunnyVideo(result.data);
      console.log("bunny video-status", JSON.stringify({ videoId, ...info }));
      return jsonResponse(info);
    }

    // Action: reencode — retry a failed / stuck encode (teacher + admin only).
    if (action === "reencode") {
      let body: any = {};
      try { body = await req.json(); } catch { body = {}; }
      const videoId: string | undefined = body?.videoId || url.searchParams.get("videoId") || undefined;
      if (!videoId || !/^[a-zA-Z0-9-]{8,64}$/.test(videoId)) {
        return jsonResponse({ error: "videoId is required" }, 400);
      }
      if (!(await canCreateTeacherVideo(userClient, userId, claims.email as string | undefined))) {
        return jsonResponse({ error: "Teacher video permission required" }, 403);
      }
      const res = await fetch(`${BUNNY_API_URL}/library/${bunny.libraryId}/videos/${videoId}/reencode`, {
        method: "POST",
        headers: { AccessKey: bunny.apiKey!, Accept: "application/json" },
      });
      const upstream = await res.text().catch(() => "");
      console.log("bunny reencode", JSON.stringify({ videoId, status: res.status, upstream: upstream.slice(0, 300) }));
      if (!res.ok) {
        return jsonResponse({ error: `Reencode failed [${res.status}]`, details: upstream.slice(0, 300) }, res.status);
      }
      return jsonResponse({ success: true, videoId });
    }

    // Action: diagnose — service-role only pipeline audit of the newest videos.
    if (action === "diagnose") {
      if (!serviceRoleCall) return jsonResponse({ error: "Service role required" }, 403);
      const res = await fetch(
        `${BUNNY_API_URL}/library/${bunny.libraryId}/videos?page=1&itemsPerPage=20&orderBy=date`,
        { headers: { AccessKey: bunny.apiKey!, Accept: "application/json" } },
      );
      if (!res.ok) {
        const upstream = await res.text().catch(() => "");
        return jsonResponse({ error: `List failed [${res.status}]`, upstream: upstream.slice(0, 400) }, 502);
      }
      const list = await res.json();
      return jsonResponse({
        libraryId: bunny.libraryId,
        cdnHostname: bunny.cdnHostname,
        totalItems: list?.totalItems ?? 0,
        items: (list?.items ?? []).map((v: Record<string, any>) => describeBunnyVideo(v)),
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
