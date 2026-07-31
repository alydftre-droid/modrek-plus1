import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range, if-none-match",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Expose-Headers": "content-length, content-range, content-type, etag, last-modified, accept-ranges",
};

const DEVELOPER_EMAILS = new Set(["alyedaft@gmail.com", "aliana200713@gmail.com"]);
const FUNCTION_VERSION = "teacher-media-playback-v3-2026-07-31";

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
    headers: { ...corsHeaders, "Content-Type": "application/json", "X-Modrek-Function-Version": FUNCTION_VERSION },
  });
}

function uploadLog(stage: string, details: Record<string, unknown> = {}) {
  console.info("[bunny-storage:library-upload]", JSON.stringify({ stage, ...details }));
}

function uploadError(stage: string, details: Record<string, unknown> = {}) {
  console.error("[bunny-storage:library-upload]", JSON.stringify({ stage, ...details }));
}

function parseContentRangeTotal(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\/(\d+)\s*$/);
  if (!match) return null;
  const total = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(total) ? total : null;
}

function bytesToAscii(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".")).join("");
}

async function verifyFinalPdfObject(config: ReturnType<typeof getBunnyStorageConfig>, filePath: string, expectedSize: number | null) {
  const verifyRes = await fetch(`https://${config.storageHost}/${config.zone}/${filePath}`, {
    headers: {
      AccessKey: config.apiKey,
      Range: "bytes=0-15",
    },
  });
  if (!verifyRes.ok && verifyRes.status !== 206) {
    const upstream = await verifyRes.text().catch(() => "");
    return { ok: false, reason: `verify_read_failed:${verifyRes.status}`, upstream: upstream.slice(0, 200) };
  }
  const firstBytes = new Uint8Array(await verifyRes.arrayBuffer());
  const header = bytesToAscii(firstBytes);
  const rangeTotal = parseContentRangeTotal(verifyRes.headers.get("content-range"));
  const lengthTotal = Number.parseInt(verifyRes.headers.get("content-length") || "0", 10) || null;
  const totalSize = rangeTotal ?? lengthTotal;
  if (!header.startsWith("%PDF-")) {
    return { ok: false, reason: "final_object_is_not_pdf", header, totalSize };
  }
  if (expectedSize && totalSize && totalSize < expectedSize) {
    return { ok: false, reason: "final_object_size_mismatch", header, totalSize, expectedSize };
  }
  if (totalSize !== null && totalSize < 128) {
    return { ok: false, reason: "final_object_too_small", header, totalSize, expectedSize };
  }
  return { ok: true, header, totalSize, expectedSize };
}

