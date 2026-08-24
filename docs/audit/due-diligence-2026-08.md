# Modrek Plus — Full Due Diligence (Technical / Product / Security / Business)

Date: 2026-08-24 · Perspective: hostile professional acquirer · No code changes were made.

## 0. Verdict

**NEGOTIATE (acquire only as an asset purchase, at an asset price, with escrowed conditions).**
Not BUY: revenue is ~nil and one security hole invalidates the core marketplace trust model.
Not DO NOT BUY: the engineering substance is real and rebuilding it would cost far more than the fair price.

## 1. Scorecard

| Area | Score /100 |
|---|---|
| Architecture | 52 |
| Database & RLS | 55 |
| Security | 42 |
| Code quality / maintainability | 38 |
| AI / RAG (as experienced by a real student) | 41 |
| Student experience | 68 |
| Teacher system | 48 |
| Admin / developer panel | 74 |
| Android / Capacitor readiness | 68 |
| DevOps / SEO / observability | 60 |
| Documentation | 30 |
| Product-market traction | 18 |
| **Weighted overall** | **≈ 49 / 100** |

## 2. Hard facts (production DB `qteu…`, measured, not estimated)

- 115k+ lines TS/TSX, 50 edge functions, 656 migrations, 130 public tables, 420 RLS policies, ~6.6k commits.
- Users: 421 profiles (374 students, 44 teachers). Growth: 4 (Apr) → 20 → 39 → 99 → 258 (Aug) — real acceleration.
- **30-day active students: 53** of 374 (14% MAU/registered).
- Revenue to date: 27 approved deposits = **5,440 EGP** lifetime; **2** group purchases = **530 EGP** recognised. Effectively pre-revenue.
- Content: 104 content items, 104 exams, 42 groups, 58 exam attempts.
- Library/RAG: 9,320 chunks over **16 sources**; 96% embedded (374 chunks stuck unembedded); 2 sources permanently `failed`; job failure rate 18.8%.
- `modrek_search_logs` (n=309): **86.7% zero-result**, 86.4% fell back to external model knowledge, **0% cache hits**.
- Lint: 0 tsgo errors but **1,975 ESLint errors** (1,912 `no-explicit-any`), 1,266 raw `any`, 556 `as any`, 8 `rules-of-hooks` violations.
- 25 files > 700 lines (`WithdrawalSettings` 2,221 · `StudentSubjectView` 1,894 · `TeacherWalletPage` 1,852 · `AdminDashboard` 1,850 · `useAuth` hook 1,143).

## 3. Deal-blocking findings (must be fixed before close)

1. **Teacher approval is cosmetic (CRITICAL).** `handle_new_user` grants `user_roles.teacher` at signup; **no RLS policy anywhere references `teacher_requests`** (verified: zero policies match). INSERT on `content`, `exams`, `content_groups` requires only `has_role(teacher)`. An unapproved/rejected teacher can insert live content, exams and groups straight from the browser, bypassing `TeacherProtectedRoute`. This breaks the marketplace's core trust guarantee.
2. **23 of 50 edge functions run `verify_jwt = false`** while holding the service-role key (`ai-chat`, `bunny-storage`, `modrek-retrieve`, `grade-essay`, …). Any auth weakness inside one of them is a full-database exposure path.
3. **`get_email_by_phone` is SECURITY DEFINER and executable by `anon`** → email/phone harvesting of the whole user base. Phone login also enumerates accounts via distinct toasts.
4. **No AI rate limiting or per-user cost ceiling.** Embeddings + chat + failover retries, zero caching, unauthenticated-reachable functions = uncapped financial exposure. This is the single most likely way a new owner loses money on day one.
5. **Hardcoded god-mode admin emails inside `has_role()` SQL** (plus mirrored in frontend) — not revocable without a migration, invisible to audit.
6. Supabase linter: `security_definer_view`, `function_search_path_mutable`, `anon_security_definer_function_executable` still open.
7. Student ban only flips `profiles.is_banned` client-side (teacher ban correctly uses `auth.admin` + global signOut) — banned students keep live sessions.

## 4. What is genuinely valuable (do not discount this)

