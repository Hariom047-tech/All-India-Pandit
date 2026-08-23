import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="pandit-page__head">
      <h1 className="pandit-page__title">{title}</h1>
      {sub && <p className="pandit-page__sub">{sub}</p>}
    </header>
  );
}

/**
 * 5/3/1-day severity banner for an about-to-expire (or already expired)
 * paid plan. Mirrors the backend reminder engine's own offsets
 * (services/billing/reminderScheduler.js) so the in-app notification and
 * this always-visible banner never disagree about what counts as urgent.
 * Renders nothing for the free plan or a plan with more than 5 days left.
 */
export function ExpiryBanner({ plan }: {
  plan: { tier: string; name: string; expiresAt: string | null };
}) {
  if (plan.tier === "free" || !plan.expiresAt) return null;
  const daysRemaining = Math.ceil((new Date(plan.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysRemaining > 5) return null;

  const expired = daysRemaining < 0;
  const severity = expired ? "expired" : daysRemaining <= 1 ? "urgent" : daysRemaining <= 3 ? "warning" : "notice";
  const dateLabel = formatDate(plan.expiresAt);

  const message = expired
    ? `${plan.name} plan ${dateLabel} ko expire ho chuka hai. Renew karke apne plan benefits wapas paayein.`
    : daysRemaining === 0
      ? `${plan.name} plan aaj expire ho raha hai. Renew karein taaki profile visibility mein rukawat na aaye.`
      : `${plan.name} plan ${daysRemaining} din mein expire ho raha hai (${dateLabel}). Ab renew karein taaki koi rukawat na aaye.`;

  return (
    <div className={`pandit-alert pandit-alert--${severity === "notice" ? "success" : "error"}`} role="status">
      <strong>{expired ? "Plan Expired" : `Expires in ${daysRemaining} din`}</strong>
      <p style={{ margin: "4px 0 8px" }}>{message}</p>
      <Link to="/pandit/dashboard/plan" className="pandit-btn pandit-btn--sm pandit-btn--primary">Renew Now</Link>
    </div>
  );
}

/**
 * Most severe banner in the dashboard — unlike ExpiryBanner (a warning about
 * something about to happen), a paused profile is ALREADY hidden from every
 * public surface (search, temple pages, service listings — India and
 * international both) and from the lead-distribution engine, right now. See
 * migration 32: this fires either automatically (a paid plan lapsed with no
 * renewal — pausedReason 'subscription_expired') or because an admin paused
 * the profile manually for some other reason (pausedReason holds their note).
 */
export function PausedBanner({ pandit }: {
  pandit: { isPaused: boolean; pausedReason: string | null };
}) {
  if (!pandit.isPaused) return null;
  const isExpiry = pandit.pausedReason === "subscription_expired";
  return (
    <div className="pandit-alert pandit-alert--error" role="alert">
      <strong>Profile Paused — Hidden From Everyone</strong>
      <p style={{ margin: "4px 0 8px" }}>
        {isExpiry
          ? "Aapka plan expire ho gaya hai, isliye aapki profile abhi India aur international dono jagah hide hai — koi bhi devotee aapko dhoondh ya contact nahi kar sakta. Plan renew karke turant visibility wapas paayein."
          : `Aapki profile admin dwara manually pause ki gayi hai, isliye abhi hide hai — koi bhi devotee aapko dhoondh ya contact nahi kar sakta.${pandit.pausedReason ? ` Reason: "${pandit.pausedReason}"` : ""} Ispar sawal ho toh support se sampark karein.`}
      </p>
      {isExpiry && <Link to="/pandit/dashboard/plan" className="pandit-btn pandit-btn--sm pandit-btn--primary">Renew Now</Link>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="pandit-state pandit-state--error" role="alert">
      <p>{message}</p>
      {onRetry && <button className="pandit-btn pandit-btn--primary" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="pandit-state" role="status">
      <p className="pandit-state__title">{title}</p>
      {sub && <p className="pandit-state__sub">{sub}</p>}
    </div>
  );
}

export function Loading({ label = "Load ho raha hai…" }: { label?: string }) {
  return (
    <div className="pandit-state" role="status" aria-live="polite">
      <div className="pandit-boot__spinner" />
      <p>{label}</p>
    </div>
  );
}

export function StatCard({ label, value, tone, hint }: {
  label: string; value: ReactNode; tone?: "lead" | "view" | "neutral"; hint?: string;
}) {
  return (
    <div className={`pandit-stat pandit-stat--${tone || "neutral"}`}>
      <span className="pandit-stat__label">{label}</span>
      <strong className="pandit-stat__value">{value}</strong>
      {hint && <span className="pandit-stat__hint">{hint}</span>}
    </div>
  );
}

/** A large, single-glance number — for the ONE or TWO figures a page leads
 *  with, as opposed to a grid of small StatCards. */
export function HeroStat({ label, value, tone }: {
  label: string; value: ReactNode; tone?: "lead" | "view";
}) {
  return (
    <div className={`pandit-hero pandit-hero--${tone || "lead"}`}>
      <span className="pandit-hero__label">{label}</span>
      <strong className="pandit-hero__value">{value}</strong>
    </div>
  );
}

const IST = "Asia/Kolkata";

/** Renders lead timestamps in the same zone the counts are bucketed by. */
export function formatLeadTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toLocaleDateString("en-IN", { timeZone: IST }) === now.toLocaleDateString("en-IN", { timeZone: IST });
  const time = d.toLocaleTimeString("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true });
  if (sameDay) return `Today · ${time}`;
  return `${d.toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short" })} · ${time}`;
}

export function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "long", year: "numeric" });
}

export const METHOD_LABEL: Record<string, string> = {
  phone_call: "Call",
  whatsapp: "WhatsApp",
};

export const METHOD_ICON: Record<string, string> = {
  phone_call: "📞",
  whatsapp: "💬",
};

export const STATUS_LABEL: Record<string, string> = {
  new: "New",
  viewed: "Viewed",
  contacted: "Contacted",
  completed: "Completed",
  not_reachable: "Not Reachable",
};
