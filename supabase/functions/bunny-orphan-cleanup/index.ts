/**
 * Bunny.net orphan cleanup — admin only.
 *
 * Lists every asset currently on Bunny Stream (video library) and Bunny Storage
 * (top-level folders "content/", "library/", "profiles/") and deletes anything
 * that is NOT referenced by a row in the database. This recovers space when
 * previous teacher/content deletions skipped Bunny cleanup.
 *
 * Request:
 *   POST { dry_run?: boolean }   default: dry_run = true
 * Response:
 *   { stream: { total, referenced, orphans, deleted, failed }, storage: {...}, details: [...] }
 *
 * Also writes a `deletion_audit_logs` row with action_type = "orphan_cleanup".
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type BunnyResult = { kind: "stream" | "storage"; ref: string; ok: boolean; status: number; error?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON        = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "غير مصرح" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "جلسة منتهية" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "صلاحيات غير كافية" }, 403);

    let body: { dry_run?: boolean } = {};
    try { body = await req.json(); } catch { /* body optional */ }
    const dryRun = body.dry_run !== false; // default true — safe

    const streamApiKey  = Deno.env.get("BUNNY_STREAM_API_KEY") || Deno.env.get("BUNNY_API_KEY") || "";
    const streamLibrary = Deno.env.get("BUNNY_STREAM_LIBRARY_ID") || "686928";
    const storageApiKey = Deno.env.get("BUNNY_STORAGE_API_KEY") || "";
    const storageZone   = Deno.env.get("BUNNY_STORAGE_ZONE") || "";
    const storageHost   = Deno.env.get("BUNNY_STORAGE_HOST") || "storage.bunnycdn.com";

    // ── Collect every asset ref referenced by the DB ─────────────────
    const referencedVideoIds = new Set<string>();
    const referencedStoragePaths = new Set<string>();

    const collect = (url: string | null | undefined) => {
      if (!url) return;
      if (url.startsWith("bunny://"))    referencedVideoIds.add(url.slice("bunny://".length));
      if (url.startsWith("bstorage://")) referencedStoragePaths.add(url.slice("bstorage://".length));
    };

    // content
    {
      const { data } = await admin.from("content").select("file_url, thumbnail_url");
      for (const r of data ?? []) { collect(r.file_url); collect(r.thumbnail_url); }
    }
    // library_books
    {
      const { data } = await admin.from("library_books").select("pdf_path, cover_url");
      for (const r of data ?? []) { collect(r.pdf_path); collect(r.cover_url); }
    }
    // storage_assets
    {
      const { data } = await admin.from("storage_assets").select("object_path, storage_provider");
      for (const r of data ?? []) {
        if (r.storage_provider === "bunny" && r.object_path) referencedStoragePaths.add(r.object_path as string);
      }
    }
    // teacher_profiles
    {
      const { data } = await admin.from("teacher_profiles").select("intro_video_url, avatar_url");
      for (const r of data ?? []) { collect(r.intro_video_url); collect(r.avatar_url); }
    }
    // ads / any other Bunny-holding tables can be added later.

    // ── List everything on Bunny Stream ──────────────────────────────
    const streamRefs: string[] = [];
    if (streamApiKey) {
      let page = 1;
      const perPage = 100;
      while (true) {
        const res = await fetch(
          `https://video.bunnycdn.com/library/${streamLibrary}/videos?page=${page}&itemsPerPage=${perPage}`,
          { headers: { AccessKey: streamApiKey, Accept: "application/json" } },
        );
        if (!res.ok) break;
        const j = await res.json().catch(() => null) as { items?: Array<{ guid: string }>; totalItems?: number } | null;
        const items = j?.items ?? [];
        for (const it of items) if (it.guid) streamRefs.push(it.guid);
        if (items.length < perPage) break;
        page += 1;
        if (page > 200) break; // hard safety
      }
    }

    // ── List Bunny Storage recursively (top folders only) ────────────
    const storageRefs: string[] = [];
    const listStorage = async (dir: string): Promise<void> => {
      if (!storageApiKey || !storageZone) return;
      const res = await fetch(`https://${storageHost}/${storageZone}/${dir ? dir + "/" : ""}`, {
        headers: { AccessKey: storageApiKey, Accept: "application/json" },
      });
      if (!res.ok) return;
      const items = await res.json().catch(() => []) as Array<{ ObjectName: string; IsDirectory: boolean; Path?: string }>;
      for (const it of items) {
        const full = (dir ? dir + "/" : "") + it.ObjectName;
        if (it.IsDirectory) await listStorage(full);
        else storageRefs.push(full);
      }
    };
    for (const root of ["content", "library", "profiles", "teachers", "books", "videos"]) {
      try { await listStorage(root); } catch (err) { console.warn("[orphan:list_storage]", root, err); }
    }

    // ── Compute orphans ──────────────────────────────────────────────
    const streamOrphans  = streamRefs.filter((v) => !referencedVideoIds.has(v));
    const storageOrphans = storageRefs.filter((p) => !referencedStoragePaths.has(p));

    const results: BunnyResult[] = [];

    if (!dryRun) {
      const batch = 8;
      for (let i = 0; i < streamOrphans.length; i += batch) {
        const chunk = await Promise.all(streamOrphans.slice(i, i + batch).map(async (id): Promise<BunnyResult> => {
          try {
            const r = await fetch(`https://video.bunnycdn.com/library/${streamLibrary}/videos/${id}`, {
              method: "DELETE",
              headers: { AccessKey: streamApiKey, Accept: "application/json" },
            });
            return { kind: "stream", ref: id, ok: r.ok || r.status === 404, status: r.status };
          } catch (err) {
            return { kind: "stream", ref: id, ok: false, status: 0, error: String(err) };
          }
        }));
        results.push(...chunk);
      }
      for (let i = 0; i < storageOrphans.length; i += batch) {
        const chunk = await Promise.all(storageOrphans.slice(i, i + batch).map(async (p): Promise<BunnyResult> => {
          try {
            const r = await fetch(`https://${storageHost}/${storageZone}/${p}`, {
              method: "DELETE",
              headers: { AccessKey: storageApiKey },
            });
            return { kind: "storage", ref: p, ok: r.ok || r.status === 404, status: r.status };
          } catch (err) {
            return { kind: "storage", ref: p, ok: false, status: 0, error: String(err) };
          }
        }));
        results.push(...chunk);
      }
    }

    const summary = {
      dry_run: dryRun,
      stream: {
        total: streamRefs.length,
        referenced: streamRefs.length - streamOrphans.length,
        orphans: streamOrphans.length,
        deleted: results.filter((r) => r.kind === "stream" && r.ok).length,
        failed: results.filter((r) => r.kind === "stream" && !r.ok).length,
      },
      storage: {
        total: storageRefs.length,
        referenced: storageRefs.length - storageOrphans.length,
        orphans: storageOrphans.length,
        deleted: results.filter((r) => r.kind === "storage" && r.ok).length,
        failed: results.filter((r) => r.kind === "storage" && !r.ok).length,
      },
      orphan_refs: {
        stream: streamOrphans.slice(0, 500),
        storage: storageOrphans.slice(0, 500),
      },
    };

    // Persist audit log
    try {
      const total = results.length;
      const success = results.filter((r) => r.ok).length;
      const failed = total - success;
      await admin.from("deletion_audit_logs").insert({
        actor_id: callerId,
        actor_email: userData.user.email ?? null,
        action_type: "orphan_cleanup",
        target_id: null,
        target_label: dryRun ? "فحص فقط (Dry Run)" : "تنظيف الملفات اليتيمة على Bunny",
        target_meta: summary,
        bunny_total: total,
        bunny_success: success,
        bunny_failed: failed,
        bunny_details: results,
        duration_ms: Date.now() - startedAt,
        status: dryRun ? "success" : (failed > 0 ? "partial" : "success"),
        error: null,
      });
    } catch (err) { console.warn("[orphan:audit]", err); }

    return json({ success: true, ...summary });
  } catch (e) {
    return json({ error: (e as Error).message || "خطأ غير متوقع" }, 500);
  }

  function json(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
