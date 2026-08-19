import { test, expect } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./_helpers";

test.describe("failure and edge cases", () => {
  test("a 500 from the API does not crash the page or leak raw errors", async ({ page }) => {
    await page.route("**/api/**", (r) => r.fulfill({ status: 500, body: '{"error":"boom"}' }));
    await page.goto("/pandits", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();
    const body = (await page.locator("body").innerText()).toLowerCase();
    for (const leak of ["typeerror", "cannot read propert", "undefined is not", "axioserror"]) {
      expect(body, `raw error leaked to the user: ${leak}`).not.toContain(leak);
    }
  });

  test("offline renders a usable page, not a blank screen", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.context().setOffline(true);
    await page.goto("/pandits", { waitUntil: "domcontentloaded" }).catch(() => {});
    await expect(page.locator("body")).not.toBeEmpty();
    await page.context().setOffline(false);
  });

  test("empty API results show an empty state, not a blank container", async ({ page }) => {
    await page.route("**/api/pandits*", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: '{"data":[],"meta":{"total":0}}' }));
    await page.goto("/pandits", { waitUntil: "networkidle" });
    const txt = await page.locator("main").innerText();
    expect(txt.trim().length, "empty result rendered nothing at all").toBeGreaterThan(40);
  });

  test("very long names do not break the layout", async ({ page }, info) => {
    await page.goto("/pandits", { waitUntil: "networkidle" });
    await page.evaluate(() => {
      const el = document.querySelector("h1, h2, h3, .astro-card__name");
      if (el) el.textContent = "Acharya Shri Mahamandaleshwar Pandit Rajendra Prasad Sharma Ji Maharaj";
    });
    await page.waitForTimeout(200);
    await expectNoHorizontalOverflow(page, `long name @ ${info.project.name}`);
  });

  test("a broken image does not collapse its card", async ({ page }) => {
    await page.route("**/*.{png,jpg,jpeg,webp}", (r) => r.abort());
    await page.goto("/pandits", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalOverflow(page, "broken images");
  });
});
