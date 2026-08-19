import type { ReactNode } from "react";

export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="pandit-page__head">
      <h1 className="pandit-page__title">{title}</h1>
      {sub && <p className="pandit-page__sub">{sub}</p>}
    </header>
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

export const STATUS_LABEL: Record<string, string> = {
  new: "New",
  viewed: "Viewed",
  contacted: "Contacted",
  completed: "Completed",
  not_reachable: "Not Reachable",
};
