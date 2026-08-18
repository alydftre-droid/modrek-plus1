// Automated SEO / indexability audit for every public route.
//
//   node scripts/seo-audit.mjs                     -> audits https://modrekplus.com
//   node scripts/seo-audit.mjs http://localhost:8080
//
// Checks, per URL: HTTP status (404 / 5xx), redirects and redirect chains,
// unintended noindex, canonical correctness (self-referencing, absolute, same host),
// missing/duplicate <title>, missing/duplicate <h1>, sitemap coverage in both
// directions, and duplicate titles across pages.
// Exit code 1 when any error-level issue is found.

import { seoPages, staticRoutes, noindexRoutes, SITE_URL } from "../src/content/seoPages.js";

const base = (process.argv[2] || SITE_URL).replace(/\/$/, "");
const CONCURRENCY = 6;

/** Public routes that must be indexable. */
const indexableRoutes = [
  ...staticRoutes.map((r) => r.path),
  ...seoPages.map((p) => p.slug),
  "/teacher/terms",
];

/** Intentional redirects: source -> final destination. */
const expectedRedirects = {
  "/privacy": "/privacy-policy",
  "/terms": "/terms-of-service",
  "/teacher-terms": "/teacher/terms",
  "/account/delete": "/delete-account",
  "/education/azhari": "/education/secondary-azhari",
  "/education/general": "/education/secondary-general",
  "/complete-profile": "/select-education-type",
  "/subject-ai-chat": "/ai",
};

const issues = [];
const add = (level, url, message) => issues.push({ level, url, message });

const pick = (html, re) => {
  const m = html.match(re);
  return m ? m[1].trim() : null;
};

async function fetchDoc(path) {
  const res = await fetch(`${base}${path}`, { redirect: "manual", headers: { "user-agent": "ModrekPlus-SEO-Audit" } });
  const html = res.status >= 300 && res.status < 400 ? "" : await res.text();
  return { status: res.status, location: res.headers.get("location"), html };
}

async function auditIndexable(path) {
  const { status, location, html } = await fetchDoc(path);
  if (status === 404) return add("error", path, "returns 404 but is listed as a public indexable page");
  if (status >= 500) return add("error", path, `server error ${status}`);
  if (status >= 300 && status < 400) {
    return add("error", path, `indexable page redirects (${status}) to ${location}`);
  }
  if (status !== 200) return add("error", path, `unexpected status ${status}`);

  const titles = html.match(/<title>[\s\S]*?<\/title>/gi) || [];
  if (titles.length === 0) add("error", path, "missing <title>");
  if (titles.length > 1) add("error", path, `${titles.length} <title> tags (expected 1)`);

  const robots = pick(html, /<meta\s+name="robots"\s+content="([^"]*)"/i) || "";
  if (/noindex/i.test(robots)) add("error", path, `unintended noindex ("${robots}")`);

  const canonicals = html.match(/<link\s+rel="canonical"[^>]*>/gi) || [];
  if (canonicals.length === 0) add("error", path, "missing canonical");
  else if (canonicals.length > 1) add("error", path, `${canonicals.length} canonical tags (expected 1)`);
  else {
    const href = pick(canonicals[0], /href="([^"]+)"/i) || "";
    const expected = `${SITE_URL}${path === "/" ? "/" : path}`;
    if (href.replace(/\/$/, "") !== expected.replace(/\/$/, "")) {
      add("error", path, `canonical points to ${href} instead of ${expected}`);
    }
  }

  const h1s = html.match(/<h1[\s>]/gi) || [];
  if (h1s.length === 0) add("error", path, "missing <h1> in server HTML");
  if (h1s.length > 1) add("warn", path, `${h1s.length} <h1> tags in server HTML`);

  const desc = pick(html, /<meta\s+name="description"\s+content="([^"]*)"/i);
  if (!desc) add("error", path, "missing meta description");
  const og = pick(html, /<meta\s+property="og:title"\s+content="([^"]*)"/i);
  if (!og) add("warn", path, "missing og:title");

  // Rendering: real content, not just a loading shell.
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (bodyText.length < 400) {
    add("error", path, `server HTML has only ${bodyText.length} chars of text (client-side-only rendering)`);
  }

  return { path, title: titles[0] || null };
}

async function auditRedirect(from, to) {
  const first = await fetchDoc(from);
  if (first.status < 300 || first.status >= 400) {
    return add("warn", from, `expected a redirect to ${to} but got ${first.status} (SPA-side redirect only)`);
  }
  const target = new URL(first.location, base);
  if (target.pathname !== to) add("error", from, `redirects to ${target.pathname}, expected ${to}`);
  const second = await fetchDoc(target.pathname);
  if (second.status >= 300 && second.status < 400) {
    add("error", from, `redirect chain: ${from} -> ${target.pathname} -> ${second.location}`);
  } else if (second.status !== 200) {
    add("error", from, `redirect target ${target.pathname} returns ${second.status}`);
  }
}

