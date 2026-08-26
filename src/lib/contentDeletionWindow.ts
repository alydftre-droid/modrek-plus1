/**
 * Teacher content deletion window (24 hours).
 *
 * Teachers may delete a lesson video / book they uploaded inside a group only
 * within 24 hours of the upload time (server timestamp `content.created_at`).
 * After that the delete button is hidden entirely and the server (RLS trigger +
 * `delete_group_content` RPC) rejects the request.
 *
 * Developers/admins can always delete, regardless of age.
 */
export const TEACHER_DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinTeacherDeleteWindow(
  createdAt: string | Date | null | undefined,
  now: Date | number = Date.now(),
): boolean {
  if (!createdAt) return false;
  const created = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  const nowMs = now instanceof Date ? now.getTime() : now;
  return nowMs - created <= TEACHER_DELETE_WINDOW_MS;
}

/** Whether the delete button should be rendered at all. */
export function canDeleteTeacherContent(params: {
  createdAt: string | Date | null | undefined;
  isAdminMode: boolean;
  now?: Date | number;
}): boolean {
  if (params.isAdminMode) return true;
  return isWithinTeacherDeleteWindow(params.createdAt, params.now ?? Date.now());
}
