import { test, expect, type Page } from "@playwright/test";

/**
 * صفحات عامة (لا تتطلب تسجيل دخول) — تُلتقط لها لقطات شاشة على كل المقاسات
 * مع التحقق من عدم وجود قص أفقي أو ترويسة مقصوصة من الأعلى.
 */
const PUBLIC_PAGES = [
  { path: "/auth",            name: "auth" },
  { path: "/forgot-password", name: "forgot-password" },
  { path: "/about",           name: "about" },
  { path: "/privacy-policy",  name: "privacy" },
  { path: "/terms-of-service",name: "terms" },
];

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return {
      docScroll: doc.scrollWidth,
      docClient: doc.clientWidth,
      bodyScroll: body.scrollWidth,
      bodyClient: body.clientWidth,
    };
  });
  // نسمح بـ 1 بكسل تسامح للتقريب
  expect(overflow.docScroll, "Document horizontal overflow").toBeLessThanOrEqual(overflow.docClient + 1);
  expect(overflow.bodyScroll, "Body horizontal overflow").toBeLessThanOrEqual(overflow.bodyClient + 1);
}

async function assertHeaderNotClipped(page: Page) {
  // نبحث عن أي ترويسة ثابتة ونتأكد أن الجزء العلوي لا يُقص بواسطة status bar
  const result = await page.evaluate(() => {
    const headers = Array.from(
      document.querySelectorAll<HTMLElement>(
        'header, [role="banner"], .mobile-app-header, .mobile-app-page-fixed'
      )
    );
    return headers.map((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        top: rect.top,
        height: rect.height,
        position: style.position,
        visible: rect.height > 0 && style.visibility !== "hidden" && style.display !== "none",
      };
    });
  });
  for (const h of result) {
    if (!h.visible) continue;
    // الترويسة الثابتة يجب ألا تبدأ بقيمة سالبة (تعني أنها مقصوصة من الأعلى)
    expect(h.top, "Header clipped from top").toBeGreaterThanOrEqual(-1);
  }
}

for (const pageInfo of PUBLIC_PAGES) {
  test.describe(`صفحة ${pageInfo.name}`, () => {
    test(`تعرض بدون قص أو تداخل`, async ({ page }, testInfo) => {
      await page.goto(pageInfo.path, { waitUntil: "networkidle" });
      // إعطاء وقت قصير للخطوط والرسوم المتحركة
      await page.waitForTimeout(500);

      await assertNoHorizontalOverflow(page);
      await assertHeaderNotClipped(page);

      await page.screenshot({
        path: `playwright-report/screenshots/${pageInfo.name}-${testInfo.project.name}.png`,
        fullPage: true,
      });
    });
  });
}

test.describe("التحقق من قاعدة 100vh", () => {
  test("الصفحات الحرجة تستخدم dvh بدلاً من 100vh", async ({ page }) => {
    await page.goto("/auth");
    const usesStaticVh = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll<HTMLElement>("*"));
      return all.some((el) => {
        const inline = el.getAttribute("style") || "";
        return /\b100vh\b/.test(inline) && !/100dvh|var\(--app-vh\)/.test(inline);
      });
    });
    expect(usesStaticVh, "وُجد استخدام 100vh مباشر — استخدم 100dvh أو var(--app-vh)").toBe(false);
  });
});
