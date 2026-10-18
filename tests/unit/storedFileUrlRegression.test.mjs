import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../../src/hooks/useStoredFileUrl.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function resolveDuringRender(value, result, legacyBucket) {
  let stateCalls = 0;
  const exports = {};
  const requireStub = (name) => {
    if (name === "react") return {
      useState: () => stateCalls++ === 0 ? [0, () => {}] : [result, () => {}],
      useEffect: () => {},
    };
    if (name === "@/lib/storage") return {
      isBunnyStorageFile: (value) => typeof value === "string" && value.startsWith("bstorage://"),
    };
    if (name === "@/integrations/supabase/client") return {};
    throw new Error(`Unexpected dependency: ${name}`);
  };
  new Function("require", "exports", compiled)(requireStub, exports);
  return exports.useStoredFileUrl(value, true, 0, legacyBucket);
}

test("a teacher without a photo has no resolved URL and does not crash", () => {
  assert.equal(resolveDuringRender(undefined, undefined), undefined);
  assert.equal(resolveDuringRender(null, undefined), undefined);
});

test("the matching stored photo returns its resolved URL", () => {
  assert.equal(resolveDuringRender("bstorage://photo", {
    value: "bstorage://photo", url: "https://example.test/photo",
  }), "https://example.test/photo");
});

test("switching photos never displays the previous stored URL", () => {
  assert.equal(resolveDuringRender("bstorage://new", {
    value: "bstorage://old", url: "https://example.test/old",
  }), undefined);
});

test("public URLs remain usable before resolution, but private references do not", () => {
  assert.equal(resolveDuringRender("https://example.test/photo", undefined), "https://example.test/photo");
  assert.equal(resolveDuringRender("bstorage://photo", undefined), undefined);
  assert.equal(resolveDuringRender("photo", undefined, "private"), undefined);
});