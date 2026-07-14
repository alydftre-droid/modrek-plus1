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
      where table_schema='public' and table_name like 'library_%book%' or table_name like 'library_%'
      order by table_name`;
    return { ok: true, tables_after: present };
  } catch (e) {
    try { await sql`ROLLBACK`; } catch { /* ignore */ }
    throw e;
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
