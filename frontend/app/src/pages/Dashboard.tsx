import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../lib/icons";
import { pandits, services, languages, plans, reviews, serviceName } from "../data/content";
import { StarRow } from "../components/ui/StarRating";
import { Modal } from "../components/ui/Modal";
import { useToast } from "../components/ui/Toast";

const SECTIONS = [
  { id: "overview", label: "Overview", icon: "layout-dashboard" },
  { id: "profile", label: "My Profile", icon: "user" },
  { id: "services", label: "Services & Availability", icon: "diya" },
  { id: "reviews", label: "Reviews", icon: "star" },
  { id: "analytics", label: "Analytics", icon: "bar-chart" },
  { id: "plan", label: "Subscription", icon: "credit-card" },
];

const KPI_META = [
  { k: "Profile views (30d)", v: "2,418", d: "+18% vs last month", icon: "eye" },
  { k: "Contact clicks", v: "386", d: "+11%", icon: "phone" },
  { k: "WhatsApp opens", v: "241", d: "+24%", icon: "whatsapp" },
];

const MONTHS = ["Feb", "Mar", "Apr", "May", "Jun", "Jul"];
const VIEWS = [58, 72, 64, 88, 96, 100];
const INQUIRIES: [string, string, string][] = [
  ["Ankit Verma", "Griha Pravesh", "Lucknow"], ["Sneha Rao", "Rudrabhishek", "Varanasi"],
  ["Imran Sheikh", "Vastu Shanti", "Kanpur"], ["Meera Joshi", "Mahamrityunjay", "Delhi"],
];
const CITY_ROWS: [string, string, string][] = [
  ["Varanasi", "842", "148"], ["Delhi NCR", "512", "76"], ["Lucknow", "388", "54"],
  ["Mumbai", "301", "41"], ["Overseas", "186", "32"],
];

