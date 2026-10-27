# Architecture Rules

- Stored media hooks must narrow the resolved-result object before reading its URL, because an undefined source can match an undefined result field during initial rendering.
- Lazy route boundaries must rethrow the original non-chunk exception, because replacing it hides the failing component's cause from diagnostics.

- Stored media hooks must await auth, refresh on session/network changes and retry failed image delivery without a CDN redirect, because cached expired or anonymous URLs must not permanently hide photos.
- Owner-folder profile and chat media may be shared only through references visible to the caller's RLS client, because uploader ownership alone excludes recipients while broad folder access leaks private files.
- Chat images open in an in-app dialog rather than navigating the native webview to a protected binary URL, because navigation loses the chat and can fail on Android.

- `zoom_live_credentials.live_session_id` is the table primary key and explicit upsert conflict target, because each live session owns exactly one server-only Zoom credential row.
- Production (modrekplus.com) schema changes must also be placed in `scripts/production-migrations/` (timestamped SQL), because the production workflow only runs `supabase db push` and Lovable migrations land in `drizzle/migrations`.
- A failed `zoom_live_credentials` write is non-fatal in `zoom-live`, because credentials are re-read from Zoom on join and a class must never be ended by a cache failure.
- `zoom-live` and `zoom-webhook` are pre-deployed to production before migrations run, because a failing `db push` previously left live classes on stale server code.
- Reuse a Zoom meeting only when Zoom still recognizes it as live, never from local session age alone, because an instant meeting can end as soon as its only host leaves.
- Credential refresh failure must preserve a reusable Zoom session and use its host-matched server cache or return a retryable error, because closing it also closes student attendance and the live board.
- Zoom Client View is initialised with `leaveRedirect: false`, and automatic chunk-error reloads skip foreign-origin errors and open live classes, because any page reload drops the host and ends the class for students.
- Zoom mirroring is removed by `src/lib/zoomMirrorGuard.ts` (strips only horizontal flips from Zoom's inline video transforms, for host and attendees) plus `ZoomMtg.mirrorVideo(false)`; never add a blanket CSS flip, because Zoom mirrors the front camera on the self view and on every receiver via stream metadata, and re-enables it on each camera switch.
- Live classes create scheduled Zoom meetings (type 2) and treat Zoom code 4711 (missing read scope) as an unknown lookup, because instant meetings die with the host and a scope error is not proof that a meeting ended.
- Live class recordings are captured in the teacher's browser (`src/lib/liveRecorder.ts`) and saved on end, because the Zoom host plan has no cloud recording.
- Bunny orphan cleanup is report-only (server refuses `dry_run:false`), because its reference scan missed most tables and permanently deleted in-use teacher photos and group images in 2026-10.
- Media uploaded into a user's owner folder and shown to others must be listed in `bunny-storage/referencedMedia.ts`, because the proxy only lets non-owners read owner-folder files through an RLS-visible reference.
