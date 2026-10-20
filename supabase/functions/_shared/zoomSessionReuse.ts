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
/** Classify a GET /meetings/{id} response. Zoom code 4711 means the app lacks
 * the meeting:read scope — it says nothing about the meeting, so it must stay
 * "unknown" (reuse with stored credentials) instead of "missing" (close the
 * running class and open a new meeting the students are not in). */
export function classifyZoomMeetingLookup(input: {
  ok: boolean;
  status: number;
  zoomCode?: unknown;
  hostMatches?: boolean;
}): ZoomMeetingState {
  if (input.ok) return input.hostMatches ? "match" : "other_host";
  if (Number(input.zoomCode) === 4711) return "unknown";
  if (input.status === 404 || input.status === 400) return "missing";
  return "unknown";
}
