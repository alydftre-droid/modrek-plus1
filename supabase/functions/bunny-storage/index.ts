import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

const BUNNY_STORAGE_ZONE = "301165";
const BUNNY_STORAGE_HOST = "storage.bunnycdn.com";
const BUNNY_CDN_HOST = "301165.b-cdn.net";
const DEVELOPER_EMAILS = new Set(["alyedaft@gmail.com", "aliana200713@gmail.com"]);

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getRequestAuthHeader(req: Request, url: URL) {
  const header = req.headers.get("Authorization");
  if (header?.startsWith("Bearer ")) return header;
  const token = url.searchParams.get("token");
  return token ? `Bearer ${token}` : null;
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

async function canManageTeacherContent(sb: ReturnType<typeof createClient>, userId: string, email?: string | null) {
  if (email && DEVELOPER_EMAILS.has(email.toLowerCase())) return true;
  return (await hasRole(sb, userId, "teacher")) || (await hasRole(sb, userId, "admin"));
}

async function canReadStoredFile(sb: ReturnType<typeof createClient>, filePath: string) {
  const storedUrl = `bstorage://${filePath}`;
  const { data, error } = await sb
    .from("content")
    .select("id")
    .or(`file_url.eq.${storedUrl},thumbnail_url.eq.${storedUrl}`)
    .limit(1);
  return !error && Array.isArray(data) && data.length > 0;
}

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

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const authHeader = getRequestAuthHeader(req, url);
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const claims = await getVerifiedClaims(authHeader);
    const userId = claims?.sub;
    if (!userId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const userClient = createUserClient(authHeader);

    // Action: upload — proxy upload server-side (replaces get-upload-auth)
    if (action === "upload") {
      const filePath = url.searchParams.get("path");
      if (!filePath) {
        return new Response(JSON.stringify({ error: "path is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!filePath.startsWith("content/")) {
        return jsonResponse({ error: "Invalid upload path" }, 403);
      }
      if (!(await canManageTeacherContent(userClient, userId, claims.email as string | undefined))) {
        return jsonResponse({ error: "Teacher upload permission required" }, 403);
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
      if (!(await canReadStoredFile(userClient, filePath))) {
        return jsonResponse({ error: "Not found or no access" }, 404);
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
      if (!(await canManageTeacherContent(userClient, userId, claims.email as string | undefined))) {
        return jsonResponse({ error: "Teacher delete permission required" }, 403);
      }
      if (!(await canReadStoredFile(userClient, filePath))) {
        return jsonResponse({ error: "Not found or no access" }, 404);
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
