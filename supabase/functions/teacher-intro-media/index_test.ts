import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("teacher intro media is isolated to historical intro paths", () => {
  assertStringIncludes(source, "content\\/teacher-intros?");
  assertStringIncludes(source, "BUNNY_STORAGE_API_KEY");
  assertStringIncludes(source, "getClaims(token)");
});

Deno.test("teacher intro media exposes diagnostics and byte ranges", () => {
  assertStringIncludes(source, "teacher-intro-media-v1-2026-07-31");
  assertStringIncludes(source, "X-Modrek-Trace-Id");
  assertStringIncludes(source, '"Accept-Ranges": "bytes"');
});