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
const EDGE_FILE = "supabase/functions/library-v2-dispatcher/index.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logEvent(
  db: any,
  bookId: string,
  jobId: string | null,
  eventKey: string,
  message: string,
  level: "info" | "success" | "warning" | "error" = "info",
  progress: number | null = null,
  data: Record<string, unknown> = {},
) {
  try {
    await db.from("library_processing_events").insert({
      book_id: bookId,
      job_id: jobId,
      event_key: eventKey,
      level,
      message,
      progress,
      data: { dispatcher: DISPATCHER_ID, file: EDGE_FILE, ...data },
    });
  } catch (e) {
    console.warn("[library-v2-dispatcher] event log failed", e);
  }
}

async function markDispatchFailure(db: any, job: any, reason: string, details: Record<string, unknown>) {
  const stack = JSON.stringify({ file: EDGE_FILE, function: "invokeWorker", line: 74, reason, details }).slice(0, 6000);
  const nextState = await db.rpc("library_fail_job", {
    p_job_id: job.id,
    p_error: reason.slice(0, 1000),
    p_stack: stack,
    p_backoff_seconds: 20,
  });
  await db.from("library_books").update({
    status: nextState.data === "dead_letter" ? "failed" : "processing",
    processing_stage: `${job.kind}_dispatch_failed`,
    processing_error: `${reason}\nFile: ${EDGE_FILE}\nFunction: invokeWorker\nLine: 74`,
  }).eq("id", job.book_id);
  await logEvent(db, job.book_id, job.id, "dispatcher_worker_invoke_failed", `فشل استدعاء عامل V2 للمهمة ${job.kind}: ${reason}`, "error", null, {
    function: "invokeWorker",
    line: 74,
    kind: job.kind,
    next_state: nextState.data,
    ...details,
  });
}

async function recoverStuckV2Jobs(db: any) {
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: stuck } = await db
    .from("library_processing_jobs")
    .select("id,book_id,kind,attempts,locked_by,locked_at,updated_at")
    .eq("state", "running")
    .like("kind", "v2_%")
    .lt("locked_at", cutoff)
    .limit(25);

  const rows = (stuck as any[]) || [];
  if (!rows.length) return 0;

  await Promise.all(rows.map(async (job) => {
    await db.from("library_processing_jobs").update({
      state: "retry",
      locked_by: null,
      locked_at: null,
      next_run_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: "Recovered stuck V2 job after worker/dispatcher timeout",
      last_stack: `File: ${EDGE_FILE}\nFunction: recoverStuckV2Jobs\nLine: 107`,
    }).eq("id", job.id);
    await logEvent(db, job.book_id, job.id, "v2_stuck_job_recovered", "تمت إعادة مهمة V2 عالقة إلى الطابور تلقائياً", "warning", null, {
      function: "recoverStuckV2Jobs",
      line: 107,
      kind: job.kind,
      previous_locked_by: job.locked_by,
      previous_locked_at: job.locked_at,
      previous_updated_at: job.updated_at,
      attempts: job.attempts,
    });
  }));
  return rows.length;
}

async function invokeWorker(jobId: string, bookId: string, kind: string) {
  // Wait for the worker response. A short fire-and-forget timeout was the
  // reason large PDFs stayed at v2_splitting: the HTTP client aborted while
  // the worker was still parsing/downloading, leaving the job locked as running.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 150_000);
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
    const text = typeof (res as any).text === "function" ? await (res as Response).text().catch(() => "") : "";
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    const workerOk = Boolean((res as any).ok && (payload?.ok ?? true));
    return {
      ok: workerOk,
      http_ok: Boolean((res as any).ok),
      status: (res as any).status,
      statusText: (res as any).statusText || null,
      worker_failed: Boolean((res as any).ok && payload?.ok === false),
      error: payload?.error || (res as any).statusText || null,
      body: text.slice(0, 1000),
    };
  } catch (e) {
    return { ok: false, status: 0, error: String((e as any)?.message || e) };
  }
}

