export type ZoomMeetingState = "match" | "other_host" | "missing" | "unknown";

/**
 * Reuse only a meeting that Zoom still recognizes for this host.
 * A missing meeting must never be trusted because of the local session age:
 * instant meetings can end as soon as the only host leaves.
 */
export function shouldReuseZoomMeeting(
  state: ZoomMeetingState,
  isCurrentlyLive: boolean | null,
): boolean {
  if (state === "match" || state === "unknown") return true;
  if (state === "missing") return isCurrentlyLive === true;
  return false;
}

/** A direct meeting match is the only state where another details lookup is
 * useful. For missing-but-live or unknown states it would repeat the failing
 * request and could incorrectly tear down a class that students are attending. */
export function shouldRefreshZoomCredentials(state: ZoomMeetingState): boolean {
  return state === "match";
}