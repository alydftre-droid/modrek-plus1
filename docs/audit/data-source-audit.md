# Data Source Audit — Web vs PWA vs Android

Date: 2026-07-14
Scope: Modrek Plus (React + Vite + Capacitor)

## 1. Single Supabase client (verified)

`src/integrations/supabase/client.ts` builds ONE client from
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Missing env vars
throw at build time (no silent fallback). Web (Vercel), PWA and Android
(`android.yml`) all inject the same two vars, so every platform hits the
same project (`qteuqfntsocsdbjmdvmr`), the same schema, the same RPCs, and
the same Edge Functions.

**Result:** identical backend surface across Web / PWA / Android.

## 2. Capacitor / Android bundle

- `capacitor.config.ts` → `webDir: dist` — Android loads the same Vite
  bundle that Web serves; no separate code path.
- No `server.url` override (removed) — so Android does NOT hot-load from a
  different origin.
- `allowNavigation` restricted to CDN + Jitsi; Supabase calls go through
  the JS client, not through webview navigation.

**Result:** Android renders the same React tree as Web.

## 3. Cache surfaces

| Surface | Status |
|---|---|
| React Query in-memory | Same on all platforms |
| `localStorage` `mp-rq-cache-v1` | Guarded by Wave-4 `isJsonSafe` + `shouldPersistQueryKey` |
| `IndexedDB` | Not used for API data |
| Service Worker (`public/sw.js`) | No-op cleanup worker; NEVER caches API responses |
| PWA manifest | Static, no runtime caching |
| Capacitor Preferences | Not used for API data |

**Result:** the only persistable surface is React Query localStorage, and
Wave-4 already prevents unsafe values from being written.

## 4. Query duplication survey

Ran `rg "supabase\.from\(" -l src` (summary):

- `wallets`, `teacher_wallets`, `subscriptions`, `notifications` are read
  from multiple hooks. This is acceptable *because* the shape returned is
  primitive-only (safe to persist) and the mutations invalidate the
  correct keys. But keys are strings scattered across files — risk of
  typos leading to stale cache.
- **Fix (Phase 3):** introduce `src/lib/queryKeys.ts` as the ONLY source
  of query keys used going forward.

## 5. Realtime channels

Every `.channel(...)` call scanned lives inside a `useEffect` with a
cleanup `supabase.removeChannel(channel)` (spot-checked in
`useSubscription`, teacher/student wallet pages, support chat). No leaks
detected in the audited hooks.

## 6. Known divergence risks (open)

| Risk | Mitigation |
|---|---|
| Two hooks fetching same table with different `.eq()` filters could show different numbers on different screens | Query-keys registry + `useIntegrityGuard` cross-checks hash with server |
| A future dev returning `Map`/`Set`/`Date` from a query would silently corrupt cache after restart | Wave-4 `isJsonSafe` already blocks that |
| Stale cache after schema migration | `cacheVersion.DATA_SCHEMA_VERSION` bumps invalidate everything |
| Client-side clock drift affecting subscription `end_date` checks | Server-side `integrity-check` returns canonical `now()` |

## 7. Files inspected

`src/integrations/supabase/client.ts`, `src/App.tsx`,
`src/main.tsx`, `src/lib/queryCacheGuard.ts`,
`src/lib/supabaseRuntimeGuard.ts`, `capacitor.config.ts`,
`android/app/build.gradle`, `public/sw.js`, `public/site.webmanifest`,
`vite.config.ts`, `supabase/config.toml`, all files under
`supabase/functions/_shared/`, hooks under `src/hooks/**`, and the
wallet / subscription / notifications / library page components.

## 8. Next actions (Session 2)

- Phase 2: refactor duplicate queries to shared hooks using the new
  `queryKeys` registry.
- Phase 4: Playwright parity spec that logs the same user with a Web UA
  and an Android WebView UA and diffs the rendered DOM/values on wallet,
  subscriptions, library, notifications.
- Phase 5: final report `docs/audit/final-report.md`.
