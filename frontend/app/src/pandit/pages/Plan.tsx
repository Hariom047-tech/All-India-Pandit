import { useCallback, useEffect, useState } from "react";
import { panditApi, type PlanOption, type DashboardPayload } from "../lib/panditApi";
import { PageHead, ErrorState, Loading, formatDate } from "./_shared";

const CYCLES = [
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "yearly", label: "Yearly" },
];

const TIER_ORDER = ["free", "silver", "gold", "diamond"];

/**
 * Plans and their inclusions come from the backend catalogue, which the admin
 * edits. Nothing about pricing is hardcoded here — an admin changing a price
 * or an inclusion is reflected immediately without a frontend deploy.
 *
 * On upgrade the client sends ONLY { tier, billingCycle }. The amount is
 * looked up server-side from subscription_plans and handed to Razorpay there,
 * so a tampered request body cannot change what is charged.
 */
export default function Plan() {
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [current, setCurrent] = useState<DashboardPayload | null>(null);
  const [cycle, setCycle] = useState("monthly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTier, setBusyTier] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    Promise.all([panditApi.plans(), panditApi.dashboard()])
      .then(([p, d]) => { setPlans(p); setCurrent(d); })
      .catch(() => setError("Plan details load nahi ho payin."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  function priceFor(plan: PlanOption) {
    if (cycle === "yearly") return plan.priceYearly ?? plan.priceMonthly * 12;
    if (cycle === "quarterly") return plan.priceQuarterly ?? plan.priceMonthly * 3;
    return plan.priceMonthly;
  }

  async function upgrade(plan: PlanOption) {
    if (!current) return;
    setBusyTier(plan.tier); setNotice(null); setError(null);
    try {
      const order = await panditApi.subscribe(current.pandit.profileSlug, plan.tier, cycle);
      setNotice(`Payment order ban gaya (₹${order.amount}). Razorpay checkout khul raha hai…`);
      // Razorpay's script is loaded by the host page when configured. If it is
      // absent (no gateway keys in this environment) we say so plainly rather
      // than pretending a payment started.
      const rz = (window as unknown as { Razorpay?: new (o: unknown) => { open: () => void } }).Razorpay;
      if (!rz) {
        setNotice("Payment gateway abhi configure nahi hai. Support se sampark karein.");
        return;
      }
      new rz({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount * 100,
        currency: order.currency,
        name: "PanditSuggest",
        description: `${plan.name} — ${cycle}`,
        handler: () => { setNotice("Payment mil gaya. Plan thodi der mein update ho jaayega."); load(); },
      }).open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upgrade shuru nahi ho paya.");
    } finally {
      setBusyTier(null);
    }
  }

  if (loading) return <Loading />;
  if (!current) return <ErrorState message={error || "Plan details load nahi ho payin."} onRetry={load} />;

  const currentTier = current.plan.tier;
  const currentIdx = TIER_ORDER.indexOf(currentTier);

  return (
    <div className="pandit-page">
      <PageHead title="My Plan" sub="Apna current plan dekhein aur upgrade karein." />

      <section className="pandit-plancard pandit-plancard--wide">
        <div>
          <span className="pandit-plancard__label">Current Plan</span>
          <strong className="pandit-plancard__tier">{(current.plan.name || currentTier).toUpperCase()}</strong>
          <div className="pandit-plancard__grid">
            <span>Status<b>{current.plan.status}</b></span>
            <span>Billing<b>{current.plan.billingCycle || "—"}</b></span>
            <span>Activated<b>{formatDate(current.plan.startedAt)}</b></span>
            <span>Expires<b>{formatDate(current.plan.expiresAt)}</b></span>
          </div>
        </div>
      </section>

      {notice && <div className="pandit-alert pandit-alert--success" role="status">{notice}</div>}
      {error && <div className="pandit-alert pandit-alert--error" role="alert">{error}</div>}

      <div className="pandit-filter" role="group" aria-label="Billing cycle">
        <span className="pandit-filter__label">Billing</span>
        <div className="pandit-filter__pills">
          {CYCLES.map((c) => (
            <button key={c.id} type="button"
              className={`pandit-pill${cycle === c.id ? " is-active" : ""}`}
              aria-pressed={cycle === c.id}
              onClick={() => setCycle(c.id)}>{c.label}</button>
          ))}
        </div>
      </div>

      <div className="pandit-plans">
        {plans.map((plan) => {
          const isCurrent = plan.tier === currentTier;
          const isDowngrade = TIER_ORDER.indexOf(plan.tier) < currentIdx;
          return (
            <article key={plan.tier} className={`pandit-plan${isCurrent ? " is-current" : ""}${plan.popular ? " is-popular" : ""}`}>
              {plan.popular && <span className="pandit-plan__flag">Popular</span>}
              <h2 className="pandit-plan__name">{plan.name}</h2>
              {plan.tagline && <p className="pandit-plan__tagline">{plan.tagline}</p>}
              <p className="pandit-plan__price">
                <span>₹{Number(priceFor(plan)).toLocaleString("en-IN")}</span>
                <small>/{cycle.replace("ly", "")}</small>
              </p>
              {plan.description && <p className="pandit-plan__desc">{plan.description}</p>}

              <ul className="pandit-plan__feats">
                {plan.inclusions.length === 0
                  ? <li className="pandit-plan__feat--muted">Details jald hi update honge</li>
                  : plan.inclusions.map((f, i) => <li key={i}>{f}</li>)}
              </ul>

              {isCurrent ? (
                <button className="pandit-btn pandit-btn--block" disabled>Current Plan</button>
              ) : isDowngrade ? (
                <button className="pandit-btn pandit-btn--ghost pandit-btn--block" disabled
                  title="Downgrade ke liye support se sampark karein">Downgrade</button>
              ) : (
                <button className="pandit-btn pandit-btn--primary pandit-btn--block"
                  disabled={busyTier === plan.tier || plan.tier === "free"}
                  onClick={() => upgrade(plan)}>
                  {busyTier === plan.tier ? "Shuru ho raha hai…" : "Upgrade"}
                </button>
              )}
            </article>
          );
        })}
      </div>

      <p className="pandit-note">
        Plan ka price aur inclusions admin dwara set kiye jaate hain. Payment ki rakam
        hamesha server par decide hoti hai.
      </p>
    </div>
  );
}
