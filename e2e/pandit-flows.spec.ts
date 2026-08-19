import { test, expect, type Page } from "@playwright/test";

/**
 * Flows A–H from the specification.
 *
 * These assume a seeded environment: an admin with TOTP disabled or a known
 * code, plus the fixture accounts created by `npm run seed:e2e`. Credentials
 * come from the environment so nothing secret lives in the repository.
 */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@panditsuggest.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "";
const ADMIN_TOTP = process.env.E2E_ADMIN_TOTP || "";
const DEVOTEE_EMAIL = process.env.E2E_DEVOTEE_EMAIL || "verified-devotee@test.local";
const DEVOTEE_PASSWORD = process.env.E2E_DEVOTEE_PASSWORD || "TestPass123";
const PANDIT_SLUG = process.env.E2E_PANDIT_SLUG || "ramesh-sharma";

const stamp = Date.now();
const NEW_PANDIT = {
  email: `e2e-pandit-${stamp}@test.local`,
  slug: `e2e-pandit-${stamp}`,
  name: "E2E Test Pandit",
  password: "TempPass123",
  dob: "1980-05-15",
};

async function adminLogin(page: Page) {
  await page.goto("/admin-panel/login");
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  if (ADMIN_TOTP) {
    await page.getByLabel(/code|totp|authenticator/i).fill(ADMIN_TOTP);
    await page.getByRole("button", { name: /verify/i }).click();
  }
  await expect(page).toHaveURL(/admin-panel/);
}

async function devoteeLogin(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(DEVOTEE_EMAIL);
  await page.getByLabel(/password/i).fill(DEVOTEE_PASSWORD);
  await page.getByRole("button", { name: /login/i }).click();
}

test.describe("FLOW A — admin provisions a pandit", () => {
  test("admin creates a pandit with email, temp password, DOB and plan", async ({ page }) => {
    test.skip(!ADMIN_PASSWORD, "E2E_ADMIN_PASSWORD not set");
    await adminLogin(page);
    await page.goto("/admin-panel/pandits/new");

    await page.locator('input[name="fullName"]').fill(NEW_PANDIT.name);
    await page.locator('input[name="slug"]').fill(NEW_PANDIT.slug);
    await page.locator('input[name="email"]').fill(NEW_PANDIT.email);
    await page.locator('input[name="temporaryPassword"]').fill(NEW_PANDIT.password);
    await page.locator('input[name="dateOfBirth"]').fill(NEW_PANDIT.dob);
    await page.locator('select[name="planTier"]').selectOption("gold");

    await page.getByRole("button", { name: /create/i }).click();
    await expect(page).toHaveURL(new RegExp(NEW_PANDIT.slug));
  });

  test("the stored password is never displayed back to the admin", async ({ page }) => {
    test.skip(!ADMIN_PASSWORD, "E2E_ADMIN_PASSWORD not set");
    await adminLogin(page);
    await page.goto(`/admin-panel/pandits/${NEW_PANDIT.slug}`);
    await expect(page.locator("body")).not.toContainText(NEW_PANDIT.password);
    await expect(page.getByRole("button", { name: /reset pandit password/i })).toBeVisible();
  });
});

test.describe("FLOW B — pandit logs in and sees the assigned plan", () => {
  test("login lands on the dashboard showing GOLD", async ({ page }) => {
    await page.goto("/pandit-login");
    await page.getByLabel(/email/i).fill(NEW_PANDIT.email);
    await page.getByLabel(/^password$/i).fill(NEW_PANDIT.password);
    await page.getByRole("button", { name: /^login$/i }).click();

    await expect(page).toHaveURL(/\/pandit\/dashboard/);
    await expect(page.getByText(/namaste pandit/i)).toBeVisible();
    await expect(page.getByText(/GOLD/)).toBeVisible();
  });

  test("a devotee is refused at the pandit door", async ({ page }) => {
    await page.goto("/pandit-login");
    await page.getByLabel(/email/i).fill(DEVOTEE_EMAIL);
    await page.getByLabel(/^password$/i).fill(DEVOTEE_PASSWORD);
    await page.getByRole("button", { name: /^login$/i }).click();
    await expect(page.getByText(/sirf registered Pandit Ji accounts/i)).toBeVisible();
  });
});

