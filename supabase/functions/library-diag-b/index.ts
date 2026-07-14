// Diagnostic/migration edge function targeting project B via EXTERNAL_SUPABASE_DB_URL
// SECURITY: this function is deployed with verify_jwt=true (default) OR checks
// a shared secret. It never accepts arbitrary SQL from callers — only runs
// predefined actions.
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-action",
};

const DB_URL = Deno.env.get("EXTERNAL_SUPABASE_DB_URL") || "";

async function preflight() {
  const sql = postgres(DB_URL, { max: 1, prepare: false, ssl: "require" });
  const out: Record<string, unknown> = {};
  try {
    out.current_db = await sql`select current_database() as db, inet_server_addr() as ip`;
    out.extensions = await sql`select extname from pg_extension where extname in ('vector','pgcrypto','uuid-ossp')`;
    out.helper_functions = await sql`select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('update_updated_at_column','touch_library_conv_updated_at','library_jobs_touch_updated_at','has_role','is_admin')`;
    out.app_role_enum = await sql`select typname from pg_type where typname='app_role'`;
    out.core_tables = await sql`select table_name from information_schema.tables where table_schema='public' and table_name in ('profiles','user_roles','library_stages','library_grades','library_sections','library_subjects','library_sub_subjects','library_tracks')`;
    out.missing_book_tables = await sql`
      with expected(t) as (values ('library_books'),('library_book_pages'),('library_book_chunks'),('library_book_sections'),('library_book_index'),('library_book_conversations'),('library_conversation_messages'),('library_generated_quizzes'),('library_processing_jobs'),('library_access_tiers'),('library_recommendations'),('library_section_explanations'),('library_student_book_progress'),('library_student_memory'),('library_student_weaknesses'))
      select e.t as missing from expected e left join information_schema.tables i on i.table_schema='public' and i.table_name=e.t where i.table_name is null`;
  } finally { await sql.end({ timeout: 5 }); }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!DB_URL) return new Response(JSON.stringify({ error: "missing EXTERNAL_SUPABASE_DB_URL" }), { status: 500, headers: corsHeaders });

  const action = req.headers.get("x-action") || new URL(req.url).searchParams.get("action") || "preflight";

  try {
    if (action === "preflight") {
      return new Response(JSON.stringify(await preflight(), null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: `unknown action ${action}` }), { status: 400, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), stack: (e as Error)?.stack }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
