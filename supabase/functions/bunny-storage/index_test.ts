import { assert, assertStringIncludes } from "jsr:@std/assert@1";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("teacher intro playback remains allowed and versioned", () => {
  assertStringIncludes(source, '"content/teacher-intros/"');
  assertStringIncludes(source, "return true;");
  assertStringIncludes(source, 'const FUNCTION_VERSION = "teacher-media-playback-v4-2026-07-31"');
});

Deno.test("all download failures expose trace and service version", () => {
  assertStringIncludes(source, "function diagnosticJsonResponse");
  assertStringIncludes(source, '"X-Modrek-Function-Version": FUNCTION_VERSION');
  assertStringIncludes(source, '"X-Modrek-Trace-Id": traceId');
  assertStringIncludes(source, 'reason: "ACCESS_RULE_NO_MATCH"');
  assertStringIncludes(source, 'reason: "UPSTREAM_OBJECT_MISSING"');
});

Deno.test("teacher intros are read from authenticated storage origin", () => {
  assertStringIncludes(source, "isTeacherIntro ? storageUrl : cdnUrl");
  assertStringIncludes(source, "isTeacherIntro ? upstreamHeaders");
  assert(source.includes('Range: "bytes=0-1023"'));
});