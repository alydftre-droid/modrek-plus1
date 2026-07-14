// Diagnostic + migration edge function for project B (qteuqfntsocsdbjmdvmr).
// Runs on project A. Uses EXTERNAL_SUPABASE_DB_URL (service-level connection)
// to inspect and (on demand) migrate the missing library book infrastructure
// onto project B. No arbitrary SQL from callers — only predefined actions.
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";
import { MIGRATION_SQL } from "./migration.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-action, x-confirm",
};

const DB_URL = Deno.env.get("EXTERNAL_SUPABASE_DB_URL") || "";

function pg() {
  return postgres(DB_URL, { max: 1, prepare: false, ssl: "require" });
}

async function preflight() {
  const sql = pg();
  try {
    return {
      current_db: await sql`select current_database() as db`,
      extensions: await sql`select extname from pg_extension where extname in ('vector','pgcrypto','uuid-ossp')`,
      helper_functions: await sql`select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('update_updated_at_column','touch_library_conv_updated_at','library_jobs_touch_updated_at','has_role')`,
      app_role_enum: await sql`select typname from pg_type where typname='app_role'`,
      core_tables: await sql`select table_name from information_schema.tables where table_schema='public' and table_name in ('profiles','user_roles','library_stages','library_grades','library_sections','library_subjects','library_sub_subjects','library_tracks')`,
      book_tables_present: await sql`
        select table_name from information_schema.tables
        where table_schema='public' and table_name = any(${[
          'library_books','library_book_pages','library_book_chunks','library_book_sections',
          'library_book_index','library_book_conversations','library_conversation_messages',
          'library_generated_quizzes','library_processing_jobs','library_access_tiers',
          'library_recommendations','library_section_explanations','library_student_book_progress',
          'library_student_memory','library_student_weaknesses'
        ]})
        order by table_name`,
      library_books_count: await sql`select count(*)::int as c from information_schema.tables where table_schema='public' and table_name='library_books'`
        .then(async (r) => r[0].c > 0 ? (await sql`select count(*)::int as c from public.library_books`)[0].c : null),
    };
  } finally { await sql.end({ timeout: 5 }); }
}

async function migrate() {
  const sql = pg();
  try {
    // Run entire migration in a single transaction
    await sql.unsafe(`BEGIN;\n${MIGRATION_SQL}\nCOMMIT;`);
    // Reload PostgREST schema cache so the new tables are immediately visible via REST
    await sql.unsafe(`NOTIFY pgrst, 'reload schema';`);
    // Verify
    const present = await sql`
      select table_name from information_schema.tables
      where table_schema='public' and (table_name like 'library_%book%' or table_name like 'library_%')
      order by table_name`;
    return { ok: true, tables_after: present };
  } catch (e) {
    try { await sql`ROLLBACK`; } catch { /* ignore */ }
    throw e;
  } finally { await sql.end({ timeout: 10 }); }
}

async function harden() {
  const sql = pg();
  try {
    // Tighten grants on the 15 new tables. Project B's default seems to grant
    // ALL to anon on public tables — dangerous. Revoke everything, then grant
    // only what the RLS policies actually require.
    const authOnly = [
      'library_books','library_book_pages','library_book_chunks','library_book_sections',
      'library_book_index','library_book_conversations','library_conversation_messages',
      'library_generated_quizzes','library_processing_jobs',
      'library_recommendations','library_section_explanations','library_student_book_progress',
      'library_student_memory','library_student_weaknesses'
    ];
    const publicRead = ['library_access_tiers']; // policy: "Anyone can read access tiers"

    for (const t of authOnly) {
      await sql.unsafe(`REVOKE ALL ON TABLE public.${t} FROM anon, authenticated, PUBLIC;`);
      await sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${t} TO authenticated;`);
      await sql.unsafe(`GRANT ALL ON TABLE public.${t} TO service_role;`);
    }
    for (const t of publicRead) {
      await sql.unsafe(`REVOKE ALL ON TABLE public.${t} FROM anon, authenticated, PUBLIC;`);
      await sql.unsafe(`GRANT SELECT ON TABLE public.${t} TO anon;`);
      await sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${t} TO authenticated;`);
      await sql.unsafe(`GRANT ALL ON TABLE public.${t} TO service_role;`);
    }
    await sql.unsafe(`NOTIFY pgrst, 'reload schema';`);
    return { ok: true, hardened: [...authOnly, ...publicRead] };
  } finally { await sql.end({ timeout: 10 }); }
}

async function seed() {
  const sql = pg();
  try {
    // Seed library_access_tiers so library_books FK works. Idempotent.
    await sql`
      INSERT INTO public.library_access_tiers (code, name_ar, sort_order, is_active) VALUES
        ('free', 'مجاني', 1, true),
        ('premium', 'مميز', 2, true),
        ('vip', 'VIP', 3, true)
      ON CONFLICT (code) DO NOTHING
    `;
    const rows = await sql`select code, name_ar, sort_order from public.library_access_tiers order by sort_order`;
    return { ok: true, access_tiers: rows };
  } finally { await sql.end({ timeout: 5 }); }
}

