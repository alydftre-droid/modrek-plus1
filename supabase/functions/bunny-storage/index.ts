import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUNNY_STORAGE_ZONE = "301165";
const BUNNY_STORAGE_HOST = "storage.bunnycdn.com";
const BUNNY_CDN_HOST = "301165.b-cdn.net";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const BUNNY_STORAGE_API_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY");
  if (!BUNNY_STORAGE_API_KEY) {
    return new Response(JSON.stringify({ error: "Storage not configured" }), {
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

    // Action: upload — proxy upload server-side (replaces get-upload-auth)
    if (action === "upload") {
      const filePath = url.searchParams.get("path");
      if (!filePath) {
        return new Response(JSON.stringify({ error: "path is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.arrayBuffer();
      const contentType = req.headers.get("content-type") || "application/octet-stream";

      const uploadRes = await fetch(`https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${filePath}`, {
        method: "PUT",
        headers: {
          AccessKey: BUNNY_STORAGE_API_KEY,
          "Content-Type": contentType,
        },
        body,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        return new Response(JSON.stringify({ error: `Upload failed [${uploadRes.status}]` }), {
          status: uploadRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        cdnUrl: `https://${BUNNY_CDN_HOST}/${filePath}`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: download — proxy file download
    if (action === "download") {
      const filePath = url.searchParams.get("path");
      if (!filePath) {
        return new Response(JSON.stringify({ error: "path is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const storageRes = await fetch(`https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${filePath}`, {
        headers: { AccessKey: BUNNY_STORAGE_API_KEY },
      });

      if (!storageRes.ok) {
        return new Response(JSON.stringify({ error: `File not found [${storageRes.status}]` }), {
          status: storageRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const contentType = storageRes.headers.get("content-type") || "application/octet-stream";
      return new Response(storageRes.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${filePath.split("/").pop()}"`,
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // Action: delete — delete a file from Bunny Storage
    if (action === "delete") {
      const filePath = url.searchParams.get("path");
      if (!filePath) {
        return new Response(JSON.stringify({ error: "path is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await fetch(`https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${filePath}`, {
        method: "DELETE",
        headers: {
          AccessKey: BUNNY_STORAGE_API_KEY,
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

    return new Response(JSON.stringify({ error: "Unknown action. Use: upload, download, delete" }), {
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
