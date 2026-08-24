// deno-lint-ignore-file no-explicit-any
// Registers a Modrek library asset AFTER the client has streamed the file
// to Bunny Storage via the bunny-storage edge function. Handles sha256
// dedup, links the asset to the version, and enqueues the detect stage.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { getJwtClaimsFromAuthHeader } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUNNY_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE") || "";
const BUNNY_STORAGE_HOST = Deno.env.get("BUNNY_STORAGE_HOST") || "storage.bunnycdn.com";
const BUNNY_API_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY") || "";
const BUCKET_LABEL = `bunny:${BUNNY_ZONE || "modrek"}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const claims = await getJwtClaimsFromAuthHeader(req.headers.get("Authorization"));
    if (!claims?.sub) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    // Authorization is role-based only (no hardcoded email backdoors).
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", claims.sub);
    if (!roles?.some((r: any) => r.role === "admin")) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const versionId = String(body.version_id ?? "");
    const bunnyPath = String(body.bunny_path ?? body.path ?? "").replace(/^\/+/, "");
    const filename = String(body.filename ?? "file");
    const mime = String(body.mime ?? "application/octet-stream");
    const byteSize = Number(body.size ?? 0);
    const sha = String(body.sha256 ?? "").toLowerCase();

    if (!versionId) return json({ error: "version_id required" }, 400);
    if (!sha || sha.length !== 64) return json({ error: "valid sha256 required" }, 400);
    if (!bunnyPath.startsWith("modrek/")) return json({ error: "bunny_path must start with modrek/" }, 400);

    const { data: version } = await admin
      .from("knowledge_source_versions").select("id, source_id").eq("id", versionId).maybeSingle();
    if (!version) return json({ error: "version not found" }, 404);

    // Verify when possible, but never fail registration solely because the
    // storage API refuses HEAD/verification. The upload proxy already returned
    // success before this function is called; a false negative here was leaving
    // valid files marked as failed in the library UI.
    if (BUNNY_API_KEY && BUNNY_ZONE) {
      let ok = false;
      let status = 0;
      for (let attempt = 0; attempt < 5; attempt++) {
        const headRes = await fetch(`https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${bunnyPath}`, {
          method: "HEAD",
          headers: { AccessKey: BUNNY_API_KEY },
        });
        status = headRes.status;
        if (headRes.ok) { ok = true; break; }
        if (status === 405 || status === 403) {
          const getRes = await fetch(`https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${bunnyPath}`, {
            method: "GET",
            headers: { AccessKey: BUNNY_API_KEY, Range: "bytes=0-0" },
          });
          status = getRes.status;
          if (getRes.ok || status === 206) { ok = true; break; }
        }
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
      if (!ok) {
        console.warn(`bunny verification skipped after status ${status} for ${bunnyPath}`);
      }
    }

    // Dedup by sha256
    let assetId: string;
    const existing = await admin.from("storage_assets").select("id, storage_provider, object_path")
      .eq("sha256", sha).maybeSingle();
    if (existing.data?.id) {
      assetId = existing.data.id;
    } else {
      const ins = await admin.from("storage_assets").insert({
        sha256: sha,
        storage_provider: "bunny",
        bucket: BUCKET_LABEL,
        object_path: bunnyPath,
        mime_type: mime,
        byte_size: byteSize,
        original_filename: filename,
        uploaded_by: claims.sub,
        metadata: { zone: BUNNY_ZONE, host: BUNNY_STORAGE_HOST },
      }).select("id").single();
      if (ins.error) return json({ error: ins.error.message }, 500);
      assetId = ins.data.id;
    }

    const existingLink = await admin
      .from("knowledge_source_assets")
      .select("id")
      .eq("version_id", version.id)
      .eq("asset_id", assetId)
      .eq("role", "original")
      .maybeSingle();
    if (!existingLink.data?.id) {
      const link = await admin.from("knowledge_source_assets").insert({
        source_id: version.source_id, version_id: version.id, asset_id: assetId, role: "original", ordinal: 0,
      });
      if (link.error) return json({ error: link.error.message }, 500);
    }

    await admin.from("knowledge_source_versions").update({
      pipeline_stage: "queued", progress_pct: 5,
      pipeline_started_at: new Date().toISOString(), error_message: null,
    }).eq("id", version.id);
    await admin.from("knowledge_sources").update({ status: "processing" }).eq("id", version.source_id);

    const { data: jobId } = await admin.rpc("modrek_enqueue_stage", {
      p_version_id: version.id, p_kind: "detect", p_stage_order: 10,
      p_input: { asset_id: assetId, mime, filename },
      p_asset_id: assetId,
    });

    scheduleWorker();

    return json({ ok: true, asset_id: assetId, job_id: jobId, provider: "bunny", bunny_path: bunnyPath });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function scheduleWorker() {
  const run = fetch(`${SUPABASE_URL}/functions/v1/modrek-worker`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: "{}",
  }).catch((e) => console.warn("modrek worker dispatch failed", e?.message ?? e));
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(run);
}
