# Architecture Rules

- `zoom_live_credentials.live_session_id` is the table primary key and explicit upsert conflict target, because each live session owns exactly one server-only Zoom credential row.- Production (modrekplus.com) schema changes must also be placed in `scripts/production-migrations/` (timestamped SQL), because the production workflow only runs `supabase db push` and Lovable migrations land in `drizzle/migrations`.
- A failed `zoom_live_credentials` write is non-fatal in `zoom-live`, because credentials are re-read from Zoom on join and a class must never be ended by a cache failure.
- `zoom-live` and `zoom-webhook` are pre-deployed to production before migrations run, because a failing `db push` previously left live classes on stale server code.
