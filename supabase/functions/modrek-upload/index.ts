// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { getJwtClaimsFromAuthHeader } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "modrek-library";

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const claims = getJwtClaimsFromAuthHeader(req.headers.get("Authorization"));
    if (!claims?.sub) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    // verify admin
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", claims.sub);
    if (!roles?.some((r: any) => r.role === "admin")) return json({ error: "forbidden" }, 403);

    const contentType = req.headers.get("content-type") || "";
    let versionId = "";
    let mime = "application/octet-stream";
    let filename = "file";
    let path = "";
    let sha = "";
    let byteSize = 0;
    let bytes: ArrayBuffer | null = null;

    if (contentType.includes("application/json")) {
      const body = await req.json();
      versionId = String(body.version_id ?? "");
      path = String(body.path ?? "");
      filename = String(body.filename ?? "file");
      mime = String(body.mime ?? "application/octet-stream");
      byteSize = Number(body.size ?? 0);
      sha = String(body.sha256 ?? "");
      if (!versionId || !path || !sha) return json({ error: "version_id, path, sha256 required" }, 400);
    } else {
      const form = await req.formData();
      versionId = String(form.get("version_id") ?? "");
      const file = form.get("file") as File | null;
      if (!versionId || !file) return json({ error: "version_id and file are required" }, 400);
      bytes = await file.arrayBuffer();
      sha = await sha256Hex(bytes);
      mime = file.type || "application/octet-stream";
      filename = file.name;
      byteSize = bytes.byteLength;
    }

    const { data: version } = await admin
      .from("knowledge_source_versions").select("id, source_id").eq("id", versionId).maybeSingle();
    if (!version) return json({ error: "version not found" }, 404);

    if (bytes) {
      path = `sources/${version.source_id}/versions/${version.id}/${sha}/${filename}`;
      const up = await admin.storage.from(BUCKET).upload(path, new Uint8Array(bytes), {
        contentType: mime, upsert: true,
      });
      if (up.error) return json({ error: up.error.message }, 500);
    } else {
      // client already uploaded via signed URL; verify object exists
      const head = await admin.storage.from(BUCKET).createSignedUrl(path, 30);
      if (head.error) return json({ error: `uploaded object not found: ${head.error.message}` }, 400);
    }


    // storage_assets (dedup by sha)
    let assetId: string;
    const existing = await admin.from("storage_assets").select("id").eq("sha256", sha).maybeSingle();
    if (existing.data?.id) {
      assetId = existing.data.id;
    } else {
      const ins = await admin.from("storage_assets").insert({
        sha256: sha, storage_provider: "supabase", bucket: BUCKET, object_path: path,
        mime_type: mime, byte_size: byteSize, original_filename: filename,
        uploaded_by: claims.sub,
      }).select("id").single();
      if (ins.error) return json({ error: ins.error.message }, 500);
      assetId = ins.data.id;
    }

    // link asset to version
    await admin.from("knowledge_source_assets").insert({
      source_id: version.source_id, version_id: version.id, asset_id: assetId, role: "original", ordinal: 0,
    });

    // move version to queued + create detect job
    await admin.from("knowledge_source_versions").update({
      pipeline_stage: "queued", progress_pct: 5, pipeline_started_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", version.id);
    await admin.from("knowledge_sources").update({ status: "processing" }).eq("id", version.source_id);

    const { data: jobId } = await admin.rpc("modrek_enqueue_stage", {
      p_version_id: version.id, p_kind: "detect", p_stage_order: 10,
      p_input: { asset_id: assetId, mime, filename },
      p_asset_id: assetId,
    });


    return json({ ok: true, asset_id: assetId, job_id: jobId });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
