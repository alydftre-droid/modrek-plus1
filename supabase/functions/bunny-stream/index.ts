import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

const BUNNY_API_URL = "https://video.bunnycdn.com";
const BUNNY_LIBRARY_ID = "637783";
const BUNNY_CDN_HOSTNAME = "vz-94218f57-770.b-cdn.net";

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
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Action: create-video — creates a video object in Bunny, returns guid + upload URL
    if (action === "create-video") {
      const body = await req.json();
      const { title } = body;
      if (!title || typeof title !== "string" || title.length > 500) {
        return new Response(JSON.stringify({ error: "title is required (max 500 chars)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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

      return new Response(JSON.stringify({
        videoId,
        libraryId: BUNNY_LIBRARY_ID,
        playbackUrl: `https://${BUNNY_CDN_HOSTNAME}/${videoId}/playlist.m3u8`,
        embedUrl: `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${videoId}`,
        thumbnailUrl: `https://${BUNNY_CDN_HOSTNAME}/${videoId}/thumbnail.jpg`,
        directPlayUrl: `https://${BUNNY_CDN_HOSTNAME}/${videoId}/play_720p.mp4`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: upload-video — proxy binary upload server-side (replaces get-upload-auth)
    if (action === "upload-video") {
      const videoId = url.searchParams.get("videoId");
      if (!videoId || !/^[a-f0-9-]{36}$/i.test(videoId)) {
        return new Response(JSON.stringify({ error: "valid videoId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.arrayBuffer();

      const uploadRes = await fetch(`${BUNNY_API_URL}/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`, {
        method: "PUT",
        headers: {
          AccessKey: BUNNY_API_KEY,
        },
        body,
      });

      if (!uploadRes.ok) {
        return new Response(JSON.stringify({ error: `Upload failed [${uploadRes.status}]` }), {
          status: uploadRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, videoId }), {
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

    return new Response(JSON.stringify({ error: "Unknown action. Use: create-video, upload-video, get-video, delete-video" }), {
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
