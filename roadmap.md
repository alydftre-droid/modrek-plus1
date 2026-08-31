# Teacher Platforms production recovery

- [x] Identify the database and backend URL used by production.
- [x] Inspect production PostgreSQL objects and migration history.
- [x] Audit repository migrations and frontend RPC contracts.
- [x] Add the missing Teacher Platforms migrations to the production migration path.
- [x] Restore the admin list flow to `admin_list_teacher_platforms()` with no frontend fallback.
- [x] Apply the six missing migrations to the production database and record them in migration history.
- [x] Verify PostgreSQL objects, grants, RLS, storage policies, and PostgREST cache in production.
- [x] Run authenticated production create/list/logo/subject/relationship tests and clean up all temporary data.
- [x] Add `/admin/platforms` to the Vercel SPA rewrite allowlist after direct-route verification exposed a 404.
