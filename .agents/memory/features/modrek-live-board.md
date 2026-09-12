---
name: Modrek Live Board
description: In-platform teacher whiteboard for live classes (file upload + drawing) synced to students via live_boards
type: feature
---
Live explanation happens on "سبورة مدرك" inside the platform, not on Zoom whiteboard/screen-share (unsupported in Android WebView).

- Table `public.live_boards` (PK `group_id`): `teacher_id`, `session_id`, `file_ref` (bstorage://), `file_kind` = blank|image|pdf, `page`, `page_count`, `strokes` jsonb, `is_open`.
- RLS: teacher owner of `content_groups` manages own row; students with `student_group_purchases` on the group get SELECT only; admins full. Demo write-block trigger attached. Table is in `supabase_realtime` publication with REPLICA IDENTITY FULL.
- UI: `src/components/live/ModrekLiveBoard.tsx` — teacher uploads image/PDF to Bunny via `uploadFile({scope:{kind:"course",id:groupId},category:"live-board"})`, PDF rendered with pdfjs, ink drawn on overlay canvas with normalized 0..1 coords, persisted debounced (400ms) via upsert. Students subscribe to postgres_changes and render read-only.
- Entry points in `src/components/live/LiveTabContent.tsx`: teacher card always visible; student card only while `is_open` is true.
