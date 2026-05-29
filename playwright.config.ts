import { defineConfig, devices } from "@playwright/test";

/**
 * اختبارات الانحدار البصري لمنصة مدرك Plus
 * تختبر الصفحات الحرجة على أحجام هواتف متعددة وتلتقط لقطات شاشة
 * وتفشل عند اكتشاف قص أفقي أو تداخل في الترويسة.
 */
export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ar",
    timezoneId: "Africa/Cairo",
  },

  projects: [
    { name: "iphone-se",   use: { ...devices["iPhone SE"],     viewport: { width: 320, height: 568 } } },
    { name: "android-360", use: { ...devices["Pixel 5"],       viewport: { width: 360, height: 800 } } },
    { name: "iphone-12",   use: { ...devices["iPhone 12"],     viewport: { width: 390, height: 844 } } },
    { name: "redmi-15",    use: { ...devices["Pixel 5"],       viewport: { width: 412, height: 915 } } },
    { name: "iphone-max",  use: { ...devices["iPhone 13 Pro"], viewport: { width: 430, height: 932 } } },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
