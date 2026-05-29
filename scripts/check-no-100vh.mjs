#!/usr/bin/env node
/**
 * حارس وقت البناء: يمنع استخدام `100vh` المباشر في الصفحات الحرجة (الشاشات الكاملة على الجوال).
 * يسمح به فقط داخل `src/index.css` كقيمة fallback مع `100dvh` بعدها مباشرة.
 *
 * الاستخدام: node scripts/check-no-100vh.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.cwd();
const CRITICAL_DIRS = [
  "src/pages",
  "src/components/student",
  "src/components/teacher",
  "src/components/live",
];
const EXTS = new Set([".tsx", ".ts", ".css"]);
const PATTERN = /\b100vh\b/;

const offenders = [];

function walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (EXTS.has(extname(entry))) scan(full);
  }
}

function scan(file) {
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    if (!PATTERN.test(line)) return;
    // السماح إذا كان السطر التالي يحتوي 100dvh (fallback نمط)
    const next = lines[i + 1] || "";
    if (/100dvh|var\(--app-vh\)/.test(next) || /100dvh|var\(--app-vh\)/.test(line)) return;
    offenders.push(`${file}:${i + 1}: ${line.trim()}`);
  });
}

for (const dir of CRITICAL_DIRS) walk(join(ROOT, dir));

if (offenders.length) {
  console.error("\n❌ استخدام 100vh ممنوع في الصفحات الحرجة. استبدله بـ 100dvh أو var(--app-vh):\n");
  for (const o of offenders) console.error("  " + o);
  console.error(`\nالإجمالي: ${offenders.length} مخالفة\n`);
  process.exit(1);
}

console.log("✅ لا توجد مخالفات 100vh في الصفحات الحرجة.");
