import { defineConfig, devices } from "@playwright/test";

/**
 * Run against a stack you have already started:
 *   docker compose up -d --build        (site on :8080)
 *   — or the dev servers on :5173 + :4000
 *
 *   npm i -D @playwright/test
 *   npx playwright install --with-deps
 *   E2E_BASE_URL=http://localhost:5173 npx playwright test
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "desktop-1920", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } } },
    { name: "desktop-2560", use: { ...devices["Desktop Chrome"], viewport: { width: 2560, height: 1440 } } },
    { name: "laptop-1366",  use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } } },
    { name: "tablet-1024",  use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } } },
    { name: "tablet-768",   use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "tablet-600",   use: { ...devices["Desktop Chrome"], viewport: { width: 600, height: 960 } } },
    { name: "mobile-430",   use: { ...devices["iPhone 14 Pro Max"] } },
    { name: "mobile-390",   use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } },
    { name: "mobile-360",   use: { ...devices["Pixel 5"], viewport: { width: 360, height: 640 } } },
    { name: "mobile-320",   use: { ...devices["Pixel 5"], viewport: { width: 320, height: 568 } } },
    { name: "firefox",      use: { ...devices["Desktop Firefox"] } },
    { name: "webkit",       use: { ...devices["Desktop Safari"] } },
  ],
});
