import { test, expect } from "@playwright/test";
import { PUBLIC_ROUTES, trackConsoleErrors } from "./_helpers";

test.describe("console hygiene", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} logs no console errors`, async ({ page }) => {
      const errors = trackConsoleErrors(page);
      await page.goto(route, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      expect(errors, `${route}: ${errors.join(" | ")}`).toHaveLength(0);
    });
  }

  test("no duplicate API calls on the home page", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (r) => { if (r.url().includes("/api/")) calls.push(r.url()); });
    await page.goto("/", { waitUntil: "networkidle" });
    const dupes = calls.filter((u, i) => calls.indexOf(u) !== i);
    expect(dupes, `duplicated: ${[...new Set(dupes)].join(", ")}`).toHaveLength(0);
  });
});
