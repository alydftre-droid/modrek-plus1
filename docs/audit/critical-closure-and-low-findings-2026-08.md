# ModrekPlus — Critical Closure Investigation + Low-Severity Remediation (2026-08-24)

## 1. Where the endpoint lived and why it was Critical

Location: `supabase/functions/promo-video-login/index.ts`, deployed as the platform
edge function `POST /functions/v1/promo-video-login` on the single shared Supabase
project (`config.toml` had no entry for it, so it inherited `verify_jwt = false`).

Why Critical: it accepted an unauthenticated POST with an email ending in
`@test.modrek.local`, called `auth.admin.updateUserById` with a freshly generated
password (service-role privileges), then signed in and returned a **full Supabase
session (access + refresh token)** to the caller. Its comment claimed a
`PROMO_VIDEO_TEMP_KEY` guard, but the key was never compared. Result: any anonymous
caller on the internet could obtain a valid authenticated student session — an
authentication bypass, the highest-impact class of finding, independent of RLS.

Important architectural note: **Preview and Production share the same Supabase
project and the same functions domain.** There is no separate production
deployment for edge functions, so removing the function removes it everywhere.
Deleting it is therefore a production-effective fix, not a preview-only one.

## 2. Closure evidence (live tests against the production functions domain)

| Test | Result |
|---|---|
| `POST /functions/v1/promo-video-login` (anonymous, real payload) | `404 {"code":"NOT_FOUND"}` |
| Same, with `apikey` + `Authorization: Bearer <anon>` | `404 NOT_FOUND` |
| `GET /functions/v1/promo-video-login` | `404 NOT_FOUND` |
| Name variants `promo_video_login`, `promo-login` | `404 NOT_FOUND` |
| Control (`resolve-login-email`, a function that does exist) | `400` — proves 404s are registry-level, not a blanket network failure |

Repo/deployment sweep: `rg -i "promo.video|promo_video|PROMO_VIDEO"` across the
whole tree returns **zero** hits outside the audit documents. No route, rewrite,
`config.toml` entry, `vercel/netlify` redirect, client `functions.invoke` call, or
legacy alias references it. The function directory no longer exists; the deployed
function list is 50 functions, none of them promo-related.

## 3. Alternative paths to the same capability

The only remaining way to mint a session for a test student is
`developer-impersonate`. Verified controls: JWT signature validated through the
Data API (not just decoded), `403` unless the caller holds the `admin` role in
`user_roles`, no email allowlist, target restricted to the 18 known test codes or
a verified teacher, and every use written to `student_activity_logs` /
`teacher_activity_logs`. Live test: anonymous and anon-key calls to
`developer-impersonate`, `admin-delete-student`, `admin-teacher-scope` and
`external-sync` all return `401`.

Residual-exposure cleanup: the deleted endpoint had been overwriting test-account
passwords, so any password it had ever set was potentially known. All **18**
`@test.modrek.local` passwords were rotated to cryptographically random values.
Proof: a password grant against `gen-sec1@test.modrek.local` now returns
`400 invalid_credentials`. Sign-in history shows only 3 logins, all in July and
all consistent with developer impersonation — no evidence of abuse.

Bug found while auditing that path: `developer-impersonate` referenced an
undefined `callerEmail`, so **every impersonation audit-log write was silently
throwing** inside a best-effort `try/catch` — impersonations were happening with
no audit trail. Fixed (`callerEmail` now derived from the JWT claims) and redeployed.

## 4. New finding fixed this round (Medium)

`profiles` allowed a student to self-edit `education_type`, `stage`, `grade` and
`section` — the exact columns that drive content targeting — so a student could
retarget their own profile to view content aimed at another education type or
section. Fixed with a `BEFORE UPDATE` trigger
(`lock_profile_academic_identity`): these fields may be set once while empty (the
post-registration selection flow) and after that only admins/service_role can
change them; `role`, `is_test_account` and `test_account_code` are never
self-editable. Name editing still works.

Proof: as an `authenticated` student session, an update setting
`education_type='أزهر', section='أدبي', role='admin'` left all three unchanged
while the `full_name` change in the same statement succeeded.

## 5. Low-severity items — fixed

