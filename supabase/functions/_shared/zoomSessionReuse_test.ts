import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shouldReuseZoomMeeting } from "./zoomSessionReuse.ts";

Deno.test("a missing Zoom meeting is not reused only because the local class is recent", () => {
  assertEquals(shouldReuseZoomMeeting("missing", false), false);
});

Deno.test("a missing Zoom meeting is reused only when Zoom explicitly reports it live", () => {
  assertEquals(shouldReuseZoomMeeting("missing", true), true);
});

Deno.test("an unknown lookup keeps a running class safe during a transient Zoom outage", () => {
  assertEquals(shouldReuseZoomMeeting("unknown", null), true);
});