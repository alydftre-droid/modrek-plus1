// Library Admin — CRUD, dashboard stats, upload session helpers.
// Developer-only. Verifies caller has admin role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Immediately trigger the library-worker function so admins see progress
// without waiting for the next pg_cron tick (which runs every minute).
async function kickWorker(): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/library-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      body: "{}",
    });
    return { ok: resp.ok, status: resp.status };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { error: json({ error: "unauthorized" }, 401) };
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return { error: json({ error: "unauthorized" }, 401) };
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  const isAdmin = (roles ?? []).some((r) => r.role === "admin");
  if (!isAdmin) return { error: json({ error: "forbidden" }, 403) };
  return { user: userData.user, admin };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireAdmin(req);
  if ("error" in gate) return gate.error;
  const { admin, user } = gate;

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "stats";

  try {
    switch (action) {
      case "stats": {
        const [{ count: booksTotal }, { count: booksReady }, { count: booksProcessing }, { count: booksFailed }, { data: recent }] = await Promise.all([
          admin.from("library_books").select("id", { count: "exact", head: true }),
          admin.from("library_books").select("id", { count: "exact", head: true }).eq("status", "ready"),
          admin.from("library_books").select("id", { count: "exact", head: true }).in("status", ["uploading", "processing"]),
          admin.from("library_books").select("id", { count: "exact", head: true }).eq("status", "failed"),
          admin.from("library_books").select("id,title,status,cover_url,subject_name_ar,page_count,created_at").order("created_at", { ascending: false }).limit(10),
        ]);
        // (pages count is derived below from allBooks; skip optional RPC)
        const { data: allBooks } = await admin.from("library_books").select("file_size,page_count,subject_id,stage_id");
        const totalPages = (allBooks ?? []).reduce((s, b: any) => s + (b.page_count || 0), 0);
        const totalBytes = (allBooks ?? []).reduce((s, b: any) => s + Number(b.file_size || 0), 0);
        const subjectsCount = new Set((allBooks ?? []).map((b: any) => b.subject_id).filter(Boolean)).size;
        const stagesCount = new Set((allBooks ?? []).map((b: any) => b.stage_id).filter(Boolean)).size;
        const { count: audioCount } = await admin.from("library_section_explanations").select("id", { count: "exact", head: true }).not("audio_path", "is", null);

        return json({
          totals: {
            books: booksTotal || 0,
            pages: totalPages,
            subjects: subjectsCount,
            stages: stagesCount,
            ready: booksReady || 0,
            processing: booksProcessing || 0,
            failed: booksFailed || 0,
            audioClips: audioCount || 0,
            storageBytes: totalBytes,
          },
          recent: recent || [],
        });
      }

      case "list": {
        const status = url.searchParams.get("status");
        let q = admin.from("library_books").select("*").order("created_at", { ascending: false }).limit(200);
        if (status) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) throw error;
        return json({ books: data ?? [] });
      }

      case "get": {
        const id = url.searchParams.get("id");
        if (!id) return json({ error: "id required" }, 400);
        const { data, error } = await admin.from("library_books").select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        return json({ book: data });
      }

      case "create": {
        const body = await req.json().catch(() => ({}));
        const insertData: any = {
          title: String(body.title || "بدون عنوان").slice(0, 300),
          description: body.description ? String(body.description).slice(0, 2000) : null,
          education_type: ["عام", "أزهر", "both"].includes(body.education_type) ? body.education_type : "عام",
          stage_id: body.stage_id || null,
          grade_id: body.grade_id || null,
          section_id: body.section_id || null,
          track_id: body.track_id || null,
          subject_id: body.subject_id || null,
          subject_name_ar: body.subject_name_ar || null,
          access_tier: ["free", "premium", "vip"].includes(body.access_tier) ? body.access_tier : "free",
          status: "draft",
          created_by: user.id,
        };
        const { data, error } = await admin.from("library_books").insert(insertData).select().single();
        if (error) throw error;
        return json({ book: data });
      }

      case "update": {
        const body = await req.json().catch(() => ({}));
        const { id, ...patch } = body || {};
        if (!id) return json({ error: "id required" }, 400);
        const allowed = ["title", "description", "cover_url", "pdf_path", "education_type", "stage_id", "grade_id", "section_id", "track_id", "subject_id", "subject_name_ar", "page_count", "file_size", "status", "processing_progress", "processing_stage", "processing_error", "access_tier", "published_at"];
        const clean: Record<string, unknown> = {};
        for (const k of allowed) if (k in patch) clean[k] = (patch as any)[k];
        const { data, error } = await admin.from("library_books").update(clean).eq("id", id).select().single();
        if (error) throw error;
        return json({ book: data });
      }

      case "publish": {
        // Enqueue background processing. The library-worker will parse the PDF,
        // extract per-page text, save sections, and flip status to 'ready' on
        // completion. Progress is tracked in library_books.processing_progress
        // and per-job rows in library_processing_jobs.
        const body = await req.json().catch(() => ({}));
        const id = body.id;
        if (!id) return json({ error: "id required" }, 400);
        const { data: jobId, error: eErr } = await admin.rpc("enqueue_library_book_processing", { _book_id: id });
        if (eErr) throw eErr;
        // Kick the worker immediately so the user sees progress without waiting for the next cron tick.
        void kickWorker().catch(() => undefined);
        const { data: book } = await admin.from("library_books").select("*").eq("id", id).maybeSingle();
        return json({ book, job_id: jobId });
      }

      case "retry_book": {
        const body = await req.json().catch(() => ({}));
        const id = body.id;
        if (!id) return json({ error: "id required" }, 400);
        // Wipe extracted content so the fresh run rebuilds everything.
        await admin.from("library_book_sections").delete().eq("book_id", id);
        await admin.from("library_book_pages").delete().eq("book_id", id);
        await admin.from("library_processing_jobs").delete().eq("book_id", id);
        const { data: jobId, error: eErr } = await admin.rpc("enqueue_library_book_processing", { _book_id: id });
        if (eErr) throw eErr;
        void kickWorker().catch(() => undefined);
        return json({ ok: true, job_id: jobId });
      }

      case "retry_page": {
        const body = await req.json().catch(() => ({}));
        const bookId = body.book_id;
        const pageNumber = Number(body.page_number || 0);
        if (!bookId || !pageNumber) return json({ error: "book_id and page_number required" }, 400);
        // Insert or replace a single-page job.
        await admin
          .from("library_processing_jobs")
          .delete()
          .eq("book_id", bookId)
          .eq("kind", "extract_page")
          .eq("page_number", pageNumber);
        const { data: job, error: jErr } = await admin
          .from("library_processing_jobs")
          .insert({
            book_id: bookId,
            kind: "extract_page",
            page_number: pageNumber,
            stage: "extract_page",
            state: "queued",
          })
          .select()
          .single();
        if (jErr) throw jErr;
        void kickWorker().catch(() => undefined);
        return json({ ok: true, job });
      }

      case "book_progress": {
        const id = url.searchParams.get("id");
        if (!id) return json({ error: "id required" }, 400);
        const [{ data: book }, { data: jobs }, { count: pagesCount }] = await Promise.all([
          admin.from("library_books").select("*").eq("id", id).maybeSingle(),
          admin
            .from("library_processing_jobs")
            .select("*")
            .eq("book_id", id)
            .order("created_at", { ascending: false })
            .limit(50),
          admin
            .from("library_book_pages")
            .select("id", { count: "exact", head: true })
            .eq("book_id", id),
        ]);
        return json({
          book,
          jobs: jobs ?? [],
          pages_done: pagesCount ?? 0,
          pages_total: book?.page_count ?? 0,
        });
      }

      case "worker_tick": {
        const r = await kickWorker();
        return json({ ok: true, result: r });
      }

      case "hide":
      case "pause":
      case "resume": {
        const body = await req.json().catch(() => ({}));
        const id = body.id;
        if (!id) return json({ error: "id required" }, 400);
        const nextStatus = action === "hide" ? "hidden" : action === "pause" ? "paused" : "ready";
        const { data, error } = await admin.from("library_books").update({ status: nextStatus }).eq("id", id).select().single();
        if (error) throw error;
        return json({ book: data });
      }

      case "delete": {
        const body = await req.json().catch(() => ({}));
        const id = body.id;
        if (!id) return json({ error: "id required" }, 400);
        const { error } = await admin.from("library_books").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "taxonomy": {
        // Returns full picker data for the wizard.
        const [{ data: stages }, { data: grades }, { data: sections }, { data: tracks }, { data: subjects }] = await Promise.all([
          admin.from("library_stages").select("id,code,name_ar,sort_order").eq("is_active", true).order("sort_order"),
          admin.from("library_grades").select("id,stage_id,code,name_ar,sort_order").eq("is_active", true).order("sort_order"),
          admin.from("library_sections").select("id,code,name_ar,sort_order").eq("is_active", true).order("sort_order"),
          admin.from("library_tracks").select("id,code,name_ar,sort_order").eq("is_active", true).order("sort_order"),
          admin.from("library_subjects").select("id,code,name_ar,stage_id,grade_id,section_id,curriculum_track,source_category,sort_order").eq("is_active", true).order("sort_order"),
        ]);
        return json({ stages: stages ?? [], grades: grades ?? [], sections: sections ?? [], tracks: tracks ?? [], subjects: subjects ?? [] });
      }

      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error("library-admin error", err);
    return json({ error: String(err?.message || err) }, 500);
  }
});
