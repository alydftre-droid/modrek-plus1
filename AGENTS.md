# Architecture Rules

- Stored media hooks must await auth, refresh on session/network changes and retry failed image delivery without a CDN redirect, because cached expired or anonymous URLs must not permanently hide photos.
- Owner-folder profile and chat media may be shared only through references visible to the caller's RLS client, because uploader ownership alone excludes recipients while broad folder access leaks private files.
- Chat images open in an in-app dialog rather than navigating the native webview to a protected binary URL, because navigation loses the chat and can fail on Android.

- `zoom_live_credentials.live_session_id` is the table primary key and explicit upsert conflict target, because each live session owns exactly one server-only Zoom credential row.
- Production (modrekplus.com) schema changes must also be placed in `scripts/production-migrations/` (timestamped SQL), because the production workflow only runs `supabase db push` and Lovable migrations land in `drizzle/migrations`.
- A failed `zoom_live_credentials` write is non-fatal in `zoom-live`, because credentials are re-read from Zoom on join and a class must never be ended by a cache failure.
- `zoom-live` and `zoom-webhook` are pre-deployed to production before migrations run, because a failing `db push` previously left live classes on stale server code.
- Reuse a Zoom meeting only when Zoom still recognizes it as live, never from local session age alone, because an instant meeting can end as soon as its only host leaves.
- Credential refresh failure must preserve a reusable Zoom session and use its host-matched server cache or return a retryable error, because closing it also closes student attendance and the live board.
