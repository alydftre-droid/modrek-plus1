import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const FUNCTION_VERSION = "teacher-intro-media-v2-2026-07-31";
const INTRO_PATH = /^content\/teacher-intros?\/[0-9a-f-]{36}\/intro-[a-zA-Z0-9._-]+$/i;

const responseHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, range, if-none-match, x-client-info",
  "Access-Control-Expose-Headers": "content-length, content-range, content-type, etag, last-modified, accept-ranges, x-modrek-function-version, x-modrek-trace-id",
};

function diagnostic(error: string, reason: string, status: number, traceId: string, path?: string) {
  return new Response(JSON.stringify({ error, reason, path, traceId, functionVersion: FUNCTION_VERSION }), {
    status,
    headers: {
      ...responseHeaders,
      "Content-Type": "application/json",
      "X-Modrek-Function-Version": FUNCTION_VERSION,
      "X-Modrek-Trace-Id": traceId,
    },
  });
}

function getBearer(req: Request, url: URL) {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header;
  const token = url.searchParams.get("token");
  return token?.split(".").length === 3 ? `Bearer ${token}` : null;
}

function isServiceRoleRequest(authHeader: string | null) {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearer = authHeader?.replace(/^Bearer\s+/i, "").trim() || "";
  return Boolean(serviceRoleKey && bearer === serviceRoleKey);
}

async function hasValidSession(authHeader: string) {
  const backendUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!backendUrl || !anonKey) return false;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const client = createClient(backendUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await client.auth.getClaims(token);
  return !error && Boolean(data?.claims?.sub);
}

function contentType(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "webm") return "video/webm";
  if (extension === "ogv") return "video/ogg";
  if (extension === "mov" || extension === "m4v" || extension === "mp4") return "video/mp4";
  return "application/octet-stream";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders });

  const traceId = crypto.randomUUID();
  if (req.method !== "GET") return diagnostic("Method not allowed", "METHOD_NOT_ALLOWED", 405, traceId);

  const url = new URL(req.url);
  const authHeader = getBearer(req, url);
  if (url.searchParams.get("action") === "health") {
    if (!isServiceRoleRequest(authHeader)) {
      return diagnostic("Authentication required", "INVALID_HEALTH_CREDENTIAL", 401, traceId);
    }
    return new Response(JSON.stringify({ ok: true, provider: "teacher-intro-media", functionVersion: FUNCTION_VERSION }), {
      status: 200,
      headers: {
        ...responseHeaders,
        "Content-Type": "application/json",
        "X-Modrek-Function-Version": FUNCTION_VERSION,
        "X-Modrek-Trace-Id": traceId,
      },
    });
  }

  const rawPath = url.searchParams.get("path")?.trim() || "";
  let path = rawPath;
  try { path = decodeURIComponent(rawPath); } catch { /* URLSearchParams is normally already decoded */ }
  if (!INTRO_PATH.test(path) || path.includes("..") || path.includes("\\")) {
    return diagnostic("Invalid teacher intro path", "INVALID_INTRO_PATH", 400, traceId, path);
  }

  if (!authHeader || !(await hasValidSession(authHeader))) {
    return diagnostic("Authentication required", "INVALID_SESSION", 401, traceId, path);
  }

  const apiKey = Deno.env.get("BUNNY_STORAGE_API_KEY") || "";
  const zone = Deno.env.get("BUNNY_STORAGE_ZONE") || "";
  const host = Deno.env.get("BUNNY_STORAGE_HOST") || "storage.bunnycdn.com";
  if (!apiKey || !zone) return diagnostic("Media service is not configured", "STORAGE_CONFIG_MISSING", 503, traceId, path);

  const upstreamHeaders: Record<string, string> = { AccessKey: apiKey };
  const range = req.headers.get("range");
  const etag = req.headers.get("if-none-match");
  if (range) upstreamHeaders.Range = range;
  if (etag) upstreamHeaders["If-None-Match"] = etag;

  const upstream = await fetch(`https://${host}/${zone}/${path}`, { headers: upstreamHeaders });
  if (upstream.status === 304) return new Response(null, { status: 304, headers: responseHeaders });
  if (!upstream.ok && upstream.status !== 206) {
    await upstream.body?.cancel().catch(() => undefined);
    return diagnostic("Teacher intro object is missing", `STORAGE_UPSTREAM_${upstream.status}`, upstream.status === 404 ? 404 : 502, traceId, path);
  }

  const headers: Record<string, string> = {
    ...responseHeaders,
    "Content-Type": contentType(path),
    "Content-Disposition": `inline; filename="${path.split("/").pop() || "intro.mp4"}"`,
    "Cache-Control": "private, no-cache, max-age=0, must-revalidate",
    "Accept-Ranges": "bytes",
    "X-Modrek-Function-Version": FUNCTION_VERSION,
    "X-Modrek-Trace-Id": traceId,
  };
  for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }

  return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
});