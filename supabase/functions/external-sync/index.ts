// Runtime sync from this Lovable Cloud project to an external Supabase project.
// Bypasses GitHub Actions entirely. Safe to call repeatedly (idempotent upserts).
//
// Required secrets (already configured):
//   EXTERNAL_SUPABASE_URL
//   EXTERNAL_SUPABASE_SERVICE_ROLE_KEY
//   EXTERNAL_SUPABASE_PROJECT_REF  (optional, inferred from URL if missing)
//   SUPABASE_SERVICE_ROLE_KEY      (THIS project's service role — already set)
//   SUPABASE_URL                   (THIS project's URL — already set)
//
// Optional:
//   SUPABASE_ACCESS_TOKEN          (only needed to redeploy edge functions; if absent we skip)
//
// SOURCE_SUPABASE_SERVICE_ROLE_KEY is NOT required.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SOURCE_URL = Deno.env.get("SUPABASE_URL")!;
const SOURCE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXT_URL = Deno.env.get("EXTERNAL_SUPABASE_URL") ?? "";
const EXT_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXT_REF =
  Deno.env.get("EXTERNAL_SUPABASE_PROJECT_REF") ??
  (EXT_URL.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? "");
const ACCESS_TOKEN = Deno.env.get("SUPABASE_ACCESS_TOKEN") ?? "";

// Public tables to mirror (in dependency order). Skip large/log tables by default.
const TABLES = [
  "platform_settings",
  "profiles",
  "user_roles",
  "wallets",
  "teacher_profiles",
  "teacher_assignments",
  "teacher_wallets",
  "subjects",
  "content_groups",
  "content",
  "student_group_purchases",
  "student_teacher_choices",
  "subscriptions",
  "subscription_requests",
  "teacher_requests",
  "teacher_schedules",
  "teacher_messages",
  "exams",
  "exam_attempts",
  "live_sessions",
  "live_session_recordings",
  "notifications",
];

async function mirrorTable(src: any, dst: any, table: string) {
  const pageSize = 1000;
  let from = 0;
  let total = 0;
  let upserted = 0;
  const errors: string[] = [];
  // Determine columns once
  for (;;) {
    const { data, error } = await src
      .from(table)
      .select("*")
      .range(from, from + pageSize - 1);
    if (error) {
      return { table, total: 0, upserted: 0, error: error.message };
    }
    if (!data || data.length === 0) break;
    total += data.length;
    const { error: upErr } = await dst.from(table).upsert(data, { onConflict: "id" });
    if (upErr) {
      // Fall back to insert (some tables may not have an `id` pk)
      const { error: insErr } = await dst.from(table).insert(data);
      if (insErr) errors.push(`${upErr.message} | ${insErr.message}`);
      else upserted += data.length;
    } else {
      upserted += data.length;
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return { table, total, upserted, error: errors.length ? errors.join("; ") : null };
}

async function mirrorAuthUsers(): Promise<any> {
  const out = { listed: 0, created: 0, updated: 0, failed: [] as any[] };
  // List all users in source
  let page = 1;
  const perPage = 1000;
  while (true) {
    const r = await fetch(
      `${SOURCE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
      { headers: { apikey: SOURCE_KEY, Authorization: `Bearer ${SOURCE_KEY}` } },
    );
    if (!r.ok) {
      out.failed.push({ stage: "list_source", status: r.status, body: await r.text() });
      break;
    }
    const json = await r.json();
    const users = json.users ?? [];
    out.listed += users.length;
    for (const u of users) {
      const payload = {
        id: u.id,
        email: u.email,
        phone: u.phone,
        email_confirm: !!u.email_confirmed_at,
        phone_confirm: !!u.phone_confirmed_at,
        user_metadata: u.user_metadata ?? {},
        app_metadata: u.app_metadata ?? {},
      };
      const cr = await fetch(`${EXT_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          apikey: EXT_KEY,
          Authorization: `Bearer ${EXT_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (cr.ok) {
        out.created++;
      } else if (cr.status === 422 || cr.status === 409 || cr.status === 400) {
        // Already exists — update metadata
        const ur = await fetch(`${EXT_URL}/auth/v1/admin/users/${u.id}`, {
          method: "PUT",
          headers: {
            apikey: EXT_KEY,
            Authorization: `Bearer ${EXT_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: u.email,
            phone: u.phone,
            user_metadata: u.user_metadata ?? {},
            app_metadata: u.app_metadata ?? {},
          }),
        });
        if (ur.ok) out.updated++;
        else out.failed.push({ id: u.id, status: ur.status, body: await ur.text() });
      } else {
        out.failed.push({ id: u.id, status: cr.status, body: await cr.text() });
      }
    }
    if (users.length < perPage) break;
    page++;
  }
  return out;
}