async function tick(): Promise<{ claimed: number; dispatched: number; recovered: number; errors: string[] }> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const errors: string[] = [];
  const recovered = await recoverStuckV2Jobs(admin);

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
  if (error) return { claimed: 0, dispatched: 0, recovered, errors: [error.message] };

  const list = (jobs as any[]) || [];
  let dispatched = 0;
  await Promise.all(
    list.map(async (j) => {
      await logEvent(admin, j.book_id, j.id, "dispatcher_worker_invoke_started", `بدأ استدعاء عامل V2 للمهمة ${j.kind}`, "info", null, {
        function: "tick",
        line: 165,
        kind: j.kind,
        attempts: j.attempts,
      });
      const r = await invokeWorker(j.id, j.book_id, j.kind);
      if (r.ok) dispatched++;
      else {
        const reason = r.worker_failed
          ? `worker_stage_failed:${r.error || "unknown_error"}`
          : `worker_invoke_failed:${r.status}:${r.error || r.statusText || "unknown_error"}`;
        errors.push(`job ${j.id} (${j.kind}): ${reason}`);
        if (!r.worker_failed) await markDispatchFailure(admin, j, reason, r as Record<string, unknown>);
        else await logEvent(admin, j.book_id, j.id, "dispatcher_worker_stage_failed", `العامل وصل لكن المرحلة فشلت: ${j.kind}`, "error", null, {
          function: "tick",
          line: 181,
          kind: j.kind,
          worker_response: r,
        });
      }
    }),
  );

  if (list.length > 0) {
    await admin.from("library_processing_events").insert(
      list.map((j: any) => ({
        book_id: j.book_id,
        job_id: j.id,
        event_key: errors.some((err) => err.includes(j.id)) ? "dispatcher_claimed_with_error" : "dispatcher_claimed",
        level: errors.some((err) => err.includes(j.id)) ? "warning" : "info",
        message: errors.some((err) => err.includes(j.id))
          ? `تم استلام ${j.kind} لكن العامل أبلغ بخطأ؛ راجع الحدث التفصيلي السابق`
          : `Dispatcher ${DISPATCHER_ID} claimed job ${j.kind}`,
        data: { dispatcher: DISPATCHER_ID, file: EDGE_FILE, function: "tick", line: 197, kind: j.kind, attempts: j.attempts, errors: errors.filter((err) => err.includes(j.id)) },
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
    const t = setTimeout(() => controller.abort(), 150_000);
    const legacyRes = await fetch(`${SUPABASE_URL}/functions/v1/library-worker`, {
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
    if (legacyRes && !legacyRes.ok && list[0]?.book_id) {
      await logEvent(admin, list[0].book_id, null, "legacy_worker_kick_failed", "فشل تشغيل عامل الصفحات القديم من موزع V2", "warning", null, {
        function: "tick",
        line: 224,
        status: legacyRes.status,
        body: (await legacyRes.text().catch(() => "")).slice(0, 500),
      });
    }
  } catch (e) {
    if (list[0]?.book_id) {
      await logEvent(admin, list[0].book_id, null, "legacy_worker_kick_exception", "تعذر تشغيل عامل الصفحات القديم من موزع V2", "warning", null, {
        function: "tick",
        line: 234,
        error: String((e as any)?.message || e),
      });
    }
  }

  return { claimed: list.length, dispatched, recovered, errors };
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
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const workerKey = (req.headers.get("x-worker-key") || "").trim();
    const allowed = bearer === SERVICE_KEY || (!!WORKER_KEY.trim() && workerKey === WORKER_KEY.trim());
    if (!allowed) {
      return json({ ok: false, error: "unauthorized_dispatcher" }, 401);
    }

    const result = await tick();
    return json({ ok: true, dispatcher_id: DISPATCHER_ID, ...result });
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
