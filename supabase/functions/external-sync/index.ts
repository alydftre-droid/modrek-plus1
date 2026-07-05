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

const RAW_SRC_DB = Deno.env.get("SUPABASE_DB_URL") ?? "";
const RAW_DST_DB = Deno.env.get("EXTERNAL_SUPABASE_DB_URL") ?? "";
const SRC_DB = sanitizeDbUrl(RAW_SRC_DB);
const DST_DB = sanitizeDbUrl(RAW_DST_DB);
const EXT_URL = Deno.env.get("EXTERNAL_SUPABASE_URL") ?? "";
const EXT_SERVICE_ROLE = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ?? "";
const REQUIRED_EXTERNAL_PROJECT_REF = "qteuqfntsocsdbjmdvmr";

async function connectWithFallback(primaryUrl: string, fallbackUrl: string) {
  const primary = new Client(primaryUrl);
  try {
    await primary.connect();
    return { client: primary, strategy: "raw" };
  } catch (primaryError) {
    try {
      await primary.end();
    } catch (_e) {
      /* noop */
    }

    if (!fallbackUrl || fallbackUrl === primaryUrl) {
      throw primaryError;
    }

    const fallback = new Client(fallbackUrl);
    await fallback.connect();
    return { client: fallback, strategy: "sanitized" };
  }
}

// Tables to mirror, in FK-safe order
const TABLES = [
  "platform_settings",
  "ai_function_settings",
  "profiles",
  "user_roles",
  "wallets",
  "wallet_adjustments",
  "deposit_requests",
  "teacher_profiles",
  "teacher_assignments",
  "teacher_wallets",
  "subjects",
  "system_terms",
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

-- platform_settings: expose the support/contact keys used by the live app
GRANT SELECT ON public.platform_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE IF EXISTS public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read settings" ON public.platform_settings;
CREATE POLICY "Public can read settings" ON public.platform_settings
  FOR SELECT USING (key = ANY (ARRAY[
    'platform_name'::text,
    'maintenance_mode'::text,
    'maintenance_message'::text,
    'platform_logo'::text,
    'support_phone'::text,
    'support_whatsapp'::text,
    'support_email'::text,
    'support_telegram'::text,
    'support_whatsapp_student'::text,
    'support_whatsapp_teacher'::text,
    'support_whatsapp_enabled'::text,
    'support_messenger_student'::text,
    'support_messenger_teacher'::text,
    'support_messenger_enabled'::text,
    'support_assistant_enabled'::text,
    'support_assistant_display_name'::text,
    'support_message_template'::text,
    'subscription_whatsapp'::text,
    'subscription_default_price'::text,
    'subscription_default_message'::text,
    'subscription_currency'::text,
    'payment_receive_number'::text,
    'payment_methods_config'::text,
    'deposit_tutorial_video'::text,
    'student_dashboard_ticker_enabled'::text,
    'student_dashboard_ticker_text'::text,
    'student_dashboard_ticker_items'::text,
    'teacher_commission_rate'::text,
    'withdrawal_open_day'::text,
    'withdrawal_manual_state'::text,
    'withdrawal_notice_message'::text
  ]));
DROP POLICY IF EXISTS "Admins can manage settings" ON public.platform_settings;
CREATE POLICY "Admins can manage settings" ON public.platform_settings
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = ANY (ARRAY['alyedaft@gmail.com'::text, 'aliana200713@gmail.com'::text])
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = ANY (ARRAY['alyedaft@gmail.com'::text, 'aliana200713@gmail.com'::text])
  );

-- payment-receipts: required for student deposit receipts and admin withdrawal receipts
GRANT SELECT ON storage.buckets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT ALL ON storage.objects TO service_role;
DROP POLICY IF EXISTS "Allow read bucket metadata" ON storage.buckets;
CREATE POLICY "Allow read bucket metadata"
  ON storage.buckets FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read receipts" ON storage.objects;
DROP POLICY IF EXISTS "Students upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admins view receipts" ON storage.objects;
CREATE POLICY "Users can upload own receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "Users can read own receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );
CREATE POLICY "Admins view receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'payment-receipts' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Developer test-student isolation: keep fake testing accounts completely invisible to teachers.
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_account_code text;

CREATE OR REPLACE FUNCTION public.is_test_student(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT (is_test_account = true) OR (test_account_code IS NOT NULL)
       FROM public.profiles
      WHERE id = _user_id),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.block_teacher_message_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Students can send messages" ON public.teacher_messages;
CREATE POLICY "Students can send messages"
ON public.teacher_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = student_id
  AND is_from_teacher = false
  AND NOT public.is_test_student(student_id)
);

DROP POLICY IF EXISTS "Teachers can send messages" ON public.teacher_messages;
CREATE POLICY "Teachers can send messages"
ON public.teacher_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = teacher_id
  AND is_from_teacher = true
  AND NOT public.is_test_student(student_id)
);

