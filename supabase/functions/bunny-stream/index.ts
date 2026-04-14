const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    return new Response(JSON.stringify({ error: "BUNNY_API_KEY not configured" }), {
      status: 500,
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
      if (!title) {
        return new Response(JSON.stringify({ error: "title is required" }), {
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
        body: JSON.stringify({ title }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return new Response(JSON.stringify({ error: `Bunny create failed [${res.status}]: ${errText}` }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      const videoId = data.guid;

      return new Response(JSON.stringify({
        videoId,
        libraryId: BUNNY_LIBRARY_ID,
        uploadUrl: `${BUNNY_API_URL}/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`,
        playbackUrl: `https://${BUNNY_CDN_HOSTNAME}/${videoId}/playlist.m3u8`,
        embedUrl: `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${videoId}`,
        thumbnailUrl: `https://${BUNNY_CDN_HOSTNAME}/${videoId}/thumbnail.jpg`,
        directPlayUrl: `https://${BUNNY_CDN_HOSTNAME}/${videoId}/play_720p.mp4`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: get-upload-auth — returns the API key for direct PUT upload from client
    // This is needed so the client can upload the binary directly to Bunny
    if (action === "get-upload-auth") {
      const videoId = url.searchParams.get("videoId");
      if (!videoId) {
        return new Response(JSON.stringify({ error: "videoId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Return a signed upload config
      return new Response(JSON.stringify({
        uploadUrl: `${BUNNY_API_URL}/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`,
        authKey: BUNNY_API_KEY,
        libraryId: BUNNY_LIBRARY_ID,
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

      const res = await fetch(`${BUNNY_API_URL}/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`, {
        headers: {
          AccessKey: BUNNY_API_KEY,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        return new Response(JSON.stringify({ error: `Bunny fetch failed [${res.status}]: ${errText}` }), {
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
        const errText = await res.text();
        return new Response(JSON.stringify({ error: `Bunny delete failed [${res.status}]: ${errText}` }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use: create-video, get-upload-auth, get-video, delete-video" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
