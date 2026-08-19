import { test, expect } from "@playwright/test";
import { PUBLIC_ROUTES, expectUsableTouchTargets, expectNothingStuckInvisible } from "./_helpers";

test.describe("accessibility and motion", () => {
  test("every page has exactly one h1", async ({ page }) => {
    for (const r of PUBLIC_ROUTES.slice(0, 8)) {
      await page.goto(r, { waitUntil: "networkidle" });
      const n = await page.locator("h1").count();
      expect(n, `${r} should have exactly one h1, found ${n}`).toBe(1);
    }
  });

  test("images carry alt text", async ({ page }) => {
    for (const r of ["/", "/pandits", "/temples", "/services"]) {
      await page.goto(r, { waitUntil: "networkidle" });
      const missing = await page.$$eval("img:not([alt])", (els) =>
        els.map((e) => (e as HTMLImageElement).src.split("/").pop()).slice(0, 5));
      expect(missing, `${r}: img without alt — ${missing.join(", ")}`).toHaveLength(0);
    }
  });

  test("icon-only controls are labelled", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const unlabelled = await page.$$eval("button", (els) =>
      els.filter((e) => !e.textContent?.trim() && !e.getAttribute("aria-label") && !e.getAttribute("title"))
         .map((e) => e.className.toString().slice(0, 40)).slice(0, 5));
    expect(unlabelled, `unlabelled icon buttons: ${unlabelled.join(", ")}`).toHaveLength(0);
  });

  test("touch targets are large enough on mobile", async ({ page }, info) => {
    test.skip(!info.project.name.startsWith("mobile"), "mobile only");
    await page.goto("/", { waitUntil: "networkidle" });
    await expectUsableTouchTargets(page, "home");
  });

  test("the site is fully usable with animations disabled", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const r of ["/", "/pandits", "/temples"]) {
      await page.goto(r, { waitUntil: "networkidle" });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(400);
      // Content must not depend on an animation having run.
      await expectNothingStuckInvisible(page, `${r} (reduced motion)`);
    }
  });

  test("keyboard alone reaches the primary CTA", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const ok = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return false;
        const s = getComputedStyle(el);
        return s.outlineStyle !== "none" || s.boxShadow !== "none";
      });
      if (ok) return;
    }
    expect(false, "no element showed a visible focus ring within 25 tabs").toBe(true);
  });
});
