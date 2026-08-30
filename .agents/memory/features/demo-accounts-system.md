---
name: Demo Accounts System (Admin only)
description: Admin-only demo accounts (admin/teacher/student) isolated from production data via profiles.is_demo and the admin-demo-accounts edge function
type: feature
---
- Admin-only UI: إعدادات لوحة المطور ← «حسابات الديمو» (`src/pages/admin/DemoAccountsPage.tsx`, also at route `/admin/demo-accounts`). No public/demo page exists for students or teachers.
- DB: `profiles.is_demo boolean not null default false`, registry table `public.demo_accounts` (user_id, email, label, role, is_active, created_by, last_login_at, last_password_reset_at), audit table `public.demo_account_audit_logs`. RLS: admin-only SELECT, all writes via service_role only.
- Helpers: `public.is_demo_account(uuid)`; `public.is_test_student(uuid)` now also returns true for `is_demo` → demo students are hidden from every teacher-facing query and never counted in commissions/statistics.
- Demo teachers are only discoverable by demo users and admins (`teacher_profiles` "Public can view approved profiles" policy filters `is_demo_account(teacher_id)`).
- Trigger `prevent_demo_flag_tampering` on profiles: only service_role or admins may set/change `is_demo`.
- Admin read RPCs: `admin_list_demo_accounts()`, `admin_list_demo_audit_logs(int)` — both call `assert_admin_caller()`.
- All mutations go through edge function `admin-demo-accounts` (actions: create, seed_defaults, reset_password, update_email, update_role, set_active, delete, impersonate). It validates the JWT via `auth.getUser()` + admin role in `user_roles`, and refuses callers whose own profile `is_demo` (no escalation loop). Impersonating a demo admin is refused.
- Passwords are never stored in the DB; generated in the edge function, written to Supabase Auth, returned once for copy. Reset generates a new one.
- Disable = `ban_duration` on auth user + `profiles.is_banned` (account preserved). Default demo emails: demo.admin@ / demo.teacher@ / demo.student@modrekplus.demo — created only when the admin presses «إنشاء حسابات الديمو الافتراضية».
- Demo profiles also carry `is_test_account = true` so all pre-existing test-account exclusions (stats, reports, wallets, earnings) apply automatically.