- Real backend, not UI theatre: server-side answer stripping for exams, `submit_exam_attempt_resilient`, anti-cheat telemetry, signed Bunny playback + thumbnails, wallet/RPC recharge, financial month-close snapshots, audit logs, FCM with a custom Android service, account-deletion flow (Play-compliant).
- Correct isolation where money lives: `teacher_wallets`, `teacher_wallet_transactions`, `teacher_earning_records`, `teacher_messages` are strictly `auth.uid()`-scoped.
- Admin panel (74/100) is backed by ~15 real RPCs and 8+ edge functions; impersonation is deliberately limited to synthetic test accounts.
- Arabic/RTL and curriculum modelling (عام/أزهر, tracks, terms) is first-class, dialect-normalising, and hard to replicate.
- RAG *engineering* would score 75-80 in isolation (hybrid vector+trigram, lesson-lock, hallucination-honest prompts). The failure is data coverage, not design.
- Android hygiene: API 36, R8, env-based signing, deliberate Play-policy manifest tuning.

## 5. Product / business reality

- The product is built for a full K-12 curriculum matrix but indexed for ~one grade-subject cluster; junk sources (`تجربي1`, a CV) pollute production.
- Monetisation works mechanically but is unproven: 2 purchases lifetime. There is no evidence of willingness to pay at scale.
- Defensibility: low. No proprietary data moat; the moat is the Arabic curriculum modelling + 8 months of integration grind.
- Key-person risk: extreme. One author, undocumented debt (0 TODOs across 115k lines), no tests beyond a thin Playwright/visual layer.

## 6. Valuation

Method: cost-to-rebuild, discounted for remediation and near-zero revenue. Revenue multiples are inapplicable (LTM revenue ≈ 5.4k EGP).

- Rebuild cost at senior contractor rates (~10-14 dev-months of *usable* output): **$45k–$70k**.
- Remediation to production-trustworthy (security 1-7, `any` sweep at the DB boundary, RAG content coverage, cost caps): **$12k–$20k**.
- Traction premium: ~0. Brand/app-store presence + 421 users + Play listing: **$3k–$6k**.

**Fair asset value: $28,000 – $42,000.** Sanity ceiling with a clean security remediation delivered by the seller pre-close: **$55,000**.
Anything priced on "115k lines / 50 functions / AI platform" narrative is a pass.

## 7. Conditions I would attach to any offer

1. Seller fixes findings 1-4 and re-runs the security scan clean, verified by me, before funds release.
2. 30% escrow for 90 days against undisclosed security/data incidents.
3. Seller-assisted transition (60 days), including a written architecture handover for `useAuth`, the dual `library_*` / `knowledge_*` pipelines, and the two-shell Vercel rewrite map.
4. Written warranty that no other hardcoded admin backdoor exists beyond the two emails found.
5. Full AI-provider spend history and current per-day cost, plus proof of a cost cap in place at close.
6. Production data separated from test/junk sources before close.

## 8. Top 10 remediation backlog (post-close, priority order)

1. Add `teacher_requests.status='approved'` to every teacher write policy; stop granting the teacher role before approval.
2. Enable `verify_jwt` on every function that does not have a documented public reason; move service-role calls behind explicit caller-role checks.
3. Revoke `anon` execute on `get_email_by_phone`; make login errors generic.
4. Per-user + per-day AI rate limits and hard spend ceiling; wire the existing `cache_hit` semantic cache.
5. Move admin identity to `user_roles` data only; delete hardcoded emails from SQL and frontend.
6. Fix `search_path` on all definer functions; resolve the definer-view finding.
7. Server-side student ban (auth admin + global signOut), matching the teacher path.
8. Retry the 374 unembedded chunks and the 2 failed sources; cron the retry worker; alert on failure rate > 5%.
9. Content programme: index the actual curriculum until zero-result rate < 20%; return structured citations to the client.
10. Codebase hygiene: type the Supabase boundary, enforce the `qk` query-key factory (125 inline keys today), delete dead code (`src/api/updateSubscriptionSettings.js`, `src/routes/subscriptionRoutes.js`, unused `src/design-system`, `mermaid`, `livekit-client`, `html2pdf.js`), replace the vulnerable `xlsx@0.18.5`, publish `.well-known/assetlinks.json`.
