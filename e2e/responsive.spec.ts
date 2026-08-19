import { test } from "@playwright/test";
import { PUBLIC_ROUTES, expectNoHorizontalOverflow, expectNothingStuckInvisible } from "./_helpers";

test.describe("responsive — every public route, every viewport", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} has no horizontal overflow`, async ({ page }, info) => {
      await page.goto(route, { waitUntil: "networkidle" });
      await expectNoHorizontalOverflow(page, `${route} @ ${info.project.name}`);
    });
  }

  test("home renders fully after scrolling to the bottom", async ({ page }, info) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(700);
    await expectNothingStuckInvisible(page, `home @ ${info.project.name}`);
    await expectNoHorizontalOverflow(page, `home scrolled @ ${info.project.name}`);
  });

  test("breakpoint sweep finds gaps between the standard widths", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    for (const w of [375, 430, 500, 599, 600, 640, 767, 768, 900, 1023, 1024, 1280, 1440]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(180);
      await expectNoHorizontalOverflow(page, `home @ ${w}px`);
    }
  });
});
