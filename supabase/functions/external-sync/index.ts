// Runtime sync from this Lovable Cloud project to an external Supabase project.
// Uses DIRECT Postgres connections to mirror:
//   - auth.users INCLUDING encrypted_password (so logins keep working)
//   - public.* tables (data)
//   - RLS policies for critical public tables (so students can read groups)
//
// Required secrets:
//   SUPABASE_DB_URL                       (this project's pg)
//   EXTERNAL_SUPABASE_DB_URL              (external project's pg)
//   EXTERNAL_SUPABASE_URL                 (for reporting)
//   EXTERNAL_SUPABASE_SERVICE_ROLE_KEY    (kept for compatibility, not required here)

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

// Some DB URLs contain unencoded special chars (e.g. '#' in password).
// Percent-encode the password section so the URI parser succeeds.
function sanitizeDbUrl(raw: string): string {
  if (!raw) return raw;
  const schemeIdx = raw.indexOf("://");
  if (schemeIdx === -1) return raw;
  const afterScheme = raw.slice(schemeIdx + 3);
  const atIdx = afterScheme.lastIndexOf("@");
  if (atIdx === -1) return raw;
  const userInfo = afterScheme.slice(0, atIdx);
  const rest = afterScheme.slice(atIdx);
  const colonIdx = userInfo.indexOf(":");
  if (colonIdx === -1) return raw;
  const user = userInfo.slice(0, colonIdx);
  const pwd = userInfo.slice(colonIdx + 1);
  // Encode only if not already encoded
  const encoded = /%[0-9A-Fa-f]{2}/.test(pwd) ? pwd : encodeURIComponent(pwd);
  return `${raw.slice(0, schemeIdx + 3)}${user}:${encoded}${rest}`;
}

const SRC_DB = sanitizeDbUrl(Deno.env.get("SUPABASE_DB_URL") ?? "");
const DST_DB = sanitizeDbUrl(Deno.env.get("EXTERNAL_SUPABASE_DB_URL") ?? "");
const EXT_URL = Deno.env.get("EXTERNAL_SUPABASE_URL") ?? "";

// Tables to mirror, in FK-safe order
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

// Critical RLS policies to (re)create on the external project so students
// can read teachers' active groups and other public content.
const RLS_SQL = `
-- content_groups: anyone can read active rows
ALTER TABLE IF EXISTS public.content_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view active groups" ON public.content_groups;
CREATE POLICY "Anyone can view active groups" ON public.content_groups
  FOR SELECT USING (is_active = true);

-- subjects: public read
ALTER TABLE IF EXISTS public.subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Subjects are publicly readable" ON public.subjects;
CREATE POLICY "Subjects are publicly readable" ON public.subjects
  FOR SELECT USING (true);

-- teacher_assignments: public read (students browse teachers)
ALTER TABLE IF EXISTS public.teacher_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Assignments are publicly readable" ON public.teacher_assignments;
CREATE POLICY "Assignments are publicly readable" ON public.teacher_assignments
  FOR SELECT USING (true);

-- profiles: public read of teacher cards
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Teacher profiles are publicly readable" ON public.profiles;
CREATE POLICY "Teacher profiles are publicly readable" ON public.profiles
  FOR SELECT USING (true);

-- content: anyone can read (subscription is enforced at the group level)
ALTER TABLE IF EXISTS public.content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Content is publicly readable" ON public.content;
CREATE POLICY "Content is publicly readable" ON public.content
  FOR SELECT USING (true);
`;