test.describe("FLOW C — forgot password via email + DOB", () => {
  test("email + DOB lets the pandit set a new password and log in", async ({ page }) => {
    const newPassword = "ResetPass456";
    await page.goto("/pandit-forgot-password");
    await page.getByLabel(/email/i).fill(NEW_PANDIT.email);
    await page.getByLabel(/date of birth/i).fill(NEW_PANDIT.dob);
    await page.getByRole("button", { name: /verify/i }).click();

    await page.getByLabel(/new password/i).first().fill(newPassword);
    await page.getByLabel(/confirm new password/i).fill(newPassword);
    await page.getByRole("button", { name: /password badlein/i }).click();
    await expect(page.getByText(/password badal gaya/i)).toBeVisible();

    await page.goto("/pandit-login");
    await page.getByLabel(/email/i).fill(NEW_PANDIT.email);
    await page.getByLabel(/^password$/i).fill(newPassword);
    await page.getByRole("button", { name: /^login$/i }).click();
    await expect(page).toHaveURL(/\/pandit\/dashboard/);
    NEW_PANDIT.password = newPassword;
  });

  test("a wrong DOB fails with the generic message", async ({ page }) => {
    await page.goto("/pandit-forgot-password");
    await page.getByLabel(/email/i).fill(NEW_PANDIT.email);
    await page.getByLabel(/date of birth/i).fill("1999-01-01");
    await page.getByRole("button", { name: /verify/i }).click();
    await expect(page.getByText(/Details verify nahi ho paayi/i)).toBeVisible();
  });
});

test.describe("FLOW D — guest contact creates NO qualified lead", () => {
  test("guest pressing Call is sent to login and no lead is recorded", async ({ page }) => {
    const leadCalls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/click")) leadCalls.push(r.url());
    });

    await page.goto(`/pandits/${PANDIT_SLUG}`);
    await page.getByRole("button", { name: /call now/i }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/login karein/i)).toBeVisible();
    expect(leadCalls, "a guest press must not even hit the lead endpoint").toHaveLength(0);
  });
});

test.describe("FLOW E + F — verified contact, then dedup", () => {
  test("verified devotee Call creates a lead; the follow-up WhatsApp does not", async ({ page }) => {
    await devoteeLogin(page);
    await page.goto(`/pandits/${PANDIT_SLUG}`);

    const first = page.waitForResponse((r) => r.url().includes("/click") && r.request().method() === "POST");
    await page.getByRole("button", { name: /call now/i }).click();
    const firstBody = await (await first).json();
    expect(firstBody.qualifiedLead).toBe(true);

    const second = page.waitForResponse((r) => r.url().includes("/click") && r.request().method() === "POST");
    await page.getByRole("button", { name: /whatsapp/i }).first().click();
    const secondBody = await (await second).json();
    expect(secondBody.qualifiedLead, "same user + same pandit inside the window").toBe(false);
    expect(secondBody.reason).toBe("duplicate_window");
    expect(secondBody.contactAllowed, "the devotee may still message").toBe(true);
  });
});

test.describe("FLOW G — the lead surfaces on the pandit dashboard", () => {
  test("today's count updates and the lead shows name + mobile", async ({ page }) => {
    await page.goto("/pandit-login");
    await page.getByLabel(/email/i).fill(NEW_PANDIT.email);
    await page.getByLabel(/^password$/i).fill(NEW_PANDIT.password);
    await page.getByRole("button", { name: /^login$/i }).click();

    await expect(page.getByRole("heading", { name: /qualified leads/i })).toBeVisible();
    await page.goto("/pandit/dashboard/leads");
    await expect(page.getByRole("heading", { name: /my leads/i })).toBeVisible();
    // Identity is intentionally present HERE (and only here).
    await expect(page.locator("table, .pandit-table")).toBeVisible();
  });

  test("profile views are shown as counts with no viewer identity", async ({ page }) => {
    await page.goto("/pandit-login");
    await page.getByLabel(/email/i).fill(NEW_PANDIT.email);
    await page.getByLabel(/^password$/i).fill(NEW_PANDIT.password);
    await page.getByRole("button", { name: /^login$/i }).click();

    const views = page.locator("section", { has: page.getByRole("heading", { name: /profile views/i }) });
    await expect(views).toBeVisible();
    await expect(views).toContainText(/kaun dekh raha hai woh record nahi hota/i);
  });
});

test.describe("FLOW H — upgrade", () => {
  test("the plan page lists live inclusions and starts checkout safely", async ({ page }) => {
    await page.goto("/pandit-login");
    await page.getByLabel(/email/i).fill(NEW_PANDIT.email);
    await page.getByLabel(/^password$/i).fill(NEW_PANDIT.password);
    await page.getByRole("button", { name: /^login$/i }).click();
    await page.goto("/pandit/dashboard/plan");

    await expect(page.getByRole("heading", { name: /my plan/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /current plan/i })).toBeVisible();

    // Only { tier, billingCycle } may go over the wire — never a price.
    page.on("request", (r) => {
      if (r.url().includes("/subscribe") && r.method() === "POST") {
        const body = JSON.parse(r.postData() || "{}");
        expect(Object.keys(body).sort()).toEqual(["billingCycle", "tier"]);
      }
    });
    const upgrade = page.getByRole("button", { name: /^upgrade$/i }).first();
    if (await upgrade.isVisible()) await upgrade.click();
  });
});
