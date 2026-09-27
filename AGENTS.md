# Architecture Rules

- `zoom_live_credentials.live_session_id` is the table primary key and explicit upsert conflict target, because each live session owns exactly one server-only Zoom credential row.