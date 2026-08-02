import { Link } from "react-router-dom";
import { Icon } from "../lib/icons";
import { stats } from "../data/content";
import { Reveal, RevealStagger, revealItem } from "../components/ui/Reveal";
import { CountUp } from "../components/ui/CountUp";
import { motion } from "framer-motion";

const VERIFY_STEPS = [
  { icon: "inbox", h: "Document check", p: "Government ID, address proof and the pandit ji's temple association letter are collected and cross-checked." },
  { icon: "video", h: "Video KYC call", p: "A live call confirms the person matches the documents and that they actually perform the rituals they list." },
  { icon: "temple", h: "Temple confirmation", p: "We contact the temple office or trust directly to confirm the association before the listing goes live." },
  { icon: "award", h: "Certificate verification", p: "Vedic education certificates — Shastri, Acharya, Ghanapaathi — are verified with the issuing institution." },
  { icon: "star", h: "Review integrity audit", p: "Reviews are re-audited every six months. Paid or planted reviews mean permanent removal from the platform." },
];

const DIFF: [string, string][] = [
  ["Direct WhatsApp / call contact", "Middleman booking flow"],
  ["Temple directory with map", "No temple focus at all"],
  ["Rich profiles with video intro", "Basic text-only profiles"],
  ["AI Pooja Recommender", "No guidance — you guess"],
  ["Panchang & muhurat built in", "You search elsewhere"],
  ["12+ Indian languages", "English and Hindi only"],
  ["Pandit keeps 100% of dakshina", "20–30% platform commission"],
  ["Free basic listing, forever", "Paid listing only"],
];

