# Teacher Platforms production recovery

- [x] Identify the database and backend URL used by production.
- [x] Inspect production PostgreSQL objects and migration history.
- [x] Audit repository migrations and frontend RPC contracts.
- [x] Add the missing Teacher Platforms migrations to the production migration path.
- [x] Restore the admin list flow to `admin_list_teacher_platforms()` with no frontend fallback.
- [ ] Apply migrations to the production database through the deployment workflow.
- [ ] Verify PostgreSQL objects, grants, RLS, storage policies, and PostgREST cache in production.
- [ ] Run authenticated production create/list/logo/subject/relationship test and clean up test data.
