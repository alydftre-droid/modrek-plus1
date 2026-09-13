# Demo Accounts — Absolute Read-Only Security Boundary

Demo accounts are an exact mirror of the live platform for **viewing**: no page,
button, menu, teacher, student, subscription, payment, course, book, exam,
report or setting is hidden. Every **write** is refused by the backend.

Nothing depends on frontend code. All enforcement is database-side and
edge-function-side; changing JavaScript, using DevTools, Postman, curl, the REST
API or RPC endpoints cannot bypass it.

## 0. Root cause of the 2026-09 breach (demo could rename teachers/students)

The database triggers were in place, but **both demo accounts on production had
`profiles.is_demo = false` and no `demo_accounts` row**: account creation in
`admin-demo-accounts` was not atomic, so a failure after the auth user was
created left a fully privileged NORMAL account behind. `current_user_is_demo()`
therefore returned `false` and every trigger let the writes through.

Closed at the source (`drizzle/migrations/0036_demo_identity_hardening.sql`):

1. `public.is_demo_email()` + an email fallback inside
   `current_user_is_demo()` — any `@modrekplus.demo` account is demo even if
   the registry row is missing.
2. Row trigger `zzy_force_demo_flag` on `public.profiles` forces
   `is_demo`/`is_test_account` for demo-domain accounts on every insert/update.
3. Backfill: existing demo profiles flagged, missing `demo_accounts` rows
   inserted.
4. `createDemoAccount` is now all-or-nothing: any failed step deletes the auth
   user again, and creation verifies `is_demo = true` before returning.

## 1. Identity (never client-controlled)

`public.current_user_is_demo()` resolves the caller from `auth.uid()` only, and
matches it against:

- `public.profiles.is_demo = true`
- `public.demo_accounts.user_id`
- `auth.users.email` ending in `@modrekplus.demo`

Email supplied by the client, JWT metadata, headers and `localStorage` are never
used.

## 2. Database layer (primary boundary)

Applied on production and preview (`drizzle/migrations/0032_demo_read_only_boundary.sql`):

| Object | Purpose |
| --- | --- |
| `public.current_user_is_demo()` | Registry-backed demo detection |
| `public.assert_not_demo()` | Raises `DEMO_READ_ONLY`, SQLSTATE `42501` |
| `public.block_demo_write()` | `SECURITY DEFINER` trigger function |
| `zzz_demo_read_only` | Statement trigger for INSERT / UPDATE / DELETE on **all 145 public tables** |
| `zzz_demo_read_only_truncate` | Statement trigger for TRUNCATE on all public tables |
| `zzz_demo_read_only_autoattach` | Event trigger — auto-guards every future public table |

Total: **290 triggers**. Because the guard sits at the table boundary, it also
blocks writes made *through* `SECURITY DEFINER` RPCs, views and functions.
Service-role / cron connections (`auth.uid()` is NULL) are unaffected.

`drizzle/migrations/0033_demo_safe_read_rpcs.sql` makes read RPCs that contained
idempotent bootstrap writes demo-safe (`admin_financial_overview`,
`admin_list_teacher_wallets`, `get_exam_review_questions`) — they now skip the
write when the caller is a demo account, so demo keeps full read access.

## 3. Edge function layer

`supabase/functions/_shared/demoGuard.ts` validates the bearer token with
Supabase Auth, resolves the user id server-side, checks the demo registry with
the service role, and returns `403 { code: "DEMO_READ_ONLY" }` before any work.

- **Blanket guard (26 functions):** admin-create-platform-teacher,
  admin-delete-student, admin-manage-teacher, admin-remove-teacher-grade,
  ai-provider-admin, bunny-orphan-cleanup, delete-my-account,
  developer-impersonate, external-sync, grade-essay, library-analyze-region,
  library-chat, library-explain, library-quiz, library-recommendations,
  modrek-ai-exams, modrek-ai-study, modrek-reason, modrek-retry, modrek-upload,
  send-content-notification, send-push-notification, support-assistant,
  teacher-assistant, teacher-intro-media, voice-answer.
- **Action-selective guards (reads preserved):**
  - `bunny-storage` — blocks create-upload-session, upload, upload-chunk,
    finalize-upload, delete. `download` and health stay available.
  - `bunny-stream` — blocks create-video, delete-video, reencode.
    sign-playback, sign-thumbnail, video-status, get-video stay available.
  - `zoom-live` — blocks start, join, leave, end. capabilities/diagnostics stay.
  - `library-admin` — blocks create, update, publish, retry_*, hide, pause,
    resume, delete, worker_tick. stats, list, get, book_progress, taxonomy stay.
  - `admin-teacher-scope` — blocks `save`, allows `load`.
- **Added 2026-09 (blanket guard):** ai-diagnostics, library-v2-enqueue,
  library-v2-dispatcher, library-v2-worker, library-worker, modrek-worker,
  openrouter-tts, process-email-queue, auto-cancel-withdrawals,
  lesson-schedule-reminder, subscription-expiry-notify. Cron/service-role
  callers carry no user token and pass through unchanged.
- Intentionally unguarded: `library-search` and `modrek-retrieve` are read paths
  whose only writes are internal search caches/logs, so demo keeps full AI read
  access.
- `admin-demo-accounts` already refuses callers whose own profile is demo, so a
  demo admin cannot create, delete, disable, impersonate or reset accounts.

Auth mutations (email, password, role, metadata, deletion, invitations) run
through these guarded functions or the guarded tables, so they fail for demo.

## 4. Storage layer

Bunny.net is the only file store and its credentials exist only server-side.
Every upload/replace/delete passes through `bunny-storage` / `bunny-stream`,
both guarded above, so demo can view and download but never write, delete,
move, rename or change metadata.

## 4b. Platform information (the only hidden screen)

`platform_settings` writes now require `NOT current_user_is_demo()`, and the
sensitive keys (Supabase URL/anon key, worker shared keys, developer contact
details) are readable by real admins only — demo sees just the 31 public keys.
In the interface, «معلومات المنصة» is removed from the settings menu for demo
and blocked when opened directly («هذه الصفحة غير متاحة لحسابات المعاينة»).
Service-role keys and third-party secrets never reach the frontend at all.

## 5. Frontend (cosmetic only)

`src/lib/demoReadOnly.ts` turns any `DEMO_READ_ONLY` backend response into one
Arabic toast: «حساب المعاينة يعمل بوضع المشاهدة فقط ولا يمكنه إجراء تغييرات.»
No UI element is hidden or disabled.

## 6. Test results — `scripts/test-demo-read-only.mjs`

Run against production inside rolled-back transactions (no data changed):
**71/71 checks passed.**

- READ (30): all admin-facing tables and admin RPCs readable by demo.
- WRITE-BLOCKED (29): inserts, updates, deletes, upserts and TRUNCATE on
  profiles, user_roles (privilege escalation), `is_demo` tampering,
  subscriptions, deposits, wallets, withdrawals, notifications, messages, ads,
  content, books, exams, platform settings, prices, storage assets, AI tables —
  all rejected with `DEMO_READ_ONLY` / `42501`.
- RPC-BLOCKED (6): wallet credit, teacher wallet adjust, broadcast
  notification, monitoring thresholds, snapshot capture, `assert_not_demo`.
- REAL-ADMIN (6): real admin reads and writes unaffected.
- Regression: real teacher and real student reads and writes unaffected.

Typecheck (`tsgo --noEmit`), build and the Bunny-only storage guard all pass.
