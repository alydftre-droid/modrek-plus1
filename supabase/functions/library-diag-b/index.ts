// Diagnostic edge function — runs on project A but queries project B
// (qteuqfntsocsdbjmdvmr, the real production DB used by modrekplus.com)
// using EXTERNAL_SUPABASE_SERVICE_ROLE_KEY. Read-only diagnostics.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("EXTERNAL_SUPABASE_URL") || "";
  const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || "";
  const ref = Deno.env.get("EXTERNAL_SUPABASE_PROJECT_REF") || "";

  const report: Record<string, unknown> = { target_project_ref: ref, target_url: url };

  if (!url || !key) {
    return new Response(JSON.stringify({ error: "missing EXTERNAL_SUPABASE_* env", report }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Try to list library_books directly
  try {
    const { data, count, error } = await sb
      .from("library_books")
      .select("id,title,status,access_tier,stage_id,grade_id,section_id,subject_id,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(5);
    report.library_books = { count, sample: data, error: error?.message ?? null };
  } catch (e) {
    report.library_books = { fatal: String(e) };
  }

  // 2. Taxonomy tables
  for (const t of ["library_stages", "library_grades", "library_sections", "library_subjects", "library_sub_subjects", "library_tracks"]) {
    try {
      const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
      (report as any)[t] = { count, error: error?.message ?? null };
    } catch (e) { (report as any)[t] = { fatal: String(e) }; }
  }

  // 3. Storage buckets on B
  try {
    const r = await fetch(`${url}/storage/v1/bucket`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    report.storage_buckets = { status: r.status, body: await r.json().catch(() => null) };
  } catch (e) { report.storage_buckets = { fatal: String(e) }; }

  // 4. Anon-visibility test (as an anonymous student would see it)
  try {
    const anonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || "";
    const anonR = await fetch(`${url}/rest/v1/library_books?select=id&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    report.anon_read_library_books = { status: anonR.status, body: await anonR.text() };
  } catch (e) { report.anon_read_library_books = { fatal: String(e) }; }

  // 5. PostgREST schema cache probe — the exact error the user saw
  try {
    const r = await fetch(`${url}/rest/v1/library_books?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    report.service_role_probe_library_books = { status: r.status, body: await r.text() };
  } catch (e) { report.service_role_probe_library_books = { fatal: String(e) }; }

  return new Response(JSON.stringify(report, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
