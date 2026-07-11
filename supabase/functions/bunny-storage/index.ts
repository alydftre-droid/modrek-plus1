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

function getRequestAuthHeader(req: Request, _url: URL) {
  // SECURITY: only accept Authorization header. Never accept tokens in the URL
  // query string — they leak through browser history, referer headers, proxies,
  // and CDN logs.
  const header = req.headers.get("Authorization");
  return header?.startsWith("Bearer ") ? header : null;
}

// SECURITY: prevent path traversal (../, //, backslash, null byte, absolute
// paths) and enforce the allow-listed prefixes.
function sanitizeStoragePath(input: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.includes("..") || trimmed.includes("\\") || trimmed.includes("\0")) return null;
  if (trimmed.startsWith("/") || trimmed.includes("//")) return null;
  // decoded form must also be safe (defence-in-depth against %2e%2e etc.)
  let decoded: string;
  try { decoded = decodeURIComponent(trimmed); } catch { return null; }
  if (decoded.includes("..") || decoded.includes("\\") || decoded.includes("\0")) return null;
  if (decoded.startsWith("/") || decoded.includes("//")) return null;
  if (!isAllowedStoragePath(decoded)) return null;
  return decoded;
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

async function canManageModrek(sb: ReturnType<typeof createClient>, userId: string, email?: string | null) {
  if (email && DEVELOPER_EMAILS.has(email.toLowerCase())) return true;
  return await hasRole(sb, userId, "admin");
}

// library/{userId}/{...} — student's private library scoped to their own uid.
function isLibraryPathForUser(filePath: string, userId: string): boolean {
  if (!filePath.startsWith("library/")) return false;
  const parts = filePath.split("/");
  return parts.length >= 3 && parts[1] === userId;
}

async function canReadStoredFile(sb: ReturnType<typeof createClient>, filePath: string, userId: string) {
  // Personal library — owner-only, verified via content row link.
  if (filePath.startsWith("library/")) {
    if (!isLibraryPathForUser(filePath, userId)) return false;
    const storedUrl = `bstorage://${filePath}`;
    const { data } = await sb
      .from("content")
      .select("id")
      .eq("file_url", storedUrl)
      .eq("uploaded_by", userId)
      .eq("type", "student_library")
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  }

  // Modrek library assets — registered in storage_assets with provider='bunny'
  if (filePath.startsWith("modrek/")) {
    const { data: assetData } = await sb
      .from("storage_assets")
      .select("id")
      .eq("storage_provider", "bunny")
      .eq("object_path", filePath)
      .limit(1);
    return Array.isArray(assetData) && assetData.length > 0;
  }

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
  return (
    filePath.startsWith("content/") ||
    filePath.startsWith("ai-sources/") ||
    filePath.startsWith("modrek/") ||
    filePath.startsWith("library/")
  );
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
      const filePath = sanitizeStoragePath(url.searchParams.get("path"));
      if (!filePath) {
        return jsonResponse({ error: "Invalid or missing path" }, 400);
      }

      let permitted = false;
      if (filePath.startsWith("modrek/")) {
        permitted = await canManageModrek(userClient, userId, claims.email as string | undefined);
      } else if (filePath.startsWith("library/")) {
        // Student personal library — must upload only under their own uid.
        permitted = isLibraryPathForUser(filePath, userId);
      } else {
        permitted = await canManageTeacherContent(userClient, userId, claims.email as string | undefined);
      }
      if (!permitted) {
        return jsonResponse({ error: "Upload permission required" }, 403);
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

    // Action: download — proxy file download with HTTP Range support so PDF
    // viewers / video players can request byte slices instead of the full file.
    if (action === "download") {
      const filePath = sanitizeStoragePath(url.searchParams.get("path"));
      if (!filePath) {
        return jsonResponse({ error: "Invalid or missing path" }, 400);
      }
      if (!(await canReadStoredFile(userClient, filePath, userId))) {
        return jsonResponse({ error: "Not found or no access" }, 404);
      }

      const rangeHeader = req.headers.get("Range");
      const ifNoneMatch = req.headers.get("If-None-Match");
      const upstreamHeaders: Record<string, string> = { AccessKey: bunnyConfig.apiKey };
      if (rangeHeader) upstreamHeaders["Range"] = rangeHeader;
      if (ifNoneMatch) upstreamHeaders["If-None-Match"] = ifNoneMatch;

      const storageRes = await fetch(`https://${bunnyConfig.storageHost}/${bunnyConfig.zone}/${filePath}`, {
        headers: upstreamHeaders,
      });

      if (storageRes.status === 304) {
        return new Response(null, { status: 304, headers: corsHeaders });
      }
      if (!storageRes.ok && storageRes.status !== 206) {
        return new Response(JSON.stringify({ error: `File not found [${storageRes.status}]` }), {
          status: storageRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const contentType = storageRes.headers.get("content-type") || "application/octet-stream";
      const outHeaders: Record<string, string> = {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filePath.split("/").pop()}"`,
        "Cache-Control": "private, max-age=31536000, immutable",
        "Accept-Ranges": "bytes",
      };
      const passthrough = ["content-length", "content-range", "etag", "last-modified"];
      for (const h of passthrough) {
        const v = storageRes.headers.get(h);
        if (v) outHeaders[h] = v;
      }

      return new Response(storageRes.body, {
        status: storageRes.status === 206 ? 206 : 200,
        headers: outHeaders,
      });
    }

    // Action: delete — delete a file from Bunny Storage
    if (action === "delete") {
      const filePath = sanitizeStoragePath(url.searchParams.get("path"));
      if (!filePath) {
        return jsonResponse({ error: "Invalid or missing path" }, 400);
      }
      let canDelete = false;
      if (filePath.startsWith("modrek/")) {
        canDelete = await canManageModrek(userClient, userId, claims.email as string | undefined);
      } else if (filePath.startsWith("library/")) {
        canDelete = isLibraryPathForUser(filePath, userId);
      } else {
        canDelete = await canManageTeacherContent(userClient, userId, claims.email as string | undefined);
      }
      if (!canDelete) {
        return jsonResponse({ error: "Delete permission required" }, 403);
      }
      if (!(await canReadStoredFile(userClient, filePath, userId))) {
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
