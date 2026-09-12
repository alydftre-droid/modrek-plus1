---
name: Demo Accounts Read-Only Security Boundary
description: Demo accounts see everything but every write is blocked by DB triggers + edge guards; identity from profiles.is_demo/demo_accounts only
type: constraint
---
- Demo accounts = full read visibility of the real platform (no page, button or data hidden) + ABSOLUTE read-only. Never implement demo restrictions by hiding UI.
- Demo identity is resolved server-side only via `public.current_user_is_demo()` → `profiles.is_demo` or `demo_accounts.user_id` keyed on `auth.uid()`. Never email, JWT metadata, headers or localStorage.
- DB boundary: `assert_not_demo()` (raises `DEMO_READ_ONLY`, SQLSTATE 42501), `block_demo_write()`, triggers `zzz_demo_read_only` + `zzz_demo_read_only_truncate` on every public table (290 triggers), and event trigger `zzz_demo_read_only_autoattach` for new tables. Migrations: `drizzle/migrations/0032_demo_read_only_boundary.sql`, `0033_demo_safe_read_rpcs.sql`. Applied on preview AND production (`qteuqfntsocsdbjmdvmr`).
- Read RPCs that used to bootstrap-write (`admin_financial_overview`, `admin_list_teacher_wallets`, `get_exam_review_questions`) skip their INSERT when `current_user_is_demo()`.
- Edge boundary: `supabase/functions/_shared/demoGuard.ts` (`blockDemoWrites`, `isDemoUserId`) returns 403 `DEMO_READ_ONLY`. Blanket guard on 26 mutating functions; action-selective guards keep reads working in `bunny-storage`, `bunny-stream`, `zoom-live`, `library-admin`, `admin-teacher-scope`. Any NEW mutating edge function must call the guard.
- Frontend `src/lib/demoReadOnly.ts` only shows the Arabic toast; it is never the protection.
- Verify with `node scripts/test-demo-read-only.mjs` (rolled-back transactions, 71 checks). Full report: `docs/DEMO_READ_ONLY_SECURITY.md`.