- **Android `allowBackup=true` → `false`**, plus `fullBackupContent="false"` and a
  new `res/xml/data_extraction_rules.xml` excluding every domain from both cloud
  backup and device-to-device transfer. Auth sessions can no longer be extracted
  from a device backup.
- **74 foreign keys without a covering index** — all indexed via a generated
  migration. Remaining count is now **0**. This removes the sequential-scan and
  cascade-delete cliff before traffic growth.
- **Legacy library books**: investigated rather than assumed. Of 9 books, 6 have
  chunks and are searchable; the 3 without chunks are all test artifacts with 0
  pages (`اختبار تشغيل مكتبة الطلاب`, `كتاب اختبار CDN Redirect` x2). Two of them
  were still `status='ready'`, i.e. a student could open an empty book and the AI
  would treat it as searchable. Demoted to `failed` /
  `processing_stage='no_searchable_content'`. There is **no real book requiring
  manual repair** — the earlier "legacy repair" caveat was overstated.
- **Real lint defects**: 8 `react-hooks/rules-of-hooks` violations fixed —
  `AnnotationOverlay.tsx` returned early above two `useMemo` calls (crashes React
  with "rendered fewer hooks than expected" whenever the annotation list empties
  mid-session), and 6 `id || React.useId()` conditional hook calls in
  `design-system/components/Form.tsx`. Also removed 9 stale `eslint-disable`
  directives that were suppressing nothing and hiding future warnings.
  `rules-of-hooks` count is now 0; TypeScript 0 errors; build OK; home/auth/
  delete-account render with zero console errors.

## 6. Remaining issues (nothing Critical, nothing High)

| Issue | Severity | Status |
|---|---|---|
| ~1955 `@typescript-eslint/no-explicit-any` errors | Low (debt) | Open — mechanical, no runtime/security impact |
| 96 `react-hooks/exhaustive-deps` warnings | Low | Open — needs per-hook judgement, must not be bulk-fixed |
| 157 "signed-in users can execute SECURITY DEFINER function" linter entries | Info | Accepted — this is the app's intended RPC surface; each authorizes internally via `assert_admin_caller()` / `has_role()` |
| 2 `anon`-executable SECURITY DEFINER helpers (term comparison) | Low | Accepted — needed by the public catalogue, no PII |
| `vector` + `pg_net` extensions in `public` schema | Low | Accepted — moving them risks breaking RAG and cron |
| `teacher-profiles` / `ads-media` public buckets | Low | Accepted — marketing media only |
| `teacher_schedules` readable by all signed-in users | Low | Open — non-sensitive (day/time slots), could be scoped later |
| AI/RAG retrieval quality on multi-lesson books | Medium (quality, not security) | Partially addressed — lesson-lock is in place, but coverage still depends on upload quality |
| Students can no longer self-correct a wrong education type | UX side effect of the fix | By design — needs an admin/support action |

## 7. Scores (deliberately conservative)

| Axis | Before this round | After |
|---|---|---|
| Security | 90 | 93 |
| Authentication & session integrity | 92 | 94 |
| Database & RLS | 90 | 92 |
| Performance & scalability | 74 | 84 |
| AI / RAG | 68 | 70 |
| Code quality | 62 | 66 |
| Mobile (Android) | 85 | 90 |
| **Overall** | **83** | **86 / 100** |

The overall figure moves only +3. Two independent real defects (an undefined
variable killing every impersonation audit log, and self-editable content-targeting
fields) were found in a subsystem that had already passed three audits. Closing the
Critical raises the security number; the repeated discovery of defects in
"already-reviewed" code keeps the process/quality numbers low. No score was raised
by reclassification — every increase above corresponds to a change verified by a
test in sections 2–5.

## 8. Verdict

**The Critical vulnerability is closed permanently**, in production, with test
evidence, no alternative unauthenticated path, and the residual credential
exposure rotated away. There is **no open Critical or High finding**.

**Production-Ready: yes** — for commercial launch and for sale. The blocking class
of risk (unauthenticated session minting, privilege escalation, financial forgery)
is closed and re-tested. What remains is quality debt and AI retrieval quality,
both of which affect user experience and maintenance cost, not data security.

Standing process control: before every release, sweep `supabase/functions/` for any
function whose code or comments contain "temp", "temporary", "debug", or
"delete after use", and confirm every function either validates a JWT or is
deliberately public. That sweep is what this investigation should not have needed.
