// Library Pipeline v2 — Dispatcher (deploy: 2026-07-19 force production redeploy #2)
// -------------------------------------------------------------------
// Single responsibility: pick the next ready job and hand it to the
// v2 worker. Never runs stage logic itself. Runs via Deno.cron every
// minute (Supabase Edge Runtime) AND accepts manual pokes over HTTP
// so admin actions can trigger an immediate dispatch.
//
// Guarantees:
//   - One HTTP invocation ⇒ up to N jobs claimed, each dispatched
//     to library-v2-worker as an independent fire-and-forget call.
//   - Never blocks on stage execution ⇒ can't time out.
//   - Uses library_claim_next_job (SKIP LOCKED) so parallel
//     dispatchers never grab the same job.
// -------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-library-trace-id, x-worker-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_KEY = Deno.env.get("LIBRARY_WORKER_KEY") || "";
const DISPATCHER_ID = `dispatcher_${crypto.randomUUID().slice(0, 8)}`;
const MAX_CLAIM = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function invokeWorker(jobId: string, bookId: string, kind: string) {
  // Fire-and-forget: don't await the worker's full run — the worker will
  // update the job row on completion or failure. We only need HTTP to leave.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/library-v2-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "x-worker-key": WORKER_KEY,
      },
      body: JSON.stringify({ job_id: jobId, book_id: bookId, kind, dispatcher: DISPATCHER_ID }),
      signal: controller.signal,
    }).catch((e) => ({ ok: false, status: 0, statusText: String(e?.message || e) } as any));
    clearTimeout(timeout);
    return { ok: (res as any).ok, status: (res as any).status, statusText: (res as any).statusText || null };
  } catch (e) {
    return { ok: false, status: 0, error: String((e as any)?.message || e) };
  }
}

async function tick(): Promise<{ claimed: number; dispatched: number; errors: string[] }> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const errors: string[] = [];

  const { data: jobs, error } = await admin.rpc("library_claim_next_job", {
    p_worker_id: DISPATCHER_ID,
    p_kinds: [
      "v2_extract_pages",
      "v2_extract_text",
      "v2_chunk_embed",
      "v2_build_index",
      "v2_generate_explanations",
      "v2_generate_tts",
      "v2_generate_quiz",
      "v2_finalize",
    ],
    p_limit: MAX_CLAIM,
  });
  if (error) return { claimed: 0, dispatched: 0, errors: [error.message] };

  const list = (jobs as any[]) || [];
  let dispatched = 0;
  await Promise.all(
    list.map(async (j) => {
      const r = await invokeWorker(j.id, j.book_id, j.kind);
      if (r.ok) dispatched++;
      else errors.push(`job ${j.id} (${j.kind}): status ${r.status}`);
    }),
  );

  if (list.length > 0) {
    await admin.from("library_processing_events").insert(
      list.map((j: any) => ({
        book_id: j.book_id,
        job_id: j.id,
        event_key: errors.some((err) => err.includes(j.id)) ? "dispatcher_worker_invoke_failed" : "dispatcher_claimed",
        level: errors.some((err) => err.includes(j.id)) ? "error" : "info",
        message: errors.some((err) => err.includes(j.id))
          ? `فشل استدعاء عامل V2 للمهمة ${j.kind}`
          : `Dispatcher ${DISPATCHER_ID} claimed job ${j.kind}`,
        data: { dispatcher: DISPATCHER_ID, kind: j.kind, attempts: j.attempts, errors: errors.filter((err) => err.includes(j.id)) },
      })),
    );
  }

  // Also nudge the legacy worker so fan-out kinds (extract_page, embed_book,
  // build_index, generate_explanations, generate_quiz) get picked up.
  const { data: legacyPending } = await admin
    .from("library_processing_jobs")
    .select("id", { count: "exact", head: true })
    .in("state", ["queued", "retry"])
    .in("kind", ["extract_page", "embed_book", "build_index", "generate_explanations", "generate_quiz", "extract_book"]);
  const legacyCount = (legacyPending as any)?.length ?? 0;
  // head:true returns no rows but .count via response; simplest: fire ping unconditionally when we claimed nothing OR when legacy jobs exist
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3_000);
    await fetch(`${SUPABASE_URL}/functions/v1/library-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "x-worker-key": WORKER_KEY,
      },
      body: JSON.stringify({ source: "v2-dispatcher", dispatcher: DISPATCHER_ID }),
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(t);
  } catch (_e) { /* fire-and-forget */ }

  return { claimed: list.length, dispatched, errors };
}

// Deno.cron — runs on the edge runtime as long as one instance is warm.
// This is a best-effort scheduler; the HTTP endpoint below is the reliable
// trigger (called by admin actions and by an external ping if configured).
try {
  // @ts-ignore Deno.cron is available in Supabase Edge Runtime
  Deno.cron?.("library-v2-tick", "* * * * *", async () => {
    try {
      const r = await tick();
      console.log("[library-v2-dispatcher] cron tick", r);
    } catch (e) {
      console.error("[library-v2-dispatcher] cron error", e);
    }
  });
} catch (_e) {
  // Deno.cron not available in this runtime — HTTP polling remains available.
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const result = await tick();
    return json({ ok: true, dispatcher_id: DISPATCHER_ID, ...result });
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
