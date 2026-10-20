import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyZoomMeetingLookup, shouldRefreshZoomCredentials, shouldReuseZoomMeeting } from "./zoomSessionReuse.ts";

Deno.test("a missing Zoom meeting is not reused only because the local class is recent", () => {
  assertEquals(shouldReuseZoomMeeting("missing", false), false);
});

Deno.test("a missing Zoom meeting is reused only when Zoom explicitly reports it live", () => {
  assertEquals(shouldReuseZoomMeeting("missing", true), true);
});

Deno.test("an unknown lookup keeps a running class safe during a transient Zoom outage", () => {
  assertEquals(shouldReuseZoomMeeting("unknown", null), true);
});

Deno.test("credentials are not refreshed by repeating a failed missing meeting lookup", () => {
  assertEquals(shouldRefreshZoomCredentials("missing"), false);
});

Deno.test("credentials are not refreshed during an unknown Zoom API outage", () => {
  assertEquals(shouldRefreshZoomCredentials("unknown"), false);
});

Deno.test("credentials are refreshed after Zoom directly confirms the meeting", () => {
  assertEquals(shouldRefreshZoomCredentials("match"), true);
});

Deno.test("a missing Zoom read permission (4711) never counts as an ended meeting", () => {
  assertEquals(classifyZoomMeetingLookup({ ok: false, status: 400, zoomCode: 4711 }), "unknown");
  assertEquals(shouldReuseZoomMeeting("unknown", null), true);
});

Deno.test("a real 404 from Zoom still counts as an ended meeting", () => {
  assertEquals(classifyZoomMeetingLookup({ ok: false, status: 404, zoomCode: 3001 }), "missing");
});
