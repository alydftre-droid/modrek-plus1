---
name: Developer Test Student System
description: Permanent developer-only test student accounts (18) hidden from teachers with impersonation via magic link
type: feature
---
- 18 permanent test student accounts seeded in `auth.users` + `profiles` with `is_test_account=true` and unique `test_account_code` (AZH-PREP-1 … GEN-SEC3-LIT).
- Codes and grouping: 9 Azhar (3 prep + 6 sec sci/lit) + 9 General (3 prep + GEN-SEC1 + GEN-SEC2-SCI/LIT + GEN-SEC3-SCIENCE/MATH/LIT).
- Each account has a wallet with 10000 test balance.
- `public.is_test_student(uuid)` security-definer helper used in all teacher-facing RLS to fully hide test students (student_group_purchases, exam_attempts, video_progress, student_activity_logs, teacher_messages, student_teacher_choices).
- Triggers `block_earning_for_test_student` on `teacher_earning_records` and `block_teacher_wallet_tx_for_test_student` on `teacher_wallet_transactions` silently skip inserts for test students → no commission ever counted for teachers.
- Trigger `prevent_test_flag_tampering` prevents any client from setting/changing `is_test_account` / `test_account_code`; only service_role or admins can. Migration/superuser context (no JWT, no auth.uid) is allowed.
- Edge function `developer-impersonate` (admin-only, super admin `alyedaft@gmail.com` OR admin role): validates caller, generates magic link via `admin.generateLink`, exchanges token_hash → session, returns tokens. Logs impersonation to `student_activity_logs` as `developer_impersonate`.
- Frontend: `src/lib/devImpersonation.ts` stashes original session in localStorage, calls `setSession` with new tokens; `endImpersonation` restores original. `DeveloperImpersonationBanner` shows sticky warning bar with return button. Page `/admin/test-students` (`DeveloperTestStudentsPage`) lists grouped cards with "Login As" button.
- Sidebar button "حسابات الطلاب التجريبية" added in AdminDashboard.
- View `public.developer_test_students` exposes the list to admins via RLS.