async function redeployEdgeFunctions(): Promise<any> {
  if (!ACCESS_TOKEN || !EXT_REF) {
    return { skipped: true, reason: "SUPABASE_ACCESS_TOKEN or EXTERNAL_SUPABASE_PROJECT_REF missing" };
  }
  // Edge functions can't shell-out to the Supabase CLI; deployment via Management API
  // requires bundling source files which isn't available at runtime. We expose a hook
  // so the caller knows this needs the CLI step. We list functions that should exist.
  const expected = [
    "admin-manage-teacher", "ai-chat", "auto-cancel-withdrawals", "bunny-storage",
    "bunny-stream", "generate-exam", "grade-essay", "livekit-token", "reset-admin",
    "send-content-notification", "send-push-notification", "subscription-expiry-notify",
    "support-assistant", "teacher-assistant", "external-sync",
  ];
  // Check which already exist on the external project
  const r = await fetch(`https://api.supabase.com/v1/projects/${EXT_REF}/functions`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (!r.ok) return { skipped: false, error: `list failed: ${r.status} ${await r.text()}` };
  const list = await r.json();
  const present = new Set((list || []).map((f: any) => f.slug));
  return {
    expected,
    present: [...present],
    missing: expected.filter((n) => !present.has(n)),
    note:
      "Edge functions are deployed automatically by Lovable to this project. " +
      "Functions are listed for the external project as a sanity check. " +
      "If 'missing' is non-empty, run the Supabase CLI once: " +
      "`supabase functions deploy <name> --project-ref " + EXT_REF + "`.",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const report: any = {
    started_at: new Date().toISOString(),
    external_project_ref: EXT_REF,
    external_url: EXT_URL,
    missing_secrets: [] as string[],
  };

  if (!EXT_URL) report.missing_secrets.push("EXTERNAL_SUPABASE_URL");
  if (!EXT_KEY) report.missing_secrets.push("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");

  if (report.missing_secrets.length) {
    report.status = "skipped";
    report.message =
      "External sync skipped — required secrets missing. App continues to run on Lovable Cloud.";
    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }

  try {
    const src = createClient(SOURCE_URL, SOURCE_KEY, { auth: { persistSession: false } });
    const dst = createClient(EXT_URL, EXT_KEY, { auth: { persistSession: false } });

    const url = new URL(req.url);
    const only = url.searchParams.get("only"); // "auth" | "tables" | "functions"

    if (!only || only === "auth") {
      try { report.auth = await mirrorAuthUsers(); }
      catch (e) { report.auth_error = String(e); }
    }
    if (!only || only === "tables") {
      report.tables = [];
      for (const t of TABLES) {
        try { report.tables.push(await mirrorTable(src, dst, t)); }
        catch (e) { report.tables.push({ table: t, error: String(e) }); }
      }
    }
    if (!only || only === "functions") {
      try { report.functions = await redeployEdgeFunctions(); }
      catch (e) { report.functions_error = String(e); }
    }

    report.status = "ok";
    report.finished_at = new Date().toISOString();
    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    report.status = "error";
    report.error = String(e);
    // Never throw — the app should continue working even if sync fails.
    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
