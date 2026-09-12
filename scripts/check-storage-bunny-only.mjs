#!/usr/bin/env node
/**
 * Guard: every new file/image/media upload must go through the unified Bunny
 * storage service (`src/lib/storage`). Direct Supabase Storage uploads are not
 * allowed anymore — PostgreSQL only keeps references.
 *
 * Reading legacy values (createSignedUrl / getPublicUrl / remove) is still
 * allowed so old links keep resolving.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src", "supabase/functions"];
const ALLOWLIST = new Set([
  // The unified service itself and legacy resolvers.
  "src/lib/storage/index.ts",
  "src/lib/privateStorage.ts",
]);
const UPLOAD_PATTERNS = [
  /\.storage\s*\n?\s*\.?\s*from\([^)]*\)\s*\n?\s*\.upload\(/,
  /\.storage\.from\([^)]*\)\.upload\(/,
  /storage\/v1\/upload\/resumable/,
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

const offenders = [];
for (const root of ROOTS) {
  let files = [];
  try { files = walk(root); } catch { continue; }
  for (const file of files) {
    const rel = file.replaceAll("\\", "/");
    if (ALLOWLIST.has(rel)) continue;
    const src = readFileSync(file, "utf8");
    if (UPLOAD_PATTERNS.some((re) => re.test(src))) offenders.push(rel);
  }
}

if (offenders.length > 0) {
  console.error("\n[storage] Direct Supabase Storage uploads are not allowed. Use @/lib/storage (Bunny):");
  for (const f of offenders) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("[storage] OK — all uploads go to Bunny.");
