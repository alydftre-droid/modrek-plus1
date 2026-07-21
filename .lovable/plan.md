# Financial Control Center — Enterprise Rebuild

Rebuild the developer withdrawal/wallet admin into a full 2026 financial control center, without breaking any existing wallet, earnings, archive, or withdrawal-request logic.

## Discovery (before writing code)
Audit and confirm, then reuse — do not duplicate:
- Tables: `teacher_wallets`, `teacher_earning_records`, `teacher_monthly_archives`, `teacher_wallet_transactions`, `teacher_withdrawal_requests`, `wallet_adjustments`, `platform_settings`, `subscriptions`, `student_group_purchases`, `content_groups`, `teacher_profiles`, `profiles`.
- RPCs: `archive_teacher_period`, `archive_all_teachers_period`, `auto_archive_if_due`, `teacher_request_withdrawal`, `admin_get_withdrawal_dashboard`.
- Cron: existing `auto_archive_if_due` schedule.

## Database (additive migration, no destructive changes)
1. `platform_settings` seeds (idempotent): `withdrawal_open_hour`, `withdrawal_open_minute`, `withdrawal_manual_state`, `withdrawal_open_day`, `withdrawal_last_release_at`.
2. New table `financial_audit_logs` (actor, action, target_teacher_id, old_value jsonb, new_value jsonb, reason, ip, created_at) — RLS admin-only, with GRANTs.
3. Harden `auto_archive_if_due` to respect hour+minute and set `withdrawal_last_release_at` atomically (advisory lock) to prevent double execution.
4. New admin RPCs (SECURITY DEFINER, admin-check + audit-log inserts):
   - `admin_financial_overview()` — returns platform-wide KPIs (totals, counts, monthly revenue, commissions, top teacher, averages, subs count, paying students).
   - `admin_manual_wallet_action(teacher_id, action, amount, reason)` — transfer/adjust/freeze/unfreeze/bonus/penalty/reverse; writes to `teacher_wallet_transactions` + `financial_audit_logs`, sends notification.
   - `admin_list_audit_logs(filters, pagination)`.
   - `admin_teacher_monthly_statement(teacher_id, period_label)` — returns full archive detail (already stored in `teacher_monthly_archives.breakdown`).
5. Notifications on monthly-closing + withdrawal state changes via existing `notifications` insert pattern.

## Frontend
Replace `src/components/admin/settings/WithdrawalSettings.tsx` mount with a new multi-tab **Financial Control Center**:

```
src/components/admin/financial/
  FinancialControlCenter.tsx      (shell + tabs, glass header, live clock)
  tabs/OverviewTab.tsx            (KPI grid, revenue chart, top teachers)
  tabs/ClosingScheduleTab.tsx     (day/time pickers, countdown, instant-close, last-run)
  tabs/WithdrawalsTab.tsx         (requests table: filters/search, approve/reject → existing RPCs, emergency stop toggle)
  tabs/TeachersWalletsTab.tsx     (per-teacher wallets table, drill-in to monthly statements + manual actions dialog)
  tabs/AuditLogTab.tsx            (timeline of financial_audit_logs, filters, export CSV)
  components/KpiCard.tsx, StatSpark.tsx, ConfirmActionDialog.tsx, ManualActionDialog.tsx
```

Teacher-side `TeacherWalletPage.tsx`: keep working; extend archive detail view to render full `breakdown` (groups, students, per-group revenue/commission, adjustments, refunds).

## UX principles
- Semantic tokens only (no hardcoded colors); glass cards; skeletons; Recharts (already in project) for charts; RTL preserved; mobile-first.
- Every mutating action → confirm dialog → optimistic toast → audit log entry.
- All KPIs from real Supabase queries; no placeholder zeros.

## Safety
- Additive DB only. No column drops, no policy loosening.
- Advisory-lock closings to prevent duplicate archive.
- Reuse `archive_teacher_period` / `archive_all_teachers_period` — do not fork.
- Existing `teacher_request_withdrawal` and cron remain untouched in behavior.

## Rollout
1. Migration (tables + RPCs + hardening).
2. Frontend Financial Control Center.
3. Teacher wallet statement enrichment.
4. Verify: run instant closing on staging teacher, inspect archive row + audit log + notification.