async function auditNoindex(path) {
  const { status, html } = await fetchDoc(path);
  if (status !== 200) return;
  const robots = pick(html, /<meta\s+name="robots"\s+content="([^"]*)"/i) || "";
  if (!/noindex/i.test(robots)) {
    add("warn", path, "private route has no noindex in the server HTML (client-side only)");
  }
}

async function auditSitemap() {
  const res = await fetch(`${base}/sitemap.xml`);
  if (!res.ok) {
    add("error", "/sitemap.xml", `status ${res.status}`);
    return [];
  }
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const paths = [];
  for (const loc of locs) {
    let url;
    try {
      url = new URL(loc);
    } catch {
      add("error", "/sitemap.xml", `invalid URL in sitemap: ${loc}`);
      continue;
    }
    if (url.origin !== SITE_URL) add("error", "/sitemap.xml", `sitemap URL on wrong host: ${loc}`);
    paths.push(url.pathname.replace(/(.+)\/$/, "$1"));
  }
  const dupes = paths.filter((p, i) => paths.indexOf(p) !== i);
  if (dupes.length) add("error", "/sitemap.xml", `duplicate entries: ${[...new Set(dupes)].join(", ")}`);
  for (const p of paths) {
    if (!indexableRoutes.includes(p)) add("error", "/sitemap.xml", `URL not a known public indexable route: ${p}`);
    if (noindexRoutes.includes(p)) add("error", "/sitemap.xml", `noindex route present in sitemap: ${p}`);
  }
  for (const p of indexableRoutes) {
    if (!paths.includes(p)) add("error", "/sitemap.xml", `public route missing from sitemap: ${p}`);
  }
  return paths;
}

async function auditRobots() {
  const res = await fetch(`${base}/robots.txt`);
  if (!res.ok) return add("error", "/robots.txt", `status ${res.status}`);
  const txt = await res.text();
  const globalBlock = txt.split(/^user-agent:/im).find((b) => b.trim().startsWith("*"));
  const disallows = [...(globalBlock || "").matchAll(/^\s*disallow:\s*(\S*)\s*$/gim)].map((m) => m[1]);
  if (disallows.includes("/")) add("error", "/robots.txt", "Disallow: / blocks the whole site");
  for (const route of indexableRoutes) {
    const blocked = disallows.find((d) => d && route.startsWith(d));
    if (blocked) add("error", "/robots.txt", `"Disallow: ${blocked}" blocks public route ${route}`);
  }
  if (!/^sitemap:/im.test(txt)) add("warn", "/robots.txt", "no Sitemap: directive");
}

async function pool(items, worker) {
  const results = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (i < items.length) results.push(await worker(items[i++]));
    }),
  );
  return results;
}

async function notFoundCheck() {
  const probe = "/__seo_audit_missing_page__";
  const { status, html } = await fetchDoc(probe);
  const robots = pick(html, /<meta\s+name="robots"\s+content="([^"]*)"/i) || "";
  if (status === 200 && !/noindex/i.test(robots)) {
    add("error", probe, "unknown URL returns an indexable 200 (soft 404) — Google treats it as a duplicate");
  } else if (status === 200) {
    console.log("note   unknown URLs return a noindex SPA shell (200) — acceptable for this SPA host");
  } else if (status !== 404) add("warn", probe, `unknown URL returns ${status}`);
}

console.log(`\n=== SEO audit: ${base} ===\n`);

const sitemapPaths = await auditSitemap();
await auditRobots();
await notFoundCheck();
const pages = (await pool(indexableRoutes, auditIndexable)).filter(Boolean);
await pool(Object.entries(expectedRedirects), ([from, to]) => auditRedirect(from, to));
await pool(noindexRoutes, auditNoindex);

const titleMap = new Map();
for (const p of pages) {
  if (!p?.title) continue;
  const list = titleMap.get(p.title) || [];
  list.push(p.path);
  titleMap.set(p.title, list);
}
for (const [title, paths] of titleMap) {
  if (paths.length > 1) add("error", paths.join(", "), `duplicate <title>: ${title}`);
}

console.log(`public indexable routes : ${indexableRoutes.length}`);
console.log(`sitemap URLs            : ${sitemapPaths.length}`);
console.log(`intentional redirects   : ${Object.keys(expectedRedirects).length}`);
console.log(`intentional noindex     : ${noindexRoutes.length}\n`);

const errors = issues.filter((i) => i.level === "error");
const warns = issues.filter((i) => i.level === "warn");
for (const i of [...errors, ...warns]) console.log(`${i.level === "error" ? "ERROR" : "warn "}  ${i.url}  ${i.message}`);
console.log(`\n${errors.length} error(s), ${warns.length} warning(s)\n`);
process.exit(errors.length ? 1 : 0);
