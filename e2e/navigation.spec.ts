import { test, expect } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./_helpers";

test.describe("navigation", () => {
  test("mobile drawer opens, closes on Escape, and does not leak scroll", async ({ page }, info) => {
    test.skip(!info.project.name.startsWith("mobile"), "mobile only");
    await page.goto("/");
    const toggle = page.locator("header button").first();
    await toggle.click();
    const drawer = page.locator(".drawer");
    await expect(drawer).toBeVisible();
    await expectNoHorizontalOverflow(page, "drawer open");
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden({ timeout: 3000 });
  });

  test("drawer closes after navigating", async ({ page }, info) => {
    test.skip(!info.project.name.startsWith("mobile"), "mobile only");
    await page.goto("/");
    await page.locator("header button").first().click();
    await page.locator(".drawer a").first().click();
    await expect(page.locator(".drawer")).toBeHidden({ timeout: 3000 });
  });

  test("the sticky contact bar is not hidden behind the mobile tab bar", async ({ page }, info) => {
    test.skip(!info.project.name.startsWith("mobile"), "mobile only");
    await page.goto("/pandits", { waitUntil: "networkidle" });
    const first = page.locator("a[href^='/pandits/']").first();
    if (!(await first.count())) test.skip(true, "no pandits seeded");
    await first.click();
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(500);

    const bar = page.locator(".contact-bar");
    if (!(await bar.count())) test.skip(true, "no contact bar on this build");
    // Regression guard for UI-001: bar must stack above .bottom-nav (z 95).
    const z = await bar.evaluate((el) => parseInt(getComputedStyle(el).zIndex || "0", 10));
    expect(z, "contact bar must outrank .bottom-nav (z-index 95)").toBeGreaterThan(95);
    const box = await bar.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  });

  test("direct URL access works without arriving from another page", async ({ page }) => {
    for (const r of ["/temples", "/pandits", "/services", "/pandit-login"]) {
      const res = await page.goto(r, { waitUntil: "domcontentloaded" });
      expect(res?.status(), `${r} direct load`).toBeLessThan(400);
      await expect(page.locator("main")).toBeVisible();
    }
  });
});