async function e2eBook() {
  // E2E: insert a fake book, insert a fake page with vector, exercise FKs +
  // triggers + indexes, verify readable, then ROLLBACK so no garbage remains.
  const sql = pg();
  try {
    const results: Record<string, unknown> = {};
    await sql.begin(async (tx) => {
      const stage = (await tx`select id from public.library_stages limit 1`)[0];
      const grade = (await tx`select id from public.library_grades where stage_id=${stage.id} limit 1`)[0];
      const ins = await tx`
        INSERT INTO public.library_books (
          title, description, education_type, status, access_tier, stage_id, grade_id, pdf_path, cover_url
        ) VALUES (
          'E2E test book',
          'Automated test — will be rolled back',
          'both',
          'ready',
          'free',
          ${stage.id},
          ${grade?.id ?? null},
          'bstorage://test/e2e.pdf',
          'bstorage://test/e2e-cover.jpg'
        )
        RETURNING id, title, status, access_tier, education_type, created_at
      `;
      const bookId = ins[0].id;
      results.inserted_book = ins[0];

      // Insert a page with 1536-dim zero vector to exercise pgvector + FK
      const vec = "[" + Array(1536).fill(0).join(",") + "]";
      const page = await tx.unsafe(
        `INSERT INTO public.library_book_pages (book_id, page_number, text_content, embedding)
         VALUES ($1, 1, 'Test page text', $2::vector) RETURNING id, page_number`,
        [bookId, vec],
      );
      results.inserted_page = page[0];

      // Trigger a processing job (exercises the library_jobs_touch_updated_at trigger)
      const job = await tx`
        INSERT INTO public.library_processing_jobs (book_id, stage, kind)
        VALUES (${bookId}, 'upload', 'extract_book')
        RETURNING id, stage, state, kind
      `;
      results.inserted_job = job[0];

      // Read them back via a JOIN (proves indexes and FKs)
      const joined = await tx`
        SELECT b.title, p.page_number, j.stage AS job_stage
        FROM public.library_books b
        LEFT JOIN public.library_book_pages p ON p.book_id = b.id
        LEFT JOIN public.library_processing_jobs j ON j.book_id = b.id
        WHERE b.id = ${bookId}
      `;
      results.join_readback = joined;

      // Explicitly rollback so test data never persists
      throw new Error("__ROLLBACK__");
    }).catch((e) => {
      if (String(e?.message).includes("__ROLLBACK__")) results.rolled_back = true;
      else throw e;
    });

    // Confirm nothing was left behind
    const final = await sql`select count(*)::int as c from public.library_books`;
    results.final_book_count = final[0].c;
    return { ok: true, ...results };
  } finally { await sql.end({ timeout: 10 }); }
}

async function verify() {
  const sql = pg();
  try {
    const results: Record<string, unknown> = {};
    const tables = [
      'library_books','library_book_pages','library_book_chunks','library_book_sections',
      'library_book_index','library_book_conversations','library_conversation_messages',
      'library_generated_quizzes','library_processing_jobs','library_access_tiers',
      'library_recommendations','library_section_explanations','library_student_book_progress',
      'library_student_memory','library_student_weaknesses'
    ];
    for (const t of tables) {
      const rows = await sql.unsafe(`select count(*)::int as c from public.${t}`);
      const grants = await sql`select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name=${t} and grantee in ('anon','authenticated','service_role') order by grantee, privilege_type`;
      const policies = await sql`select policyname, cmd from pg_policies where schemaname='public' and tablename=${t}`;
      const rls = await sql`select relrowsecurity from pg_class where oid=('public.'||${t})::regclass`;
      results[t] = { rows: rows[0].c, rls: rls[0]?.relrowsecurity, grants, policies };
    }
    return results;
  } finally { await sql.end({ timeout: 5 }); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!DB_URL) return new Response(JSON.stringify({ error: "missing EXTERNAL_SUPABASE_DB_URL" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const action = req.headers.get("x-action") || new URL(req.url).searchParams.get("action") || "preflight";

  try {
    let out: unknown;
    if (action === "preflight") out = await preflight();
    else if (action === "verify") out = await verify();
    else if (action === "migrate") {
      if (req.headers.get("x-confirm") !== "run-on-B") {
        return new Response(JSON.stringify({ error: "missing X-Confirm: run-on-B header" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      out = await migrate();
    }
    else if (action === "harden") {
      if (req.headers.get("x-confirm") !== "run-on-B") {
        return new Response(JSON.stringify({ error: "missing X-Confirm: run-on-B header" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      out = await harden();
    }
    else if (action === "seed") {
      if (req.headers.get("x-confirm") !== "run-on-B") {
        return new Response(JSON.stringify({ error: "missing X-Confirm: run-on-B header" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      out = await seed();
    }
    else if (action === "e2e-book") {
      if (req.headers.get("x-confirm") !== "run-on-B") {
        return new Response(JSON.stringify({ error: "missing X-Confirm: run-on-B header" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      out = await e2eBook();
    }
    else return new Response(JSON.stringify({ error: `unknown action ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({
      error: String((e as Error)?.message || e),
      code: (e as any)?.code,
      detail: (e as any)?.detail,
      where: (e as any)?.where,
      hint: (e as any)?.hint,
      position: (e as any)?.position,
      stack: (e as Error)?.stack?.split("\n").slice(0, 8),
    }, null, 2), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
