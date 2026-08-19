import { Link } from "react-router-dom";
import { Icon } from "../lib/icons";
import { Seo } from "../lib/Seo";
import { useStructuredData, organizationSchema, websiteSchema, webPageSchema, breadcrumbSchema } from "../lib/structuredData";

const STEPS = [
  { icon: "search", h: "Discover", p: "Search by city, deity, occasion, or ask the AI Recommender if you're not sure what you need." },
  { icon: "users", h: "Compare", p: "Read verified Pandit profiles: experience, languages, temple association, and honest reviews." },
  { icon: "message-circle", h: "Contact directly", p: "Call or WhatsApp the pandit ji yourself. No form, no waiting for an assignment." },
  { icon: "check-circle", h: "Arrange it together", p: "Vidhi, date, and dakshina are settled directly between you — PanditSuggest is never part of that transaction." },
];

export default function HowItWorks() {
  useStructuredData([
    organizationSchema(),
    websiteSchema(),
    webPageSchema({ path: "/how-it-works", name: "How PanditSuggest Works" }),
    breadcrumbSchema([{ name: "Home", path: "/" }, { name: "How It Works", path: "/how-it-works" }]),
  ]);

  return (
    <>
      <Seo
        title="How PanditSuggest Works"
        description="Four steps to find and contact a verified Pandit directly — no booking fee, no assigned stranger, no middleman."
        path="/how-it-works"
      />
      <section className="page-hero">
        <img src="/assets/img/mandala.svg" className="watermark watermark--tl" alt="" />
        <div className="shell" style={{ position: "relative", zIndex: 1 }}>
          <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> <span>/</span> How It Works</nav>
          <h1 className="section-title" style={{ marginTop: 10 }}>How PanditSuggest Works</h1>
          <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>
          <p className="section-sub">Four steps, no account required to browse.</p>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="grid g-4 hiw-steps-grid">
            {STEPS.map((s, i) => (
              <div className="card step" key={s.h}>
                <span className="step-n">0{i + 1}</span>
                <div className="step-ico"><Icon name={s.icon} size={30} /></div>
                <h3>{s.h}</h3>
                <p>{s.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--cream">
        <div className="shell text-c">
          <h2 className="section-title">Ready to start?</h2>
          <div className="row" style={{ justifyContent: "center", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
            <Link className="btn btn-gold btn-lg" to="/pandits">Find Pandits</Link>
            <Link className="btn btn-outline btn-lg" to="/temples">Explore Temples</Link>
            <Link className="btn btn-outline btn-lg" to="/about">About PanditSuggest</Link>
          </div>
        </div>
      </section>
    </>
  );
}
