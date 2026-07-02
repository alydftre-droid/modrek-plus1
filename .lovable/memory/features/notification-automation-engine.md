---
name: Notification Automation Engine
description: Backend event-driven automation, event catalog, template rendering, dispatcher, and recipient modes.
type: feature
---
Table `automated_messages` (event_key, name, title_template, message_template, notification_type, link_template, recipient_mode, delay_minutes, is_active, run_count, last_run_at). Table `automation_runs` logs each dispatch (status success/error/skipped).

Dispatcher: `public.dispatch_automation(event_key, actor_user_id, related_user_id, payload jsonb)` — SECURITY DEFINER; iterates active automations matching event_key, renders `{{key}}` templates via `render_notification_template`, resolves recipients by mode (actor / related / role_students / role_teachers / role_all), inserts into `notifications` (respecting `delay_minutes` → scheduled_at + is_sent=false).

Triggers wired: profiles insert (student.registered / teacher.registered), profiles update (user.banned / user.unbanned), teacher_requests update (teacher.approved / teacher.rejected), subscriptions insert (subscription.created), content insert type=video (content.video_uploaded). Daily cron `automation_subscription_expiry` at 09:00 calls `run_subscription_expiry_automation()` → subscription.expiring_soon (3-day window) + subscription.expired.

Event catalog + template variables live in `src/components/admin/notifications/AUTOMATION_EVENTS.ts`. Admin UI: `AutomationTab.tsx` (list + toggle + editor dialog with live preview). Notification detail route: `/admin/notifications/:id` — recipients table, read/unread filters, resend-to-unread button, CSV/Excel/PDF export via `exports.ts` (xlsx + jsPDF + html2canvas).
