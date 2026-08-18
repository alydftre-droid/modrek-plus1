// SEO build helper.
//
//   node scripts/seo-build.mjs sitemap    -> writes public/sitemap.xml   (predev / prebuild)
//   node scripts/seo-build.mjs prerender -> writes dist/<route>/index.html (postbuild)
//
// Prerendering keeps the SPA intact: each generated file is a copy of the built
// index.html with route-specific head tags and a static, crawlable HTML version
// of the page inside <div id="root">. React replaces that markup on mount.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const { SITE_URL, SITE_NAME, OG_IMAGE, seoPages, staticRoutes, headOnlyMeta } = await import(
  new URL("../src/content/seoPages.js", import.meta.url).href
);

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ---------------------------------- sitemap --------------------------------- */

function buildSitemap() {
  const entries = [
    ...staticRoutes,
    ...seoPages.map((p) => ({ path: p.slug, changefreq: p.changefreq || "monthly", priority: p.priority || "0.7" })),
  ];
  const urls = entries.map(
    (e) =>
      `  <url>\n    <loc>${SITE_URL}${e.path === "/" ? "/" : e.path}</loc>\n` +
      (e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>\n` : "") +
      (e.priority ? `    <priority>${e.priority}</priority>\n` : "") +
      `  </url>`,
  );
  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
    ``,
  ].join("\n");
  writeFileSync(resolve(root, "public/sitemap.xml"), xml);
  console.log(`[seo] sitemap.xml written (${entries.length} urls)`);
}

/* --------------------------------- prerender -------------------------------- */

function headTags({ title, description, path }) {
  const url = `${SITE_URL}${path}`;
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:locale" content="ar_EG" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
  ].join("\n    ");
}

function jsonLdFor(page) {
  const blocks = [];
  if (page.breadcrumbs?.length)
    blocks.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: page.breadcrumbs.map((b, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: b.name,
        item: `${SITE_URL}${b.path}`,
      })),
    });
  if (page.faq?.length) {
    blocks.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return blocks
    .map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`)
    .join("\n    ");
}

function bodyFor(page) {
  const parts = [];
  if (page.breadcrumbs?.length)
  parts.push(
    `<nav aria-label="مسار التنقل"><ol>` +
      page.breadcrumbs
        .map((b, i) =>
          i === page.breadcrumbs.length - 1
            ? `<li>${esc(b.name)}</li>`
            : `<li><a href="${b.path}">${esc(b.name)}</a></li>`,
        )
        .join("") +
      `</ol></nav>`,
  );
  parts.push(`<h1>${esc(page.h1)}</h1>`);
  parts.push(`<p>${esc(page.intro)}</p>`);
  for (const s of page.sections || []) {
    parts.push(`<h2>${esc(s.h2)}</h2>`);
    if (s.body) parts.push(`<p>${esc(s.body)}</p>`);
    if (s.list) parts.push(`<ul>${s.list.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`);
    if (s.items)
      parts.push(
        s.items.map((i) => `<section><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></section>`).join(""),
      );
  }
  if (page.faq?.length) {
    parts.push(`<h2>أسئلة شائعة</h2>`);
    parts.push(page.faq.map((f) => `<section><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></section>`).join(""));
  }
  if (page.links?.length) {
    parts.push(`<h2>تصفّح أقسام المنصة</h2>`);
    parts.push(
      `<nav><ul>` +
        page.links
          .filter((l) => l.path !== (page.slug || page.path))
          .map((l) => `<li><a href="${l.path}">${esc(l.label)}</a></li>`)
          .join("") +
        `</ul></nav>`,
    );
  }
  parts.push(`<p><a href="/auth?mode=register">إنشاء حساب طالب</a> · <a href="/about">عن منصة ${esc(SITE_NAME)}</a></p>`);
  return `<main>${parts.join("\n")}</main>`;
}

function injectHead(html, tags) {
  // Replace the template title/description/canonical, then append route tags.
  let out = html
    .replace(/<title>[\s\S]*?<\/title>\n?\s*/i, "")
    .replace(/<meta\s+name="description"[^>]*>\n?\s*/i, "")
    .replace(/<link\s+rel="canonical"[^>]*>\n?\s*/i, "")
    .replace(/<meta\s+property="og:(title|description|url|type)"[^>]*>\n?\s*/gi, "")
    .replace(/<meta\s+name="twitter:(title|description|image)"[^>]*>\n?\s*/gi, "");
  return out.replace(/<\/head>/i, `  ${tags}\n  </head>`);
}

function prerender() {
  const distIndex = resolve(root, "dist/index.html");
  if (!existsSync(distIndex)) {
    console.log("[seo] dist/index.html not found — skipping prerender");
    return;
  }
  const template = readFileSync(distIndex, "utf8");
  let count = 0;

  const targets = [
    ...seoPages.map((p) => ({
      path: p.slug,
      title: p.title,
      description: p.description,
      extraHead: jsonLdFor(p),
      body: bodyFor(p),
    })),
    ...Object.entries(headOnlyMeta).map(([path, meta]) => ({
      path,
      title: meta.title,
      description: meta.description,
      extraHead: jsonLdFor({ ...meta, slug: path }),
      body: meta.h1 ? bodyFor({ ...meta, slug: path }) : "",
    })),
  ];

  for (const t of targets) {
    let html = injectHead(template, `${headTags(t)}\n    ${t.extraHead}`);
    if (t.body) {
      html = html.replace('<div id="root"></div>', `<div id="root">${t.body}</div>`);
    }
    const outDir = resolve(root, `dist${t.path}`);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, "index.html"), html);
    count++;
  }
  // SPA fallback shell for every non-prerendered path (private app routes and
  // unknown URLs). It is noindex and carries no canonical, so unknown URLs no
  // longer serve an indexable copy of the homepage (soft 404 / duplicate cluster).
  const shell = template
    .replace(/<link\s+rel="canonical"[^>]*>\n?\s*/i, "")
    .replace(
      /<meta\s+name="robots"[^>]*>/i,
      `<meta name="robots" content="noindex, follow" />`,
    )
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(SITE_NAME)}</title>`);
  writeFileSync(resolve(root, "dist/app-shell.html"), shell);
  console.log(`[seo] prerendered ${count} routes + app-shell.html`);
}

const mode = process.argv[2] || "sitemap";
if (mode === "sitemap") buildSitemap();
else if (mode === "prerender") prerender();
else {
  buildSitemap();
  prerender();
}
