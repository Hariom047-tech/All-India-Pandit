import { expect, type Page, type ConsoleMessage } from "@playwright/test";

/** Every public route that should render without auth. */
export const PUBLIC_ROUTES = [
  "/", "/temples", "/pandits", "/services", "/panchang", "/festivals",
  "/search", "/temple-map", "/ai-recommender", "/blog", "/about", "/contact",
  "/pandit-ji", "/login", "/pandit-login", "/pandit-forgot-password",
  "/privacy", "/terms",
];

/**
 * The single assertion that catches most real responsive breakage.
 * +1px absorbs sub-pixel rounding; anything beyond that is a genuine overflow.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    // Name the widest offender so failures are actionable, not just red.
    offender: (() => {
      const w = window.innerWidth;
      let worst = { tag: "", cls: "", right: 0 };
      document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > w + 1 && r.right > worst.right) {
          worst = { tag: el.tagName.toLowerCase(), cls: el.className?.toString().slice(0, 60) || "", right: Math.round(r.right) };
        }
      });
      return worst.tag ? `${worst.tag}.${worst.cls} extends to ${worst.right}px` : "none";
    })(),
  }));
  expect(m.scrollWidth, `${label}: horizontal overflow — ${m.offender}`).toBeLessThanOrEqual(m.innerWidth + 1);
}

/** Content left invisible by an animation observer that never fired. */
export async function expectNothingStuckInvisible(page: Page, label: string) {
  const stuck = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>("main *").forEach((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const inView = r.top < window.innerHeight && r.bottom > 0 && r.width > 40 && r.height > 20;
      if (inView && parseFloat(s.opacity) === 0 && s.visibility !== "hidden" && el.textContent?.trim()) {
        out.push(`${el.tagName.toLowerCase()}.${el.className?.toString().slice(0, 40)}`);
      }
    });
    return out.slice(0, 5);
  });
  expect(stuck, `${label}: elements stuck at opacity 0 — ${stuck.join(", ")}`).toHaveLength(0);
}

/** Touch targets below ~44px are hard to hit accurately. */
export async function expectUsableTouchTargets(page: Page, label: string) {
  const small = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>("a, button, [role=button], input[type=checkbox]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.height < 36 || r.width < 24)) {
        out.push(`${el.tagName.toLowerCase()}"${(el.textContent || "").trim().slice(0, 18)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    });
    return out.slice(0, 6);
  });
  expect(small, `${label}: touch targets under 36px — ${small.join(" | ")}`).toHaveLength(0);
}

/** Collects console errors, ignoring noise we cannot control. */
export function trackConsoleErrors(page: Page) {
  const errors: string[] = [];
  const IGNORE = [/favicon/i, /Download the React DevTools/i, /Intervention/i, /ERR_INTERNET_DISCONNECTED/i];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (!IGNORE.some((r) => r.test(t))) errors.push(t);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}
