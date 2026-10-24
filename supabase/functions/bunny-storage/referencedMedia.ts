/** Check references through the caller's RLS client, never a service client. */
export async function canReadReferencedMedia(
  sb: { from: (table: string) => any },
  filePath: string,
  cdnHostname: string,
): Promise<boolean> {
  const refs = [`bstorage://${filePath}`];
  if (cdnHostname) refs.push(`https://${cdnHostname}/${filePath}`);
  const checks = [
    { table: "teacher_profiles", columns: ["photo_url", "cover_image_url", "video_url"], id: "teacher_id" },
    { table: "profiles", columns: ["avatar_url"], id: "id" },
    { table: "teacher_messages", columns: ["file_url"], id: "id" },
    { table: "support_messages", columns: ["file_url"], id: "id" },
    // Teachers upload these into their own folder; students reach them only
    // through rows their RLS already lets them see (active groups, purchases).
    { table: "content_groups", columns: ["image_url"], id: "id" },
    { table: "live_session_recordings", columns: ["video_url"], id: "id" },
    { table: "ai_lesson_pages", columns: ["image_url"], id: "id" },
  ];
  for (const check of checks) {
    for (const column of check.columns) {
      const { data, error } = await sb.from(check.table).select(check.id).in(column, refs).limit(1);
      if (!error && Array.isArray(data) && data.length > 0) return true;
    }
  }
  return false;
}