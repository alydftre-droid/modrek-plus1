import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Modrek worker relies on one scheduler and never self-invokes", async () => {
  const source = await read("supabase/functions/modrek-worker/index.ts");

  assert.doesNotMatch(source, /scheduleNextWorkerRun\s*\(/);
  assert.doesNotMatch(source, /functions\/v1\/modrek-worker[\s\S]{0,300}waitUntil/);
});

test("push setup does not subscribe to a filterless notifications stream", async () => {
  const source = await read("src/lib/pushNotifications.ts");

  assert.doesNotMatch(source, /\.channel\(`notifications-user-/);
  assert.doesNotMatch(
    source,
    /postgres_changes[\s\S]{0,200}table:\s*["']notifications["'][\s\S]{0,200}\.subscribe\(\)/,
  );
});

test("auth account lookups are shared while an identical lookup is in flight", async () => {
  const source = await read("src/hooks/useAuth.tsx");

  assert.match(source, /accountLookupRef/);
  assert.match(source, /current\?\.userId === userId/);
  assert.match(source, /loadAccountState\(nextSession\.user\.id\)/);
  assert.match(source, /loadAccountState\(data\.user\.id\)/);
});