DROP TRIGGER IF EXISTS block_teacher_message_test_student_trg ON public.teacher_messages;
CREATE TRIGGER block_teacher_message_test_student_trg
BEFORE INSERT ON public.teacher_messages
FOR EACH ROW
EXECUTE FUNCTION public.block_teacher_message_for_test_student();

CREATE OR REPLACE FUNCTION public.teacher_wallet_tx_is_for_test_student(_metadata jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  student uuid;
  purchase uuid;
BEGIN
  IF _metadata IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    student := NULLIF(_metadata->>'student_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    student := NULL;
  END;

  IF student IS NOT NULL AND public.is_test_student(student) THEN
    RETURN true;
  END IF;

  BEGIN
    purchase := NULLIF(_metadata->>'purchase_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    purchase := NULL;
  END;

  IF purchase IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.student_group_purchases sgp
      WHERE sgp.id = purchase
        AND public.is_test_student(sgp.student_id)
    );
  END IF;

  RETURN false;
END;
$$;

DROP POLICY IF EXISTS "Teachers can view purchases for their groups" ON public.student_group_purchases;
CREATE POLICY "Teachers can view purchases for their groups"
ON public.student_group_purchases
FOR SELECT
USING (
  NOT public.is_test_student(student_id)
  AND EXISTS (
    SELECT 1
    FROM public.content_groups
    WHERE content_groups.id = student_group_purchases.group_id
      AND (content_groups.teacher_id = auth.uid() OR content_groups.created_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "Teachers view own earnings" ON public.teacher_earning_records;
CREATE POLICY "Teachers view own earnings"
ON public.teacher_earning_records
FOR SELECT
USING (auth.uid() = teacher_id AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Teachers view own transactions" ON public.teacher_wallet_transactions;
CREATE POLICY "Teachers view own transactions"
ON public.teacher_wallet_transactions
FOR SELECT
USING (auth.uid() = teacher_id AND NOT public.teacher_wallet_tx_is_for_test_student(metadata));

CREATE OR REPLACE FUNCTION public.block_teacher_notification_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_teacher boolean := false;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.user_id AND role = 'teacher'::public.app_role
  ) INTO v_is_teacher;

  IF v_is_teacher AND NEW.created_by IS NOT NULL AND public.is_test_student(NEW.created_by) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_teacher_notification_test_student_trg ON public.notifications;
CREATE TRIGGER block_teacher_notification_test_student_trg
BEFORE INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.block_teacher_notification_for_test_student();
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
  const conflictTarget = table === "platform_settings" ? '"key"' : pkRes.rows.map((r) => `"${r.a}"`).join(",");
  const immutableCols = new Set(table === "platform_settings" ? ['"id"', '"key"', '"created_at"'] : conflictTarget.split(",").filter(Boolean));
  const updateCols = cols.filter((c) => !immutableCols.has(c));
  const onConflict = conflictTarget
    ? `ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateCols
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

async function ensurePaymentReceiptsBucket() {
  if (!EXT_URL || !EXT_SERVICE_ROLE) {
    return { ok: false, skipped: true, reason: "missing_external_storage_credentials" };
  }

  const headers = {
    apikey: EXT_SERVICE_ROLE,
    Authorization: `Bearer ${EXT_SERVICE_ROLE}`,
    "Content-Type": "application/json",
  };

  try {
    const existing = await fetch(`${EXT_URL}/storage/v1/bucket/payment-receipts`, { headers });
    if (existing.ok) return { ok: true, existed: true };

    const created = await fetch(`${EXT_URL}/storage/v1/bucket`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: "payment-receipts", name: "payment-receipts", public: false }),
    });
    if (created.ok || created.status === 409) return { ok: true, created: created.ok, existed: created.status === 409 };

    return { ok: false, status: created.status, error: await created.text() };
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
  if (EXT_URL && !EXT_URL.includes(REQUIRED_EXTERNAL_PROJECT_REF)) {
    report.status = "error";
    report.error = "EXTERNAL_SUPABASE_URL_PROJECT_REF_MISMATCH";
    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  }
  if (report.missing_secrets.length) {
    report.status = "skipped";
    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  }

  const url = new URL(req.url);
  const only = url.searchParams.get("only"); // "auth" | "tables" | "rls"

  let src: Client | null = null;
  let dst: Client | null = null;
  try {
    try {
      const srcConn = await connectWithFallback(RAW_SRC_DB, SRC_DB);
      src = srcConn.client;
      report.src_connected = true;
      report.src_connection_strategy = srcConn.strategy;
    }
    catch (e) { report.src_connect_error = String(e); throw e; }
    try {
      const dstConn = await connectWithFallback(RAW_DST_DB, DST_DB);
      dst = dstConn.client;
      report.dst_connected = true;
      report.dst_connection_strategy = dstConn.strategy;
    }
    catch (e) { report.dst_connect_error = String(e); throw e; }


    if (!only || only === "rls") {
      report.storage = await ensurePaymentReceiptsBucket();
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
    try { await src?.end(); } catch (_e) { /* */ }
    try { await dst?.end(); } catch (_e) { /* */ }
  }

  return new Response(JSON.stringify(report), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
  });
});