export default function Dashboard() {
  const me = pandits.find((p) => p.id === "ramesh-sharma")!;
  const [section, setSection] = useState("overview");
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const toast = useToast();

  function onProfileSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    toast("Profile saved.");
  }

  function onReplySubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setReplyFor(null);
    setReplyText("");
    toast("Reply posted.");
  }

  const topSvc = me.services.map((s, i) => ({ name: serviceName(s), pct: [42, 24, 16, 11, 7][i] || 5 }));

  return (
    <>
      <section className="page-hero" style={{ padding: "44px 0 32px" }}>
        <img src="/assets/img/mandala.svg" className="watermark watermark--tr" alt="" />
        <div className="shell" style={{ position: "relative", zIndex: 1 }}>
          <nav className="crumbs crumbs--left" aria-label="Breadcrumb"><Link to="/">Home</Link> <span>/</span> Pandit Dashboard</nav>
          <div className="row-between" style={{ marginTop: 12, flexWrap: "wrap" }}>
            <div>
              <h1 className="section-title section-title--left" style={{ fontSize: "clamp(1.7rem,3vw,2.4rem)" }}>Pandit Dashboard</h1>
              <p className="muted" style={{ marginTop: 6 }}>Demo view signed in as a Diamond-tier pandit. Data is local to this browser.</p>
            </div>
            <Link className="btn btn-outline" to="/contact">Need help? Talk to support</Link>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 34 }}>
        <div className="shell dash">
          <aside className="dash-nav" aria-label="Dashboard sections">
            {SECTIONS.map((s) => (
              <button key={s.id} className={section === s.id ? "is-active" : ""} onClick={() => setSection(s.id)}>
                <Icon name={s.icon} size={18} /> {s.label}
              </button>
            ))}
          </aside>

          <div>
            {section === "overview" && (
              <div>
                <div className="row-between" style={{ marginBottom: 20 }}>
                  <div>
                    <h2 style={{ fontSize: "1.5rem" }}>Namaste, {me.name}</h2>
                    <p className="muted">{me.tier} plan · profile {me.verified ? "verified" : "pending verification"}</p>
                  </div>
                  <Link className="btn btn-outline btn-sm" to={`/pandits/${me.id}`}><Icon name="eye" size={16} /> View public profile</Link>
                </div>
                <div className="grid g-4" style={{ gap: 16 }}>
                  {[...KPI_META, { k: "Avg. rating", v: me.rating.toFixed(1), d: `${me.reviews} reviews`, icon: "star" }].map((k) => (
                    <div className="card kpi" key={k.k}>
                      <div className="row-between"><span className="k">{k.k}</span><span style={{ color: "var(--gold)" }}><Icon name={k.icon} size={18} /></span></div>
                      <div className="v">{k.v}</div>
                      <div className="d">{k.d}</div>
                    </div>
                  ))}
                </div>
                <div className="grid g-2" style={{ marginTop: 26, alignItems: "start" }}>
                  <div className="card card-pad">
                    <h3 style={{ fontSize: "1.16rem" }}>Profile views — last 6 months</h3>
                    <div className="bars">
                      {MONTHS.map((m, i) => (
                        <div key={m}><span className="bar" style={{ height: `${VIEWS[i]}%` }} /><span className="lbl">{m}</span></div>
                      ))}
                    </div>
                  </div>
                  <div className="card card-pad">
                    <h3 style={{ fontSize: "1.16rem" }}>Recent inquiries</h3>
                    <div className="table-wrap" style={{ marginTop: 14, border: 0 }}>
                      <table className="tbl">
                        <thead><tr><th>Devotee</th><th>Service</th><th>City</th></tr></thead>
                        <tbody>{INQUIRIES.map((r) => <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {section === "profile" && (
              <div>
                <h2 style={{ fontSize: "1.5rem", marginBottom: 6 }}>My Profile</h2>
                <p className="muted" style={{ marginBottom: 22 }}>This is what devotees see. Keep it accurate — verification re-checks every six months.</p>
                <form className="card card-pad" onSubmit={onProfileSave}>
                  <div className="grid g-2" style={{ gap: 16 }}>
                    <div><label className="label" htmlFor="dpName">Full name</label><input className="input" id="dpName" defaultValue={me.name} /></div>
                    <div><label className="label" htmlFor="dpPhone">Contact number</label><input className="input" id="dpPhone" defaultValue={me.phone} /></div>
                    <div><label className="label" htmlFor="dpCity">City</label><input className="input" id="dpCity" defaultValue={me.city} /></div>
                    <div><label className="label" htmlFor="dpExp">Years of experience</label><input className="input" id="dpExp" type="number" defaultValue={me.exp} /></div>
                    <div><label className="label" htmlFor="dpEdu">Vedic education</label><input className="input" id="dpEdu" defaultValue={me.edu} /></div>
                    <div><label className="label" htmlFor="dpGotra">Gotra / tradition</label><input className="input" id="dpGotra" defaultValue={me.gotra} /></div>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <label className="label" htmlFor="dpAbout">About you</label>
                    <textarea className="textarea" id="dpAbout" defaultValue={me.about} />
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <label className="label">Languages spoken</label>
                    <div className="row wrap" style={{ gap: 8 }}>
                      {languages.map((l) => (
                        <label className="check" style={{ padding: 0 }} key={l}>
                          <input type="checkbox" defaultChecked={me.langs.includes(l)} />
                          <span>{l}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 12, marginTop: 22, flexWrap: "wrap" }}>
                    <button className="btn btn-gold" type="submit"><Icon name="check" size={17} /> Save changes</button>
                    <button className="btn btn-outline" type="button" onClick={() => toast("Video upload opens on Silver plan and above.")}>
                      <Icon name="video" size={17} /> Upload video intro
                    </button>
                  </div>
                </form>
              </div>
            )}

            {section === "services" && (
              <div>
                <h2 style={{ fontSize: "1.5rem", marginBottom: 6 }}>Services &amp; Availability</h2>
                <p className="muted" style={{ marginBottom: 22 }}>Tick every ritual you perform. Free tier allows 3 — upgrade for unlimited.</p>
                <div className="card card-pad">
                  <div className="grid g-3" style={{ gap: 6 }}>
                    {services.map((s) => (
                      <label className="check" key={s.id}>
                        <input type="checkbox" defaultChecked={me.services.includes(s.id)} />
                        <span>{s.name}</span>
                      </label>
                    ))}
                  </div>
                  <button className="btn btn-gold" style={{ marginTop: 20 }} onClick={() => toast("Services updated.")}>
                    <Icon name="check" size={17} /> Save services
                  </button>
                </div>
                <div className="card card-pad" style={{ marginTop: 20 }}>
                  <h3 style={{ fontSize: "1.16rem" }}>Block dates you are unavailable</h3>
                  <div className="row" style={{ gap: 12, marginTop: 14, flexWrap: "wrap" }}>
                    <input className="input" type="date" style={{ maxWidth: 200 }} />
                    <input className="input" type="date" style={{ maxWidth: 200 }} />
                    <button className="btn btn-outline" onClick={() => toast("Dates blocked — you will not appear as available.")}>Block range</button>
                  </div>
                </div>
              </div>
            )}

            {section === "reviews" && (
              <div>
                <h2 style={{ fontSize: "1.5rem", marginBottom: 6 }}>Reviews</h2>
                <p className="muted" style={{ marginBottom: 22 }}>Respond publicly — devotees read replies as closely as reviews.</p>
                {reviews.slice(0, 4).map((r) => (
                  <div className="card card-pad" style={{ marginBottom: 14 }} key={r.name}>
                    <div className="row-between">
                      <span><StarRow rating={r.rating} /> <strong style={{ fontFamily: "var(--font-head)", marginLeft: 8 }}>{r.name}</strong><span className="muted"> · {r.city}</span></span>
                      <span className="tag tag--soft">{r.service}</span>
                    </div>
                    <p style={{ marginTop: 10, color: "#4d4a45" }}>{r.text}</p>
                    <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={() => setReplyFor(r.name)}>
                      <Icon name="message-circle" size={15} /> Reply
                    </button>
                  </div>
                ))}
              </div>
            )}

            {section === "analytics" && (
              <div>
                <h2 style={{ fontSize: "1.5rem", marginBottom: 6 }}>Analytics</h2>
                <p className="muted" style={{ marginBottom: 22 }}>Gold and Diamond plans include this dashboard.</p>
                <div className="grid g-2" style={{ alignItems: "start" }}>
                  <div className="card card-pad">
                    <h3 style={{ fontSize: "1.16rem" }}>Which services get enquiries</h3>
                    <div className="stack" style={{ gap: 12, marginTop: 16 }}>
                      {topSvc.map((s) => (
                        <div key={s.name}>
                          <div className="row-between" style={{ marginBottom: 5 }}><span style={{ fontSize: ".9rem" }}>{s.name}</span><span className="muted">{s.pct}%</span></div>
                          <span style={{ display: "block", height: 9, borderRadius: 5, background: "var(--cream-deep)", overflow: "hidden" }}>
                            <span style={{ display: "block", height: "100%", width: `${s.pct}%`, background: "var(--gold-grad)" }} />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="card card-pad">
                    <h3 style={{ fontSize: "1.16rem" }}>Where devotees come from</h3>
                    <div className="table-wrap" style={{ marginTop: 14, border: 0 }}>
                      <table className="tbl">
                        <thead><tr><th>City</th><th>Views</th><th>Contacts</th></tr></thead>
                        <tbody>{CITY_ROWS.map((r) => <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {section === "plan" && (
              <div>
                <h2 style={{ fontSize: "1.5rem", marginBottom: 6 }}>Subscription</h2>
                <p className="muted" style={{ marginBottom: 22 }}>Your listing is free forever. Paid tiers only buy visibility — never a cut of your dakshina.</p>
                <div className="grid g-4" style={{ gap: 16 }}>
                  {plans.map((pl) => {
                    const current = pl.name === me.tier;
                    return (
                      <div className={`card plan-card${current ? " is-current" : ""}`} key={pl.name}>
                        {pl.popular && <span className="badge-gold" style={{ marginBottom: 10 }}>Most popular</span>}
                        <h3 style={{ fontSize: "1.2rem" }}>{pl.name}</h3>
                        <div className="plan-price">{pl.price}<span>{pl.per}</span></div>
                        <ul className="dot-list" style={{ textAlign: "left", margin: "16px 0" }}>
                          {pl.feats.map((f) => <li style={{ fontSize: ".88rem" }} key={f}>{f}</li>)}
                        </ul>
                        <button className={`btn ${current ? "btn-ghost" : "btn-gold"} btn-block btn-sm`} disabled={current}>
                          {current ? "Current plan" : pl.cta}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section section--cream section--tight">
        <div className="shell">
          <div className="usp-band">
            <p className="muted" style={{ margin: 0 }}>
              <strong style={{ fontFamily: "var(--font-head)", color: "var(--text)" }}>Not registered yet?</strong>{" "}
              A basic listing — profile, one temple, three services — is free and always will be. Paid tiers buy visibility only.
              We never take a share of your dakshina. <Link to="/contact" style={{ color: "var(--gold-deep)", fontWeight: 600 }}>Apply to list your profile</Link>.
            </p>
          </div>
        </div>
      </section>

      <Modal open={!!replyFor} onClose={() => setReplyFor(null)}>
        <h3 style={{ fontSize: "1.3rem" }}>Reply publicly</h3>
        <form onSubmit={onReplySubmit}>
          <textarea className="textarea" style={{ marginTop: 14 }} placeholder="Dhanyavaad..." value={replyText} onChange={(e) => setReplyText(e.target.value)} />
          <button className="btn btn-gold btn-block" style={{ marginTop: 14 }} type="submit">Post reply</button>
        </form>
      </Modal>
    </>
  );
}