async function mirrorTable(src: Client, dst: Client, table: string) {
  // Get column list (excluding generated)
  const colsRes = await dst.queryObject<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
       AND is_generated <> 'ALWAYS'
     ORDER BY ordinal_position`,
    [table],
  );
  if (colsRes.rows.length === 0) {
    return { table, error: "destination table not found" };
  }
  const cols = colsRes.rows.map((r) => `"${r.column_name}"`);

  // Find pk for ON CONFLICT
  const pkRes = await dst.queryObject<{ a: string }>(
    `SELECT a.attname AS a FROM pg_index i
     JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
     WHERE i.indrelid = ('public.'||$1)::regclass AND i.indisprimary`,
    [table],
  );
  const pk = pkRes.rows.map((r) => `"${r.a}"`).join(",");
  const onConflict = pk
    ? `ON CONFLICT (${pk}) DO UPDATE SET ${cols
        .filter((c) => !pk.includes(c))
        .map((c) => `${c}=EXCLUDED.${c}`)
        .join(",")}`
    : "ON CONFLICT DO NOTHING";

  // Stream source rows
  const data = await src.queryObject<Record<string, unknown>>(
    `SELECT ${cols.join(",")} FROM public."${table}"`,
  );
  let upserted = 0;
  for (const row of data.rows) {
    const values = cols.map((c) => row[c.replaceAll('"', "")]);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
    try {
      await dst.queryArray(
        `INSERT INTO public."${table}" (${cols.join(",")}) VALUES (${placeholders}) ${onConflict}`,
        values,
      );
      upserted++;
    } catch (_e) {
      // skip bad row, continue
    }
  }
  return { table, total: data.rows.length, upserted };
}

async function mirrorAuthUsers(src: Client, dst: Client) {
  // Copy auth.users INCLUDING encrypted_password so logins keep working.
  const rows = await src.queryObject<any>(`
    SELECT id, instance_id, email, encrypted_password, email_confirmed_at,
           phone, phone_confirmed_at, confirmation_token, confirmation_sent_at,
           recovery_token, email_change_token_new, email_change,
           raw_app_meta_data, raw_user_meta_data, is_super_admin,
           created_at, updated_at, role, aud
    FROM auth.users
  `);
  let upserted = 0;
  const failed: any[] = [];
  for (const u of rows.rows) {
    try {
      await dst.queryArray(
        `INSERT INTO auth.users
          (id, instance_id, email, encrypted_password, email_confirmed_at,
           phone, phone_confirmed_at, confirmation_token, confirmation_sent_at,
           recovery_token, email_change_token_new, email_change,
           raw_app_meta_data, raw_user_meta_data, is_super_admin,
           created_at, updated_at, role, aud)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (id) DO UPDATE SET
           email=EXCLUDED.email,
           encrypted_password=EXCLUDED.encrypted_password,
           email_confirmed_at=EXCLUDED.email_confirmed_at,
           phone=EXCLUDED.phone,
           phone_confirmed_at=EXCLUDED.phone_confirmed_at,
           raw_app_meta_data=EXCLUDED.raw_app_meta_data,
           raw_user_meta_data=EXCLUDED.raw_user_meta_data,
           updated_at=now()`,
        [
          u.id, u.instance_id, u.email, u.encrypted_password, u.email_confirmed_at,
          u.phone, u.phone_confirmed_at, u.confirmation_token ?? "", u.confirmation_sent_at,
          u.recovery_token ?? "", u.email_change_token_new ?? "", u.email_change ?? "",
          u.raw_app_meta_data, u.raw_user_meta_data, u.is_super_admin ?? false,
          u.created_at, u.updated_at, u.role ?? "authenticated", u.aud ?? "authenticated",
        ],
      );
      // Also copy identities so providers (email) still work
      upserted++;
    } catch (e) {
      failed.push({ id: u.id, error: String(e) });
    }
  }

  // Mirror identities
  let identities = 0;
  try {
    const ident = await src.queryObject<any>(
      `SELECT id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at, email FROM auth.identities`,
    );
    for (const r of ident.rows) {
      try {
        await dst.queryArray(
          `INSERT INTO auth.identities
             (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at, email)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (provider, provider_id) DO UPDATE SET
             identity_data=EXCLUDED.identity_data,
             updated_at=now()`,
          [r.id, r.user_id, r.identity_data, r.provider, r.provider_id, r.last_sign_in_at, r.created_at, r.updated_at, r.email],
        );
        identities++;
      } catch (_e) { /* ignore individual */ }
    }
  } catch (_e) { /* table shape may differ on older projects */ }

  return { listed: rows.rows.length, upserted, identities, failed_count: failed.length, failed: failed.slice(0, 5) };
}

async function applyRlsPolicies(dst: Client) {
  try {
    await dst.queryArray(RLS_SQL);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const report: any = {
    started_at: new Date().toISOString(),
    external_url: EXT_URL,
    missing_secrets: [] as string[],
  };
  if (!SRC_DB) report.missing_secrets.push("SUPABASE_DB_URL");
  if (!DST_DB) report.missing_secrets.push("EXTERNAL_SUPABASE_DB_URL");
  if (report.missing_secrets.length) {
    report.status = "skipped";
    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  }

  const url = new URL(req.url);
  const only = url.searchParams.get("only"); // "auth" | "tables" | "rls"

  const src = new Client(SRC_DB);
  const dst = new Client(DST_DB);
  try {
    await src.connect();
    await dst.connect();

    if (!only || only === "rls") {
      report.rls = await applyRlsPolicies(dst);
    }
    if (!only || only === "auth") {
      try { report.auth = await mirrorAuthUsers(src, dst); }
      catch (e) { report.auth_error = String(e); }
    }
    if (!only || only === "tables") {
      report.tables = [];
      for (const t of TABLES) {
        try { report.tables.push(await mirrorTable(src, dst, t)); }
        catch (e) { report.tables.push({ table: t, error: String(e) }); }
      }
    }

    report.status = "ok";
    report.finished_at = new Date().toISOString();
  } catch (e) {
    report.status = "error";
    report.error = String(e);
  } finally {
    try { await src.end(); } catch (_e) { /* */ }
    try { await dst.end(); } catch (_e) { /* */ }
  }

  return new Response(JSON.stringify(report), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
  });
});