async function verifyFinalMediaObject(
  config: ReturnType<typeof getBunnyStorageConfig>,
  filePath: string,
  expectedSize: number | null,
) {
  const verifyRes = await fetch(`https://${config.storageHost}/${config.zone}/${filePath}`, {
    headers: {
      AccessKey: config.apiKey,
      Range: "bytes=0-1023",
    },
  });
  if (!verifyRes.ok && verifyRes.status !== 206) {
    const upstream = await verifyRes.text().catch(() => "");
    return { ok: false, reason: `verify_read_failed:${verifyRes.status}`, upstream: upstream.slice(0, 200) };
  }
  const rangeTotal = parseContentRangeTotal(verifyRes.headers.get("content-range"));
  const lengthTotal = Number.parseInt(verifyRes.headers.get("content-length") || "0", 10) || null;
  const totalSize = rangeTotal ?? lengthTotal;
  const firstBytes = new Uint8Array(await verifyRes.arrayBuffer());
  if (firstBytes.byteLength === 0) return { ok: false, reason: "final_object_is_empty", totalSize };
  if (expectedSize && totalSize && totalSize !== expectedSize) {
    return { ok: false, reason: "final_object_size_mismatch", totalSize, expectedSize };
  }
  return { ok: true, totalSize, expectedSize };
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number, stage: string) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(new Error(`${stage}_TIMEOUT`)), timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return { res, elapsedMs: Date.now() - startedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    uploadError(`${stage}_exception`, { message, elapsedMs: Date.now() - startedAt });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function randomUploadId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizePositiveInt(value: string | null, max: number): number | null {
  if (!value || !/^\d{1,12}$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) return null;
  return parsed;
}

function getRequestAuthHeader(req: Request, url: URL) {
  const header = req.headers.get("Authorization");
  if (header?.startsWith("Bearer ")) return header;
  // Browser primitives (<img>, <video>, <a href>, window.open) cannot attach
  // custom headers. For read-only download requests only, accept the JWT via
  // the `token` query parameter as a compatibility fallback. Write actions
  // (upload/delete/finalize) still require a real Authorization header because
  // they are always issued from JS with fetch/XHR.
  const action = url.searchParams.get("action");
  if (action === "download") {
    const token = url.searchParams.get("token");
    if (token && token.split(".").length === 3) return `Bearer ${token}`;
  }
  return null;
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
    const { data, error } = await sb.auth.getClaims(token);
    const claims = data?.claims;
    if (error || !claims?.sub) return null;
    return {
      sub: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
    };
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

// Bunny Storage always answers GET with `application/octet-stream`, which makes
// browsers refuse to play video/audio (black player, 0:00). Infer a real MIME
// type from the file extension so media elements can decode the stream.
const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  wmv: "video/x-ms-wmv",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

function contentTypeFromPath(filePath: string, upstreamType: string | null): string {
  const ext = filePath.split("?")[0].split(".").pop()?.toLowerCase() || "";
  const mapped = EXTENSION_CONTENT_TYPES[ext];
  const upstream = (upstreamType || "").split(";")[0].trim().toLowerCase();
  const isGeneric = !upstream || upstream === "application/octet-stream" || upstream === "binary/octet-stream";
  if (mapped && isGeneric) return mapped;
  return upstreamType || mapped || "application/octet-stream";
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
    const storedUrl = `bstorage://${filePath}`;

    // (a) Developer-managed library book — readable by ANY authenticated user
    //     when the book is published (ready) and on the free tier.
    const { data: libBook } = await sb
      .from("library_books")
      .select("id")
      .eq("pdf_path", storedUrl)
      .eq("status", "ready")
      .eq("access_tier", "free")
      .limit(1);
    if (Array.isArray(libBook) && libBook.length > 0) return true;

    // (b) Student's own personal upload — owner-scoped, legacy path.
    if (!isLibraryPathForUser(filePath, userId)) return false;
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

  // Teacher profile media (intro video / photo / cover) — visible to any
  // authenticated user, exactly like the public teacher profile itself.
  // Cover every historical prefix that profile media has ever been written to,
  // otherwise legacy uploads answer 404 ("Not found or no access") and the
  // player stays black at 0:00.
  const TEACHER_MEDIA_PREFIXES = [
    "content/teacher-intros/",
    "content/teacher-intro/",
    "content/teacher-profiles/",
    "content/teacher-profile/",
    "content/teacher-media/",
    "content/teachers/",
    "content/profiles/",
  ];
  if (TEACHER_MEDIA_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
    // Profile media is intentionally visible to authenticated users. Do not
    // require the teacher_profiles row here: immediately after upload the new
    // URL has not been saved yet, and production profile data may live behind
    // the external mirrored client. That old lookup returned 404 to <video>,
    // producing a black player stuck at 0:00.
    return true;
  }

  // Any asset referenced by a teacher profile row is public-authenticated too.
  {
    const storedUrl = `bstorage://${filePath}`;
    const cdnUrl = `https://${Deno.env.get("BUNNY_STORAGE_CDN_HOSTNAME") || ""}/${filePath}`;
    const { data: profileMedia } = await sb
      .from("teacher_profiles")
      .select("teacher_id")
      .or(
        [
          `video_url.eq.${storedUrl}`,
          `photo_url.eq.${storedUrl}`,
          `cover_image_url.eq.${storedUrl}`,
          `video_url.eq.${cdnUrl}`,
          `photo_url.eq.${cdnUrl}`,
          `cover_image_url.eq.${cdnUrl}`,
        ].join(","),
      )
      .limit(1);
    if (Array.isArray(profileMedia) && profileMedia.length > 0) return true;
  }


  const cdnStoredUrl = `https://${Deno.env.get("BUNNY_STORAGE_CDN_HOSTNAME") || ""}/${filePath}`;
  const { data: contentData, error: contentError } = await sb
    .from("content")
    .select("id")
    .or(
      `file_url.eq.${storedUrl},thumbnail_url.eq.${storedUrl},file_url.eq.${cdnStoredUrl},thumbnail_url.eq.${cdnStoredUrl}`,
    )
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

    // Action: create-upload-session — lightweight handshake used by the client
    // before chunking. It validates auth/path and returns a server-generated id
    // so every later log line can be correlated end-to-end.
    if (action === "create-upload-session") {
      const filePath = sanitizeStoragePath(url.searchParams.get("path"));
      const total = normalizePositiveInt(url.searchParams.get("total"), 20000);
      const size = normalizePositiveInt(url.searchParams.get("size"), 500 * 1024 * 1024);
      if (!filePath || !total || !size) {
        uploadError("session_invalid_parameters", { filePath: Boolean(filePath), total, size });
        return jsonResponse({ error: "Invalid upload session parameters" }, 400);
      }

      let permitted = false;
      if (filePath.startsWith("modrek/")) {
        permitted = await canManageModrek(userClient, userId, claims.email as string | undefined);
      } else if (filePath.startsWith("library/")) {
        permitted = isLibraryPathForUser(filePath, userId);
      } else {
        permitted = await canManageTeacherContent(userClient, userId, claims.email as string | undefined);
      }
      if (!permitted) {
        uploadError("session_forbidden", { filePath, userId });
        return jsonResponse({ error: "Upload permission required" }, 403);
      }

      const uploadId = randomUploadId();
      uploadLog("session_created", { uploadId, filePath, total, size, userId });
      return jsonResponse({ success: true, uploadId, total, size });
    }

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

      if (filePath.startsWith("library/")) {
        uploadError("direct_library_upload_rejected", { filePath, userId });
        return jsonResponse({ error: "Library uploads must use chunked upload" }, 409);
      }

      const contentType = contentTypeFromPath(filePath, req.headers.get("content-type"));
      const contentLength = req.headers.get("content-length");

      // Stream directly to Bunny to avoid buffering large PDFs in memory
      // (Deno.serve request-body limits + OOM risks otherwise fail the upload
      // with an XHR "error" event that surfaces as "cannot connect").
      const uploadHeaders: Record<string, string> = {
        AccessKey: bunnyConfig.apiKey,
        "Content-Type": contentType,
      };
      if (contentLength) uploadHeaders["Content-Length"] = contentLength;

      let uploadRes: Response;
      try {
        uploadRes = await fetch(`https://${bunnyConfig.storageHost}/${bunnyConfig.zone}/${filePath}`, {
          method: "PUT",
          headers: uploadHeaders,
          body: req.body,
          // @ts-ignore Deno fetch supports duplex for streaming request bodies
          duplex: "half",
        });
      } catch (streamErr) {
        console.error("bunny-storage upload stream failed", streamErr);
        // Fallback: buffer then upload (works for smaller files if streaming fails)
        try {
          const buffered = await req.arrayBuffer();
          uploadRes = await fetch(`https://${bunnyConfig.storageHost}/${bunnyConfig.zone}/${filePath}`, {
            method: "PUT",
            headers: { AccessKey: bunnyConfig.apiKey, "Content-Type": contentType },
            body: buffered,
          });
        } catch (bufErr) {
          console.error("bunny-storage upload fallback failed", bufErr);
          return jsonResponse({ error: "Upload proxy failed to reach storage" }, 502);
        }
      }

      if (!uploadRes.ok) {
        const upstreamText = await uploadRes.text().catch(() => "");
        console.error("bunny-storage upload rejected", uploadRes.status, upstreamText.slice(0, 300));
        return new Response(JSON.stringify({ error: `Upload failed [${uploadRes.status}]`, upstream: upstreamText.slice(0, 300) }), {
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

    // Action: upload-chunk — accept a small chunk (≤ ~5MB) and store it at
    // `<basePath>/_chunks/<uploadId>/<index>`. Enables chunked uploads that
    // stay under Supabase's edge-function request-body limit (~10-20MB).
    if (action === "upload-chunk") {
      const basePath = sanitizeStoragePath(url.searchParams.get("path"));
      const uploadId = (url.searchParams.get("uploadId") || "").trim();
      const indexStr = (url.searchParams.get("index") || "").trim();
      if (!basePath || !/^[a-zA-Z0-9_-]{8,64}$/.test(uploadId) || !/^\d{1,5}$/.test(indexStr)) {
        return jsonResponse({ error: "Invalid chunk parameters" }, 400);
      }
      const index = parseInt(indexStr, 10);
      const chunkPath = `${basePath}.parts/${uploadId}/${index.toString().padStart(5, "0")}`;
      const chunkStartedAt = Date.now();

      let permitted = false;
      if (basePath.startsWith("modrek/")) {
        permitted = await canManageModrek(userClient, userId, claims.email as string | undefined);
      } else if (basePath.startsWith("library/")) {
        permitted = isLibraryPathForUser(basePath, userId);
      } else {
        permitted = await canManageTeacherContent(userClient, userId, claims.email as string | undefined);
      }
      if (!permitted) return jsonResponse({ error: "Upload permission required" }, 403);

      uploadLog("chunk_receive_start", { uploadId, basePath, index, userId });
      const buffered = await req.arrayBuffer();
      if (buffered.byteLength === 0) return jsonResponse({ error: "Empty chunk" }, 400);
      if (buffered.byteLength > 8 * 1024 * 1024) {
        return jsonResponse({ error: "Chunk too large (max 8MB)" }, 413);
      }

      const { res: putRes, elapsedMs } = await fetchWithTimeout(`https://${bunnyConfig.storageHost}/${bunnyConfig.zone}/${chunkPath}`, {
        method: "PUT",
        headers: {
          AccessKey: bunnyConfig.apiKey,
          "Content-Type": "application/octet-stream",
          "Content-Length": String(buffered.byteLength),
        },
        body: buffered,
      }, 120_000, "chunk_put");
      if (!putRes.ok) {
        const upstream = await putRes.text().catch(() => "");
        uploadError("chunk_put_rejected", { uploadId, basePath, index, status: putRes.status, upstream: upstream.slice(0, 200), elapsedMs });
        return jsonResponse({ error: `Chunk upload failed [${putRes.status}]` }, 502);
      }
      uploadLog("chunk_stored", { uploadId, basePath, index, bytes: buffered.byteLength, elapsedMs: Date.now() - chunkStartedAt });
      return jsonResponse({ success: true, index, bytes: buffered.byteLength });
    }

    // Action: finalize-upload — stream-concat all previously uploaded chunks
    // from Bunny into the final object, then delete the chunk files. All the
    // heavy data stays server-to-server, so the Supabase gateway body limit
    // does not apply.
    if (action === "finalize-upload") {
      const filePath = sanitizeStoragePath(url.searchParams.get("path"));
      const uploadId = (url.searchParams.get("uploadId") || "").trim();
      const totalStr = (url.searchParams.get("total") || "").trim();
      const expectedSize = normalizePositiveInt(url.searchParams.get("size"), 500 * 1024 * 1024);
      const contentType = contentTypeFromPath(filePath || "", url.searchParams.get("contentType"));
      if (!filePath || !/^[a-zA-Z0-9_-]{8,64}$/.test(uploadId) || !/^\d{1,5}$/.test(totalStr)) {
        return jsonResponse({ error: "Invalid finalize parameters" }, 400);
      }
      const total = parseInt(totalStr, 10);
      if (total < 1 || total > 20000) return jsonResponse({ error: "Invalid chunk count" }, 400);

      let permitted = false;
      if (filePath.startsWith("modrek/")) {
        permitted = await canManageModrek(userClient, userId, claims.email as string | undefined);
      } else if (filePath.startsWith("library/")) {
        permitted = isLibraryPathForUser(filePath, userId);
      } else {
        permitted = await canManageTeacherContent(userClient, userId, claims.email as string | undefined);
      }
      if (!permitted) return jsonResponse({ error: "Upload permission required" }, 403);
      uploadLog("finalize_start", { uploadId, filePath, total, expectedSize, userId });

      const chunkPaths = Array.from({ length: total }, (_, i) =>
        `${filePath}.parts/${uploadId}/${i.toString().padStart(5, "0")}`
      );

      // Sequentially stream each chunk from Bunny into a single ReadableStream
      // and PUT it as the final object. Chunks flow through without buffering
      // the whole file.
      let nextChunkIndex = 0;
      const combined = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const i = nextChunkIndex;
          if (i >= chunkPaths.length) { controller.close(); return; }
          uploadLog("finalize_chunk_read_start", { uploadId, filePath, index: i });
          const { res, elapsedMs } = await fetchWithTimeout(`https://${bunnyConfig.storageHost}/${bunnyConfig.zone}/${chunkPaths[i]}`, {
            headers: { AccessKey: bunnyConfig.apiKey },
          }, 120_000, "finalize_chunk_read");
          if (!res.ok || !res.body) {
            uploadError("finalize_chunk_missing", { uploadId, filePath, index: i, status: res.status, elapsedMs });
            controller.error(new Error(`Missing chunk ${i} [${res.status}]`));
            return;
          }
          const reader = res.body.getReader();
          let bytes = 0;
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) { bytes += value.byteLength; controller.enqueue(value); }
          }
          uploadLog("finalize_chunk_read_complete", { uploadId, filePath, index: i, bytes, elapsedMs });
          nextChunkIndex = i + 1;
        },
      });

      let uploadRes: Response;
      let uploadElapsedMs = 0;
      try {
        const headers: Record<string, string> = { AccessKey: bunnyConfig.apiKey, "Content-Type": contentType };
        if (expectedSize) headers["Content-Length"] = String(expectedSize);
        const result = await fetchWithTimeout(`https://${bunnyConfig.storageHost}/${bunnyConfig.zone}/${filePath}`, {
          method: "PUT",
          headers,
          body: combined,
          // @ts-ignore Deno fetch supports duplex for streaming request bodies
          duplex: "half",
        }, Math.min(900_000, Math.max(180_000, (expectedSize ? Math.ceil(expectedSize / 1024 / 1024) : total * 4) * 15_000)), "finalize_put");
        uploadRes = result.res;
        uploadElapsedMs = result.elapsedMs;
      } catch (e) {
        uploadError("finalize_put_exception", { uploadId, filePath, message: e instanceof Error ? e.message : String(e) });
        return jsonResponse({ error: "Finalize failed to reach storage" }, 502);
      }

      if (!uploadRes.ok) {
        const upstream = await uploadRes.text().catch(() => "");
        uploadError("finalize_put_rejected", { uploadId, filePath, status: uploadRes.status, upstream: upstream.slice(0, 200), elapsedMs: uploadElapsedMs });
        return jsonResponse({ error: `Finalize failed [${uploadRes.status}]` }, uploadRes.status);
      }
      uploadLog("finalize_put_complete", { uploadId, filePath, total, status: uploadRes.status, elapsedMs: uploadElapsedMs });

      if (filePath.toLowerCase().endsWith(".pdf") || contentType.toLowerCase().includes("pdf")) {
        const verification = await verifyFinalPdfObject(bunnyConfig, filePath, expectedSize);
        if (!verification.ok) {
          uploadError("finalize_verify_failed", { uploadId, filePath, ...verification });
          return jsonResponse({
            error: "فشل التحقق من ملف PDF بعد الرفع. الملف النهائي غير مكتمل أو تالف، لذلك لم نبدأ المعالجة.",
            diagnostic: {
              file: "supabase/functions/bunny-storage/index.ts",
              function: "verifyFinalPdfObject",
              line: 64,
              ...verification,
            },
          }, 422);
        }
        uploadLog("finalize_verify_complete", { uploadId, filePath, ...verification });
      } else if (contentType.toLowerCase().startsWith("video/")) {
        const verification = await verifyFinalMediaObject(bunnyConfig, filePath, expectedSize);
        if (!verification.ok) {
          uploadError("finalize_video_verify_failed", { uploadId, filePath, ...verification });
          return jsonResponse({
            error: "فشل التحقق من ملف الفيديو بعد الرفع. لم يتم حفظ رابط لملف مفقود أو غير مكتمل.",
            reason: verification.reason,
          }, 422);
        }
        uploadLog("finalize_video_verify_complete", { uploadId, filePath, ...verification });
      }

      // Best-effort chunk cleanup — do not fail the response if delete fails.
      const cleanup = Promise.allSettled(chunkPaths.map((cp) =>
        fetch(`https://${bunnyConfig.storageHost}/${bunnyConfig.zone}/${cp}`, {
          method: "DELETE",
          headers: { AccessKey: bunnyConfig.apiKey },
        })
      )).catch(() => undefined);
      const edgeRuntime = (globalThis as any).EdgeRuntime;
      if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(cleanup);

      return jsonResponse({
        success: true,
        cdnUrl: `https://${bunnyConfig.cdnHostname}/${filePath}`,
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
        console.error("[bunny-storage:download_denied]", JSON.stringify({ filePath, userId }));
        return jsonResponse({
          error: "Not found or no access",
          reason: "ACCESS_RULE_NO_MATCH",
          detail: "لا توجد قاعدة صلاحية تطابق مسار هذا الملف",
          path: filePath,
          functionVersion: FUNCTION_VERSION,
        }, 404);
      }

      const rangeHeader = req.headers.get("Range");
      const ifNoneMatch = req.headers.get("If-None-Match");
      const upstreamHeaders: Record<string, string> = { AccessKey: bunnyConfig.apiKey };
      if (rangeHeader) upstreamHeaders["Range"] = rangeHeader;
      if (ifNoneMatch) upstreamHeaders["If-None-Match"] = ifNoneMatch;

      // The CDN supports byte ranges natively and is the correct media origin.
      // Prefer it for playback; fall back to the authenticated Storage API if
      // the pull zone has not propagated the new object yet.
      const cdnUrl = `https://${bunnyConfig.cdnHostname}/${filePath}`;
      let storageRes = await fetch(cdnUrl, { headers: rangeHeader ? { Range: rangeHeader } : {} });
      if (!storageRes.ok && storageRes.status !== 206) {
        storageRes = await fetch(`https://${bunnyConfig.storageHost}/${bunnyConfig.zone}/${filePath}`, {
          headers: upstreamHeaders,
        });
      }

      if (storageRes.status === 304) {
        return new Response(null, { status: 304, headers: corsHeaders });
      }
      if (!storageRes.ok && storageRes.status !== 206) {
        console.error("[bunny-storage:upstream_missing]", JSON.stringify({
          filePath,
          userId,
          upstreamStatus: storageRes.status,
        }));
        return new Response(JSON.stringify({
          error: `File not found [${storageRes.status}]`,
          reason: "UPSTREAM_OBJECT_MISSING",
          path: filePath,
          functionVersion: FUNCTION_VERSION,
        }), {
          status: storageRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Modrek-Function-Version": FUNCTION_VERSION },
        });
      }

      const contentType = contentTypeFromPath(filePath, storageRes.headers.get("content-type"));
      const outHeaders: Record<string, string> = {
        ...corsHeaders,
        "X-Modrek-Function-Version": FUNCTION_VERSION,
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

      // Bunny Storage ignores Range on some zones and replies 200 with the full
      // body. Browsers then cannot seek and media stays stuck at 0:00, so we
      // synthesise the 206 slice ourselves for small-enough ranged reads.
      if (rangeHeader && storageRes.status === 200) {
        const match = /bytes=(\d*)-(\d*)/i.exec(rangeHeader);
        const fullBuffer = new Uint8Array(await storageRes.arrayBuffer());
        const size = fullBuffer.byteLength;
        let start = match?.[1] ? parseInt(match[1], 10) : 0;
        let end = match?.[2] ? parseInt(match[2], 10) : size - 1;
        if (!Number.isFinite(start) || start < 0) start = 0;
        if (!Number.isFinite(end) || end >= size) end = size - 1;
        if (start > end) {
          return new Response(null, {
            status: 416,
            headers: { ...outHeaders, "Content-Range": `bytes */${size}` },
          });
        }
        const slice = fullBuffer.slice(start, end + 1);
        return new Response(slice, {
          status: 206,
          headers: {
            ...outHeaders,
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Content-Length": String(slice.byteLength),
          },
        });
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

    return new Response(JSON.stringify({ error: "Unknown action. Use: upload, upload-chunk, finalize-upload, download, delete" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    uploadError("unhandled_exception", { message: error instanceof Error ? error.message : String(error) });
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
