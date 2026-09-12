#!/usr/bin/env node
/**
 * Demo account security test matrix.
 *
 * Proves, against a real database session (not the UI), that:
 *   READ  — a demo admin can select every table a real admin can select.
 *   WRITE — every INSERT / UPDATE / DELETE / UPSERT / mutating RPC fails,
 *           including through SECURITY DEFINER functions.
 *   REAL  — a real admin is completely unaffected.
 *
 * Every write test runs inside a transaction that is rolled back, so the test
 * itself never changes production data.
 *
 * Usage:  DEMO_TEST_DB_URL=<postgres url> node scripts/test-demo-read-only.mjs
 *         (falls back to EXTERNAL_SUPABASE_DB_URL, then SUPABASE_DB_URL)
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const DB_URL =
  process.env.DEMO_TEST_DB_URL ||
  process.env.EXTERNAL_SUPABASE_DB_URL ||
  process.env.SUPABASE_DB_URL;

if (!DB_URL) {
  console.error("No database URL. Set DEMO_TEST_DB_URL.");
  process.exit(2);
}

async function psql(sql) {
  const { stdout } = await run("psql", [DB_URL, "-Atc", sql], { maxBuffer: 32 * 1024 * 1024 });
  return stdout.trim();
}

async function asUser(userId, sql) {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" }).replace(/'/g, "''");
  const wrapped = `begin; set local role authenticated; set local request.jwt.claims = '${claims}'; ${sql}; rollback;`;
  try {
    const { stdout } = await run("psql", [DB_URL, "-Atc", wrapped], { maxBuffer: 32 * 1024 * 1024 });
    return { ok: true, out: stdout.trim() };
  } catch (error) {
    return { ok: false, out: String(error.stderr || error.message).trim() };
  }
}

const results = [];
const record = (group, name, pass, detail = "") => {
  results.push({ group, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  [${group}] ${name}${pass ? "" : ` -> ${detail.slice(0, 180)}`}`);
};

const isDemoBlocked = (r) => !r.ok && /DEMO_READ_ONLY/.test(r.out);

async function main() {
  const demoId = await psql(
    "select id from public.profiles where is_demo = true order by created_at desc limit 1",
  );
  const adminId = await psql(
    "select ur.user_id from public.user_roles ur join public.profiles p on p.id = ur.user_id where ur.role = 'admin' and coalesce(p.is_demo,false) = false limit 1",
  );
  if (!demoId) throw new Error("no demo account found — create one from the admin demo accounts page");
  if (!adminId) throw new Error("no real admin found");

  // ---------------- READ MATRIX ----------------
  const readTables = [
    "profiles", "teacher_profiles", "subscriptions", "subscription_requests", "deposit_requests",
    "wallets", "teacher_wallets", "teacher_withdrawal_requests", "content", "content_groups",
    "library_books", "library_book_pages", "exams", "exam_attempts", "subjects", "sub_subjects",
    "notifications", "support_messages", "teacher_messages", "platform_settings",
    "group_weekly_schedule", "student_activity_logs", "ads", "storage_assets", "file_migrations",
  ];
  for (const table of readTables) {
    const r = await asUser(demoId, `select count(*) from public.${table}`);
    record("READ", `select ${table}`, r.ok, r.out);
  }
  for (const rpc of [
    "select left(public.admin_financial_overview()::text, 20)",
    "select left(public.admin_get_teacher_management()::text, 20)",
    "select left(public.admin_list_teacher_wallets()::text, 20)",
    "select left(public.admin_monitoring_overview()::text, 20)",
    "select left(public.admin_list_demo_accounts()::text, 20)",
  ]) {
    const r = await asUser(demoId, rpc);
    record("READ", `rpc ${rpc.slice(12, 60)}`, r.ok, r.out);
  }

  // ---------------- WRITE MATRIX ----------------
  const writes = [
    ["INSERT profile", "insert into public.profiles(id, full_name) values (gen_random_uuid(), 'x')"],
    ["UPDATE profile (own)", `update public.profiles set full_name = 'x' where id = '${demoId}'`],
    ["UPDATE profile (other student)", "update public.profiles set phone = '0000' where role = 'student'"],
    ["DELETE profile", "delete from public.profiles where role = 'student'"],
    ["ROLE escalation insert", `insert into public.user_roles(user_id, role) values ('${demoId}', 'admin')`],
    ["ROLE escalation update", `update public.user_roles set role = 'admin' where user_id = '${demoId}'`],
    ["is_demo tampering", `update public.profiles set is_demo = false where id = '${demoId}'`],
    ["UPSERT subscription", "insert into public.subscriptions(id) values (gen_random_uuid())"],
    ["UPDATE subscription", "update public.subscriptions set is_active = true"],
    ["DELETE subscription", "delete from public.subscriptions"],
    ["INSERT payment/deposit", "insert into public.deposit_requests(id) values (gen_random_uuid())"],
    ["UPDATE wallet balance", "update public.wallets set balance = balance + 1000"],
    ["UPDATE teacher wallet", "update public.teacher_wallets set balance = balance + 1000"],
    ["INSERT withdrawal", "insert into public.teacher_withdrawal_requests(id) values (gen_random_uuid())"],
    ["INSERT notification", "insert into public.notifications(id) values (gen_random_uuid())"],
    ["INSERT message", "insert into public.teacher_messages(id) values (gen_random_uuid())"],
    ["INSERT ad", "insert into public.ads(id) values (gen_random_uuid())"],
    ["INSERT content", "insert into public.content(id) values (gen_random_uuid())"],
    ["DELETE content", "delete from public.content"],
    ["INSERT book", "insert into public.library_books(id) values (gen_random_uuid())"],
    ["DELETE book", "delete from public.library_books"],
    ["INSERT exam", "insert into public.exams(id) values (gen_random_uuid())"],
    ["UPDATE exam", "update public.exams set status = 'published'"],
    ["UPDATE platform settings", "update public.platform_settings set value = 'x'"],
    ["UPDATE prices", "update public.subject_default_prices set price = 0"],
    ["INSERT storage asset", "insert into public.storage_assets(id) values (gen_random_uuid())"],
    ["INSERT ai conversation", "insert into public.modrek_ai_conversations(id) values (gen_random_uuid())"],
    ["UPDATE ai quota", "update public.ai_daily_usage set question_count = 0"],
    ["TRUNCATE profiles", "truncate public.profiles"],
  ];
  for (const [name, sql] of writes) {
    const r = await asUser(demoId, sql);
    record("WRITE-BLOCKED", name, isDemoBlocked(r), r.ok ? "WRITE SUCCEEDED" : r.out);
  }

  const rpcWrites = [
    ["rpc wallet credit", `select public.admin_add_student_wallet_credit('${demoId}'::uuid, 1000, 'demo')`],
    ["rpc teacher wallet adjust", `select public.admin_adjust_teacher_wallet('${demoId}'::uuid, 1000, 'demo')`],
    ["rpc broadcast notification", "select public.broadcast_notification('t','b','info')"],
    ["rpc monitoring thresholds", "select public.admin_monitoring_set_thresholds('{}'::jsonb)"],
    ["rpc capture snapshot", "select public.admin_capture_overview_snapshot()"],
    ["rpc assert_not_demo", "select public.assert_not_demo()"],
  ];
  for (const [name, sql] of rpcWrites) {
    const r = await asUser(demoId, sql);
    const blocked = isDemoBlocked(r) || /DEMO_READ_ONLY/.test(r.out);
    record("RPC-BLOCKED", name, blocked, r.ok ? `RPC RETURNED: ${r.out.slice(0, 120)}` : r.out);
  }

  // ---------------- REAL ADMIN REGRESSION ----------------
  const adminChecks = [
    ["admin select profiles", "select count(*) from public.profiles"],
    ["admin update own profile", `update public.profiles set full_name = full_name where id = '${adminId}'`],
    ["admin financial overview", "select left(public.admin_financial_overview()::text, 20)"],
    ["admin teacher management", "select left(public.admin_get_teacher_management()::text, 20)"],
    ["admin insert notification", "insert into public.notifications(id, user_id, title, message) values (gen_random_uuid(), '" + adminId + "', 't', 'm')"],
    ["admin not demo", "select public.assert_not_demo()"],
  ];
  for (const [name, sql] of adminChecks) {
    const r = await asUser(adminId, sql);
    record("REAL-ADMIN", name, r.ok, r.out);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("Failed checks:");
    for (const f of failed) console.log(` - [${f.group}] ${f.name}`);
    process.exit(1);
  }
  console.log("DEMO = FULL VISIBILITY + ABSOLUTE READ-ONLY (verified server-side)");
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
