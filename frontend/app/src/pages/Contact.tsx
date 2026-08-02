import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../lib/icons";
import { faqs } from "../data/content";
import { api } from "../lib/api";
import { useToast } from "../components/ui/Toast";

const SUBJECTS = ["General question", "I am a pandit — how do I list?", "Temple partnership", "Report a profile or review", "Media / press", "Something else"];

function FaqItem({ q, a, defaultOpen = false }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`acc-item${open ? " is-open" : ""}`}>
      <button className="acc-q" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{q}</span><Icon name="chevron-down" />
      </button>
      <div className="acc-a" style={{ maxHeight: open ? 420 : 0 }}>
        <p>{a}</p>
      </div>
    </div>
  );
}

export default function Contact() {
  const toast = useToast();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") || ""),
      email: String(data.get("email") || ""),
      phone: String(data.get("phone") || ""),
      subject: String(data.get("subject") || ""),
      message: String(data.get("message") || ""),
    };
    try { await api.contact(payload); } catch { /* soft-fail */ }
    toast("Message received. We reply within one working day.");
    form.reset();
  }

  return (
    <>
      <section className="page-hero">
        <img src="/assets/img/mandala.svg" className="watermark watermark--tl" alt="" />
        <img src="/assets/img/lotus.svg" className="watermark watermark--tr" alt="" style={{ width: 220 }} />
        <div className="shell" style={{ position: "relative", zIndex: 1 }}>
          <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> <span>/</span> Contact</nav>
          <h1 className="section-title" style={{ marginTop: 10 }}>Baat Karein</h1>
          <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>
          <p className="section-sub">A real person reads every message. For a puja, though, contact pandit ji directly — that is always faster.</p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 44 }}>
        <div className="shell split split--narrow">
          <form className="card card-pad" onSubmit={onSubmit}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: 6 }}>Send us a message</h2>
            <p className="muted" style={{ marginBottom: 20 }}>We reply within one working day.</p>
            <div className="grid g-2" style={{ gap: 16 }}>
              <div><label className="label" htmlFor="ctName">Your name</label><input className="input" id="ctName" name="name" required /></div>
              <div><label className="label" htmlFor="ctMail">Email</label><input className="input" id="ctMail" name="email" type="email" required /></div>
              <div><label className="label" htmlFor="ctPhone">Phone (optional)</label><input className="input" id="ctPhone" name="phone" type="tel" /></div>
              <div>
                <label className="label" htmlFor="ctSubject">Subject</label>
                <select className="select" id="ctSubject" name="subject">
                  {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <label className="label" htmlFor="ctMsg">Message</label>
              <textarea className="textarea" id="ctMsg" name="message" required placeholder="Tell us what you need." />
            </div>
            <button className="btn btn-gold" type="submit" style={{ marginTop: 18 }}>
              <Icon name="send" size={18} /> Send message
            </button>
            <p className="form-note">We never share your details with third parties, and we do not sell contact data.</p>
          </form>

          <aside className="stack" style={{ gap: 16 }}>
            <div className="card card-pad card--cream">
              <h3 style={{ fontSize: "1.16rem" }}>Reach us</h3>
              <ul className="dot-list" style={{ marginTop: 10 }}>
                <li>namaste@panditconnect.in</li>
                <li>+91 90000 00000 (9 AM – 7 PM IST)</li>
                <li>Varanasi · Ujjain · Bengaluru</li>
              </ul>
            </div>
            <div className="card card-pad">
              <h3 style={{ fontSize: "1.16rem" }}>Aap Pandit ji hain?</h3>
              <p className="muted" style={{ marginTop: 8 }}>Basic listing free hai — hamesha. Profile banao, verification complete karo, devotees seedha contact karenge.</p>
              <Link className="btn btn-gold btn-block btn-sm" to="/dashboard" style={{ marginTop: 14 }}>Open Pandit Dashboard</Link>
            </div>
            <div className="card card-pad">
              <h3 style={{ fontSize: "1.16rem" }}>Temple trust?</h3>
              <p className="muted" style={{ marginTop: 8 }}>Listing a temple is free. We add photos, timings, sevas and map your associated pandits.</p>
              <a className="btn btn-outline btn-block btn-sm" href="#top" style={{ marginTop: 14 }}>Partnership details</a>
            </div>
          </aside>
        </div>
      </section>

      <section className="section section--cream" id="faq">
        <div className="shell" style={{ maxWidth: 860 }}>
          <h2 className="section-title">Frequently Asked Questions</h2>
          <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>
          <div style={{ marginTop: 34 }}>
            {faqs.map((f, i) => <FaqItem q={f.q} a={f.a} key={f.q} defaultOpen={i === 0} />)}
          </div>
        </div>
      </section>
    </>
  );
}
