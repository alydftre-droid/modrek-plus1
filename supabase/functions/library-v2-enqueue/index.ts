// Library v2 — Enqueue entry point
// Called by admin UI right after a book is uploaded. Creates the root
// v2_extract_pages job for a book and pings the dispatcher immediately.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_KEY = Deno.env.get("LIBRARY_WORKER_KEY") || "";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const bookId: string | null = body?.book_id || null;
    if (!bookId) return json({ error: "book_id_required" }, 400);

    // Verify caller is an authenticated admin OR bears the service key
    const auth = req.headers.get("Authorization") || "";
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    let isAdmin = auth.includes(SERVICE_KEY);
    if (!isAdmin) {
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
        global: { headers: { Authorization: auth } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: role } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
        isAdmin = !!role;
      }
    }
    if (!isAdmin) return json({ error: "unauthorized" }, 401);

    // Idempotent: if a root v2_extract_pages job already exists in queued/retry/running, reuse it
    const { data: existing } = await admin
      .from("library_processing_jobs")
      .select("id,state")
      .eq("book_id", bookId)
      .eq("kind", "v2_extract_pages")
      .in("state", ["queued", "retry", "running", "completed"])
      .maybeSingle();

    let jobId: string;
    if (existing) {
      jobId = existing.id;
      // If completed, don't restart — but if queued/retry, we still ping
    } else {
      const { data, error } = await admin.from("library_processing_jobs").insert({
        book_id: bookId,
        kind: "v2_extract_pages",
        stage: "extract_pages",
        state: "queued",
        priority: 50,
        next_run_at: new Date().toISOString(),
        payload: { source: "admin_upload" },
      }).select("id").single();
      if (error) return json({ error: "enqueue_failed", details: error.message }, 500);
      jobId = data.id;
    }

    await admin.from("library_books").update({
      status: "processing",
      processing_stage: "v2_queued",
      processing_progress: 1,
      processing_error: null,
    }).eq("id", bookId);

    await admin.from("library_processing_events").insert({
      book_id: bookId,
      job_id: jobId,
      event_key: "v2_pipeline_enqueued",
      level: "info",
      message: "تم إدراج الكتاب في خط المعالجة الجديد v2",
      progress: 1,
      data: { root_job: jobId },
    });

    // Kick the dispatcher immediately (fire-and-forget)
    fetch(`${SUPABASE_URL}/functions/v1/library-v2-dispatcher`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "x-worker-key": WORKER_KEY,
        "Content-Type": "application/json",
      },
      body: "{}",
    }).catch(() => null);

    return json({ ok: true, job_id: jobId, book_id: bookId });
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
