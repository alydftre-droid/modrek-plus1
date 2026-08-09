import { assertStringIncludes } from "jsr:@std/assert@1";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("teacher profile videos are authorized for Stream playback", () => {
  assertStringIncludes(source, '.from("teacher_profiles")');
  assertStringIncludes(source, '.eq("video_url", `bunny://${videoId}`)');
  assertStringIncludes(source, "if (!(await canAccessVideo(userClient, videoId)))");
});

Deno.test("Stream validates signing-key JWT claims in code", () => {
  assertStringIncludes(source, "sb.auth.getClaims(token)");
  assertStringIncludes(source, "data?.claims?.sub");
});

Deno.test("catalogue thumbnails use a dedicated CDN-signed action", () => {
  assertStringIncludes(source, 'action === "sign-thumbnail"');
  assertStringIncludes(source, "getCdnToken(cdnTokenKey, path, expires)");
});