import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../../src/lib/zoomMirrorGuard.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = {};
new Function("exports", compiled)(mod);
const { unmirrorTransform } = mod;

test("front-camera self view flipped with rotateY(180deg) is restored", () => {
  assert.equal(unmirrorTransform(" rotateY(180deg)"), " rotateY(0deg)");
});

test("WebRTC self view flipped with a DOMMatrix scale(-1,1) is restored", () => {
  assert.equal(unmirrorTransform("matrix(-1, 0, 0, 1, 0, 0)"), "matrix(1, 0, 0, 1, 0, 0)");
});

test("students' copy flipped from the teacher's mirror metadata is restored", () => {
  assert.equal(unmirrorTransform("scaleX(-1.25)scaleY(1.25)"), "scaleX(1.25)scaleY(1.25)");
});

test("back camera (not mirrored) keeps Zoom's scaling and rotation untouched", () => {
  assert.equal(unmirrorTransform("scaleX(1.5)scaleY(1.5) rotate(90deg)"), "scaleX(1.5)scaleY(1.5) rotate(90deg)");
  assert.equal(unmirrorTransform("matrix(0, 1, -1, 0, 0, 0)"), "matrix(0, 1, -1, 0, 0, 0)");
});
