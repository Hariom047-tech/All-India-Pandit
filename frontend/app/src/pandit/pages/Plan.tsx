import { useCallback, useEffect, useRef, useState } from "react";
import { panditApi, type PlanOption, type DashboardPayload, type PaymentRow } from "../lib/panditApi";
import { PageHead, ErrorState, Loading, ExpiryBanner, PausedBanner, formatDate } from "./_shared";
import { loadRazorpay } from "../lib/razorpay";

const CYCLES = [
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "yearly", label: "Yearly" },
];

const TIER_ORDER = ["free", "silver", "gold", "diamond"];

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pending", completed: "Successful", failed: "Failed",
  refunded: "Refunded", cancelled: "Cancelled",
};

/** Bounded poll: check a few times over ~12s for the webhook's activation to
 *  land, rather than a single optimistic refetch. The webhook (not this
 *  poll) is what actually activates the subscription — this is purely so
 *  the UI reflects that promptly instead of staying on "Confirming…" for no
 *  reason once it already happened. */
async function pollUntilActivated(targetTier: string, onTick: (d: DashboardPayload) => void): Promise<boolean> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const d = await panditApi.dashboard();
      onTick(d);
      if (d.plan.tier === targetTier) return true;
    } catch {
      // Best-effort — a transient failure here just means we try again next tick.
    }
  }
  return false;
}

/**
 * Plans and their inclusions come from the backend catalogue, which the admin
 * edits. Nothing about pricing is hardcoded here — an admin changing a price
 * or an inclusion is reflected immediately without a frontend deploy.
 *
 * On upgrade the client sends ONLY { tier, billingCycle }. The amount is
 * looked up server-side from subscription_plans and handed to Razorpay there,
 * so a tampered request body cannot change what is charged.
 *
 * Razorpay's checkout.js activates the subscription over a WEBHOOK, not this
 * page's success handler — that handler is fast-UX-only, so after it fires
 * we poll our own dashboard a few bounded times rather than assuming success.
 */
export default function Plan() {
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [current, setCurrent] = useState<DashboardPayload | null>(null);
  const [cycle, setCycle] = useState("monthly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTier, setBusyTier] = useState<string | null>(null);
  const [confirmingTier, setConfirmingTier] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const pollGuard = useRef(0);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    Promise.all([panditApi.plans(), panditApi.dashboard()])
      .then(([p, d]) => { setPlans(p); setCurrent(d); })
      .catch(() => setError("Plan details load nahi ho payin."))
      .finally(() => setLoading(false));
  }, []);

  const loadPayments = useCallback(() => {
    setPaymentsLoading(true);
    panditApi.payments({ limit: 10 })
      .then((res) => setPayments(res.data))
      .catch(() => setPayments([]))
      .finally(() => setPaymentsLoading(false));
  }, []);

  useEffect(load, [load]);
  useEffect(loadPayments, [loadPayments]);

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

      let Razorpay;
      try {
        Razorpay = await loadRazorpay();
      } catch {
        setNotice("Payment gateway load nahi ho paya. Internet check karke phir try karein.");
        return;
      }

      const myPollToken = ++pollGuard.current;
      new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount * 100,
        currency: order.currency,
        name: "PanditSuggest",
        description: `${plan.name} — ${cycle}`,
        handler: async () => {
          setNotice("Payment mil gaya. Confirm ho raha hai…");
          setConfirmingTier(plan.tier);
          const confirmed = await pollUntilActivated(plan.tier, (d) => {
            if (pollGuard.current === myPollToken) setCurrent(d);
          });
          if (pollGuard.current !== myPollToken) return; // a newer purchase superseded this poll
          setConfirmingTier(null);
          setNotice(confirmed
            ? `${plan.name} plan activate ho gaya!`
            : "Payment mil gaya, lekin confirmation abhi bhi process ho raha hai — thodi der mein page refresh karein.");
          load();
          loadPayments();
        },
        modal: {
          ondismiss: () => setNotice("Checkout band kar diya gaya — koi charge nahi hua."),
        },
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

      <PausedBanner pandit={current.pandit} />
      <ExpiryBanner plan={{ tier: currentTier, name: current.plan.name || currentTier, expiresAt: current.plan.expiresAt }} />

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
          const isUpgrade = !isCurrent && !isDowngrade && plan.tier !== "free";
          const isConfirming = confirmingTier === plan.tier;
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

              {isUpgrade && currentTier !== "free" && (
                <p className="pandit-plan__note">
                  Turant activate hoga, poori {cycle} price par — {(current.plan.name || currentTier)} plan ka bacha hua time credit nahi hoga.
                </p>
              )}

              {isCurrent ? (
                <button className="pandit-btn pandit-btn--block" disabled>Current Plan</button>
              ) : isDowngrade ? (
                <button className="pandit-btn pandit-btn--ghost pandit-btn--block" disabled
                  title="Downgrade ke liye support se sampark karein">Downgrade</button>
              ) : (
                <button className="pandit-btn pandit-btn--primary pandit-btn--block"
                  disabled={busyTier === plan.tier || isConfirming || plan.tier === "free"}
                  onClick={() => upgrade(plan)}>
                  {busyTier === plan.tier ? "Shuru ho raha hai…" : isConfirming ? "Confirm ho raha hai…" : "Upgrade"}
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

      <section className="pandit-panel" aria-labelledby="payments-heading" style={{ marginTop: 18 }}>
        <h2 id="payments-heading" className="pandit-section__title" style={{ marginTop: 0 }}>Payment History</h2>
        {paymentsLoading ? <Loading label="Payment history load ho rahi hai…" /> : payments.length === 0 ? (
          <p className="pandit-note">Abhi tak koi payment nahi hui hai.</p>
        ) : (
          <div className="pandit-table-wrap">
            <table className="pandit-table">
              <caption className="sr-only">Payment history</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Billing</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Valid Until</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Date">{formatDate(p.created_at)}</td>
                    <td data-label="Plan">{p.plan_name_snapshot || "—"}</td>
                    <td data-label="Billing">{p.billing_cycle || "—"}</td>
                    <td data-label="Amount">₹{Number(p.amount).toLocaleString("en-IN")}</td>
                    <td data-label="Status">
                      <span className={`pandit-badge pandit-badge--${p.status === "completed" ? "completed" : p.status === "failed" ? "not_reachable" : "new"}`}>
                        {PAYMENT_STATUS_LABEL[p.status] || p.status}
                      </span>
                    </td>
                    <td data-label="Valid Until">{p.status === "completed" ? formatDate(p.expires_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
