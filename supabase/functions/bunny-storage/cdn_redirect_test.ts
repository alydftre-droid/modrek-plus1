import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("redirect is gated, reversible and never applied to teacher intros", () => {
  assertStringIncludes(source, 'if (flag === "off") return false;');
  assertStringIncludes(source, 'Boolean(Deno.env.get("BUNNY_CDN_TOKEN_KEY"))');
  assertStringIncludes(source, 'if (isTeacherIntro) return false;');
  assertStringIncludes(source, 'url.searchParams.get("noredirect") === "1"');
  assertStringIncludes(source, '"X-Modrek-Delivery": "cdn-redirect"');
  // Access control must still run before any redirect is issued.
  const accessIdx = source.indexOf("canReadStoredFile(userClient, filePath, userId)");
  const redirectIdx = source.indexOf("canRedirectDownload(req, url, isTeacherIntro)");
  assert(accessIdx > -1 && redirectIdx > accessIdx);
});

Deno.test("only browser media primitives are redirected (fetch/XHR keeps proxy)", () => {
  const fn = source.slice(source.indexOf("function canRedirectDownload"));
  for (const dest of ["image", "video", "audio", "iframe", "document"]) {
    assertStringIncludes(fn, `"${dest}"`);
  }
  assert(!fn.includes('dest === "empty"'));
});

Deno.test("bunny token signature matches the documented algorithm", async () => {
  const tokenKey = "test-key";
  const filePath = "library/u/f.pdf";
  const expires = 1234567890;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${tokenKey}/${filePath}${expires}`),
  );
  const token = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  assertEquals(token.length, 43);
  assert(!/[+/=]/.test(token));
  assertStringIncludes(source, "`${tokenKey}/${filePath}${expires}`");
});