export default function About() {
  return (
    <>
      <section className="page-hero">
        <img src="/assets/img/mandala.svg" className="watermark watermark--tl" alt="" />
        <img src="/assets/img/mandala.svg" className="watermark watermark--tr" alt="" />
        <div className="shell" style={{ position: "relative", zIndex: 1 }}>
          <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> <span>/</span> About Us</nav>
          <h1 className="section-title" style={{ marginTop: 10 }}>Sacred Connections,<br /><span className="gold-text">Trusted Pandits</span></h1>
          <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>
          <p className="section-sub">We are not a booking platform. We are the directory that should have existed all along.</p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 52 }}>
        <div className="shell grid g-2" style={{ alignItems: "start", gap: 40 }}>
          <div>
            <span className="eyebrow">Our mission</span>
            <h2 className="section-title section-title--left" style={{ fontSize: "clamp(1.6rem,2.8vw,2.2rem)", marginTop: 10 }}>Put the temple back at the centre</h2>
            <p style={{ marginTop: 16, color: "#4d4a45" }}>Ask anyone which pandits serve the mandir two streets from their home and they will not know. That information has always travelled by word of mouth — and word of mouth does not reach a family that has just moved cities, or one living abroad trying to arrange their father's shradh.</p>
            <p style={{ marginTop: 14, color: "#4d4a45" }}>Every existing platform answered this by becoming a middleman: you pay them, they assign someone, they keep 20–30%. The pandit becomes anonymous and the temple disappears from the picture entirely.</p>
            <p style={{ marginTop: 14, color: "#4d4a45" }}>We built the opposite. Browse temples. Read real profiles. Call pandit ji yourself. Decide the vidhi, the date and the dakshina between the two of you — the way it has always been done, just findable.</p>
          </div>
          <div className="stack" style={{ gap: 18 }}>
            <div className="card card-pad card--cream">
              <h3 style={{ fontSize: "1.2rem" }}>What we do</h3>
              <ul className="dot-list" style={{ marginTop: 10 }}>
                <li>List temples with photos, timings, history and sevas</li>
                <li>Verify pandits with documents, video KYC and temple confirmation</li>
                <li>Show experience, qualifications, languages and honest reviews</li>
                <li>Hand you the phone number and step out of the way</li>
              </ul>
            </div>
            <div className="card card-pad">
              <h3 style={{ fontSize: "1.2rem" }}>What we never do</h3>
              <ul className="dot-list" style={{ marginTop: 10 }}>
                <li>Take a commission on your puja or pandit ji's dakshina</li>
                <li>Hide the pandit's identity until you have paid</li>
                <li>Assign someone you did not choose yourself</li>
                <li>Sell your phone number to anybody</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--cream section--tight">
        <div className="shell">
          <div className="grid g-4">
            {stats.map((s) => (
              <div className="card card-pad text-c" key={s.label}>
                <span style={{ color: "var(--gold)" }}><Icon name={s.icon} size={40} /></span>
                <div style={{ marginTop: 10 }}><CountUp raw={s.num} /></div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="verify" style={{ position: "relative" }}>
        <img src="/assets/img/lotus.svg" className="watermark watermark--bl" alt="" style={{ width: 240 }} />
        <div className="shell">
          <h2 className="section-title">How We Verify</h2>
          <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>
          <p className="section-sub">A gold tick on a profile means all five of these steps were completed — not that someone filled a form.</p>
          <RevealStagger className="grid g-3" style={{ marginTop: 40 }}>
            {VERIFY_STEPS.map((s, i) => (
              <motion.article className="card step" key={s.h} variants={revealItem}>
                <span className="step-n">0{i + 1}</span>
                <div className="step-ico"><Icon name={s.icon} size={30} /></div>
                <h3>{s.h}</h3>
                <p>{s.p}</p>
              </motion.article>
            ))}
          </RevealStagger>
        </div>
      </section>

      <section className="section section--cream">
        <div className="shell">
          <h2 className="section-title">Us vs a Booking Platform</h2>
          <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>
          <div style={{ marginTop: 34, maxWidth: 900, marginLeft: "auto", marginRight: "auto" }}>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>PanditConnect</th><th>Typical booking platform</th></tr></thead>
                <tbody>
                  {DIFF.map(([a, b]) => (
                    <tr key={a}>
                      <td><span className="meta-line" style={{ color: "var(--text)" }}><Icon name="check-circle" size={16} /> {a}</span></td>
                      <td className="muted">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell" style={{ maxWidth: 840 }}>
          <h2 className="section-title section-title--left" style={{ fontSize: "clamp(1.5rem,2.6vw,2rem)" }}>So how do we pay the bills?</h2>
          <p className="muted" style={{ marginTop: 14 }}>Openly, because a platform that hides its revenue model usually has a reason to.</p>
          <div className="grid g-2" style={{ marginTop: 24, gap: 16 }}>
            {[
              ["Premium pandit listings", "₹299–999/month, optional, for a verified badge, more temple listings and better placement."],
              ["Temple & event promotion", "Temple trusts pay to promote festivals and special sevas on relevant pages."],
              ["Content advertising", "Contextual ads on blog and panchang pages — never on a pandit's profile."],
              ["Samagri store (planned)", "A future commission-based shop for puja items, kept entirely separate from pandit listings."],
            ].map(([k, v]) => (
              <div className="pg-item" key={k}><div className="k">{k}</div><div className="v" style={{ fontSize: "1rem" }}>{v}</div></div>
            ))}
          </div>
          <Reveal className="usp-band" style={{ marginTop: 26 }}>
            <p style={{ margin: 0 }}>
              <strong style={{ fontFamily: "var(--font-head)" }}>The line we will not cross:</strong>{" "}
              <span className="muted">no revenue stream will ever depend on standing between a devotee and a pandit ji.</span>
            </p>
          </Reveal>
        </div>
      </section>

      <section className="section section--cream section--tight">
        <div className="shell">
          <div className="cta-band">
            <img src="/assets/img/mandala.svg" className="watermark watermark--br" alt="" />
            <div>
              <h2>Join us — as a devotee, pandit or temple</h2>
              <p>Free to browse, free to list, free to connect. Always.</p>
            </div>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              <Link className="btn btn-outline btn-lg" to="/temples">Explore temples</Link>
              <Link className="btn btn-outline btn-lg" to="/dashboard">List as a Pandit</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
