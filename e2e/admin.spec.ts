import { test, expect } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./_helpers";

const EMAIL = process.env.E2E_ADMIN_EMAIL || "";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || "";
const TOTP = process.env.E2E_ADMIN_TOTP || "";

test.describe("admin panel", () => {
  test("unauthenticated access lands on login, never on data", async ({ page }) => {
    await page.goto("/admin-panel/users", { waitUntil: "networkidle" });
    const txt = (await page.locator("body").innerText()).toLowerCase();
    expect(txt).toMatch(/login|sign in|password/);
  });

  test.describe("authenticated", () => {
    test.skip(!PASSWORD, "set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD to run");

    test.beforeEach(async ({ page }) => {
      await page.goto("/admin-panel/login");
      await page.getByLabel(/email/i).fill(EMAIL);
      await page.getByLabel(/password/i).fill(PASSWORD);
      await page.getByRole("button", { name: /login|sign in/i }).click();
      if (TOTP) {
        await page.getByLabel(/code|totp|authenticator/i).fill(TOTP);
        await page.getByRole("button", { name: /verify/i }).click();
      }
      await expect(page).toHaveURL(/admin-panel/);
    });

    for (const r of ["", "/pandits", "/temples", "/services", "/users", "/inquiries",
                     "/reviews", "/analytics", "/leads", "/plans", "/home", "/security", "/settings"]) {
      test(`/admin-panel${r} has no overflow`, async ({ page }, info) => {
        await page.goto(`/admin-panel${r}`, { waitUntil: "networkidle" });
        await expectNoHorizontalOverflow(page, `/admin-panel${r} @ ${info.project.name}`);
      });
    }

    test("the temple modal fits the viewport and Save stays reachable", async ({ page }) => {
      await page.goto("/admin-panel/temples", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /add temple/i }).click();
      const modal = page.locator(".modal, [role=dialog]").first();
      await expect(modal).toBeVisible();
      const box = await modal.boundingBox();
      expect(box!.height, "modal taller than the viewport").toBeLessThanOrEqual(page.viewportSize()!.height);
      const save = page.getByRole("button", { name: /^save/i }).first();
      await save.scrollIntoViewIfNeeded();
      await expect(save).toBeVisible();
    });

    test("tables do not blow out the page on mobile", async ({ page }, info) => {
      test.skip(!info.project.name.startsWith("mobile"), "mobile only");
      await page.goto("/admin-panel/users", { waitUntil: "networkidle" });
      await expectNoHorizontalOverflow(page, "admin users table");
    });
  });
});
