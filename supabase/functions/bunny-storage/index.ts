import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

const DEVELOPER_EMAILS = new Set(["alyedaft@gmail.com", "aliana200713@gmail.com"]);

function getBunnyStorageConfig() {
  const apiKey = Deno.env.get("BUNNY_STORAGE_API_KEY") || "";
  const zone = Deno.env.get("BUNNY_STORAGE_ZONE") || "";
  const storageHost = Deno.env.get("BUNNY_STORAGE_HOST") || "storage.bunnycdn.com";
  const cdnHostname = Deno.env.get("BUNNY_STORAGE_CDN_HOSTNAME") || "";
  return {
    apiKey,
    zone,
    storageHost,
    cdnHostname,
    missing: [
      !apiKey ? "BUNNY_STORAGE_API_KEY" : null,
      !zone ? "BUNNY_STORAGE_ZONE" : null,
      !cdnHostname ? "BUNNY_STORAGE_CDN_HOSTNAME" : null,
    ].filter(Boolean),
  };
}

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
  try {
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return null;
    const sb = createUserClient(authHeader);
    const { data, error } = await sb.auth.getClaims(token);
    if (error || !data?.claims?.sub) return null;
    return data.claims;
  } catch {
    return null;
  }
}

function isServiceRoleHealthCheck(authHeader: string | null) {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, "").trim() || "";
  return Boolean(serviceRoleKey && bearerToken === serviceRoleKey);
}

async function validateBunnyStorageCredentials(config: ReturnType<typeof getBunnyStorageConfig>) {
  const res = await fetch(`https://${config.storageHost}/${config.zone}/`, {
    headers: {
      AccessKey: config.apiKey,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const upstream = await res.text().catch(() => "");
    return { ok: false, status: res.status, upstream: upstream.slice(0, 500) };
  }
  return { ok: true, status: res.status, upstream: "" };
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
  const { data: contentData, error: contentError } = await sb
    .from("content")
    .select("id")
    .or(`file_url.eq.${storedUrl},thumbnail_url.eq.${storedUrl}`)
    .limit(1);
  if (!contentError && Array.isArray(contentData) && contentData.length > 0) return true;

  const { data: sourceData, error: sourceError } = await sb
    .from("ai_sources")
    .select("id")
    .eq("file_url", storedUrl)
    .limit(1);
  return !sourceError && Array.isArray(sourceData) && sourceData.length > 0;
}

function isAllowedStoragePath(filePath: string) {
  return filePath.startsWith("content/") || filePath.startsWith("ai-sources/");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const bunnyConfig = getBunnyStorageConfig();
  if (bunnyConfig.missing.length > 0) {
    return new Response(JSON.stringify({ error: "Storage not configured", missing: bunnyConfig.missing }), {
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

    const serviceRoleHealthCheck = action === "health" && isServiceRoleHealthCheck(authHeader);

    if (serviceRoleHealthCheck) {
      const validation = await validateBunnyStorageCredentials(bunnyConfig);
      return jsonResponse({
        ok: validation.ok,
        provider: "bunny-storage",
        zone: bunnyConfig.zone,
        cdnHostname: bunnyConfig.cdnHostname,
        status: validation.status,
        error: validation.ok ? null : "BUNNY_STORAGE_API_KEY_INVALID_FOR_ZONE",
      }, validation.ok ? 200 : 502);
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
      if (!isAllowedStoragePath(filePath)) {
        return jsonResponse({ error: "Invalid upload path" }, 403);
      }
      if (!(await canManageTeacherContent(userClient, userId, claims.email as string | undefined))) {
        return jsonResponse({ error: "Teacher upload permission required" }, 403);
      }

      const body = await req.arrayBuffer();
      const contentType = req.headers.get("content-type") || "application/octet-stream";

      const uploadRes = await fetch(`https://${bunnyConfig.storageHost}/${bunnyConfig.zone}/${filePath}`, {
        method: "PUT",
        headers: {
          AccessKey: bunnyConfig.apiKey,
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
        cdnUrl: `https://${bunnyConfig.cdnHostname}/${filePath}`,
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

      const storageRes = await fetch(`https://${bunnyConfig.storageHost}/${bunnyConfig.zone}/${filePath}`, {
        headers: { AccessKey: bunnyConfig.apiKey },
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

      const res = await fetch(`https://${bunnyConfig.storageHost}/${bunnyConfig.zone}/${filePath}`, {
        method: "DELETE",
        headers: {
          AccessKey: bunnyConfig.apiKey,
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
