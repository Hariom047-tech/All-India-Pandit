import { test, expect } from "@playwright/test";

/**
 * Regression coverage for Phase 3.2.
 *
 * The bug, reproduced manually before any code changed: opening a Temple or
 * Service detail page, switching to the Pandits tab, then pressing a real
 * browser refresh threw the visitor back to Overview. Root cause differed
 * per page — see TempleDetail.tsx / ServiceDetail.tsx / useUrlTab.ts — but
 * the fix is the same shared pattern: the active tab is derived from the
 * URL's `?tab=` on every render, not from component memory that a reload
 * destroys.
 */

test.describe("tab persistence — TempleDetail", () => {
  const TEMPLE = "/temples/maa-baglamukhi";

  test("default (no ?tab=) opens Overview", async ({ page }) => {
    await page.goto(TEMPLE, { waitUntil: "networkidle" });
    await expect(page.locator(".td-tab.is-active")).toHaveText(/Overview/);
    expect(page.url()).not.toContain("tab=");
  });

  test("clicking Pandits updates the URL and shows Pandits content", async ({ page }) => {
    await page.goto(TEMPLE, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Pandits" }).click();
    await expect(page).toHaveURL(/tab=pandits/);
    await expect(page.locator(".td-tab.is-active")).toHaveText(/Pandits/);
    await expect(page.getByText("All Pandits at this temple")).toBeVisible();
  });

  test("REGRESSION: Pandits tab survives a real browser refresh", async ({ page }) => {
    await page.goto(`${TEMPLE}?tab=pandits`, { waitUntil: "networkidle" });
    await expect(page.locator(".td-tab.is-active")).toHaveText(/Pandits/);

    await page.reload({ waitUntil: "networkidle" });

    expect(page.url(), "URL must still carry tab=pandits after reload").toContain("tab=pandits");
    await expect(page.locator(".td-tab.is-active"), "must not fall back to Overview after F5").toHaveText(/Pandits/);
    await expect(page.getByText("All Pandits at this temple")).toBeVisible();
  });

  test("a direct deep link to ?tab=pandits opens Pandits immediately, no Overview flash", async ({ page }) => {
    // Overview would never be legal here even for a single frame — the tab is
    // derived synchronously from the URL on first render (useUrlTab), so
    // Overview must never appear at all, not just "get corrected quickly".
    let sawOverview = false;
    page.on("console", () => {}); // keep the listener API warm; real check is the locator below
    const check = async () => {
      const text = await page.locator(".td-tab.is-active").textContent().catch(() => null);
      if (text?.includes("Overview")) sawOverview = true;
    };
    await page.goto(`${TEMPLE}?tab=pandits`, { waitUntil: "domcontentloaded" });
    for (let i = 0; i < 10; i += 1) {
      await check();
      await page.waitForTimeout(100);
    }
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".td-tab.is-active")).toHaveText(/Pandits/);
    expect(sawOverview, "Overview must never appear, not even transiently").toBe(false);
  });

  test("switching tabs preserves other existing query params", async ({ page }) => {
    await page.goto(`${TEMPLE}?country=IN`, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Pandits" }).click();
    await expect(page).toHaveURL(/country=IN/);
    await expect(page).toHaveURL(/tab=pandits/);
  });

  test("an invalid ?tab= value falls back to Overview without crashing", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${TEMPLE}?tab=banana`, { waitUntil: "networkidle" });
    await expect(page.locator(".td-tab.is-active")).toHaveText(/Overview/);
    expect(errors).toHaveLength(0);
  });

  for (const label of ["Gallery", "Services", "Reviews", "Location"]) {
    test(`${label} tab also survives a real refresh (not just Pandits)`, async ({ page }) => {
      await page.goto(TEMPLE, { waitUntil: "networkidle" });
      await page.getByRole("tab", { name: label }).click();
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator(".td-tab.is-active")).toHaveText(new RegExp(label));
    });
  }
});

test.describe("tab persistence — ServiceDetail", () => {
  const SERVICE = "/services/satyanarayan-akhand";

  test("default (no ?tab=) opens Overview", async ({ page }) => {
    await page.goto(SERVICE, { waitUntil: "networkidle" });
    await expect(page.locator(".sd-tabs__btn--active")).toHaveText(/Overview/);
  });

  test("clicking Pandits updates the URL", async ({ page }) => {
    await page.goto(SERVICE, { waitUntil: "networkidle" });
    await page.locator(".sd-tabs__btn", { hasText: "Pandits" }).click();
    await expect(page).toHaveURL(/tab=pandits/);
  });

  test("REGRESSION: Pandits tab survives a real browser refresh", async ({ page }) => {
    await page.goto(`${SERVICE}?tab=pandits`, { waitUntil: "networkidle" });
    await expect(page.locator(".sd-tabs__btn--active")).toHaveText(/Pandits/);

    await page.reload({ waitUntil: "networkidle" });

    expect(page.url(), "URL must still carry tab=pandits after reload").toContain("tab=pandits");
    await expect(page.locator(".sd-tabs__btn--active"), "must not fall back to Overview after F5").toHaveText(/Pandits/);
  });

  test("an invalid ?tab= value falls back to Overview without crashing", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${SERVICE}?tab=banana`, { waitUntil: "networkidle" });
    await expect(page.locator(".sd-tabs__btn--active")).toHaveText(/Overview/);
    expect(errors).toHaveLength(0);
  });

  for (const label of ["Samagri", "Muhurat", "Reviews"]) {
    test(`${label} tab also survives a real refresh (not just Pandits)`, async ({ page }) => {
      await page.goto(SERVICE, { waitUntil: "networkidle" });
      await page.locator(".sd-tabs__btn", { hasText: label }).click();
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator(".sd-tabs__btn--active")).toHaveText(new RegExp(label));
    });
  }
});
