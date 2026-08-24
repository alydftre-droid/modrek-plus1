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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const claims = await getJwtClaimsFromAuthHeader(req.headers.get("Authorization"));
    if (!claims?.sub) return json({ error: "unauthorized" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    // Authorization is role-based only (no hardcoded email backdoors).
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", claims.sub);
    if (!roles?.some((r: any) => r.role === "admin")) return json({ error: "forbidden" }, 403);

    const { job_id, version_id, from_stage } = await req.json();
    if (job_id) {
      await admin.from("processing_jobs").update({
        status: "pending", error: null, attempts: 0, next_run_at: new Date().toISOString(),
        started_at: null, finished_at: null, progress_pct: 0,
      }).eq("id", job_id);
      scheduleWorker();
      return json({ ok: true, retried: job_id });
    }
    if (version_id && from_stage) {
      const stageMap: Record<string, number> = {
        detect: 10, extract_text: 20, ocr: 20, structure: 30, chunk: 40, embed: 50, index: 60,
      };
      const { data: v } = await admin.from("knowledge_source_versions")
        .select("id, source_id").eq("id", version_id).single();
      if (!v) return json({ error: "version not found" }, 404);
      const asset = await admin.from("knowledge_source_assets")
        .select("asset_id").eq("version_id", version_id).eq("role", "original").maybeSingle();
      await admin.rpc("modrek_enqueue_stage", {
        p_version_id: version_id, p_kind: from_stage, p_stage_order: stageMap[from_stage] ?? 10,
        p_input: {}, p_asset_id: asset.data?.asset_id ?? null,
      });
      await admin.from("knowledge_source_versions").update({
        pipeline_stage: "queued", error_message: null,
      }).eq("id", version_id);
      scheduleWorker();
      return json({ ok: true, restarted: from_stage });
    }
    return json({ error: "job_id or (version_id, from_stage) required" }, 400);
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
  }).catch((e) => console.warn("modrek retry worker dispatch failed", e?.message ?? e));
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(run);
}
