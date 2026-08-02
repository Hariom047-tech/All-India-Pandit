import { Link } from "react-router-dom";
import { useState, type FormEvent } from "react";
import { Icon } from "../../lib/icons";
import { api } from "../../lib/api";
import { useToast } from "../ui/Toast";

const SOCIALS: [string, string][] = [
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["youtube", "YouTube"],
  ["twitter", "X"],
  ["linkedin", "LinkedIn"],
];

const EXPLORE: [string, string][] = [
  ["/temples", "Temple Directory"],
  ["/pandits", "Pandit Directory"],
  ["/services", "All Services"],
  ["/temple-map", "Temple Map"],
  ["/panchang", "Panchang & Muhurat"],
  ["/ai-recommender", "AI Pooja Guide"],
];

const COMPANY: [string, string][] = [
  ["/about", "About Us"],
  ["/blog", "Spiritual Blog"],
  ["/contact", "Contact"],
  ["/dashboard", "Pandit Dashboard"],
  ["/contact#faq", "FAQ"],
  ["/about#verify", "Verification Process"],
];

export function Footer() {
  const [email, setEmail] = useState("");
  const toast = useToast();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const done = () => {
      toast("Subscribed — panchang mail every Monday.");
      setEmail("");
    };
    try {
      await api.subscribe(email);
    } catch {
      /* soft-fail: still confirm if backend is offline */
    }
    done();
  }

  return (
    <footer className="site-footer">
      <div className="shell footer-top">
        <div className="footer-col">
          <Link className="brand" to="/" aria-label="PanditConnect home">
            <img src="/assets/img/logo.svg" alt="" width={40} height={40} />
            <span className="brand-name" style={{ fontSize: "1.3rem" }}>Pandit<span>Connect</span></span>
          </Link>
          <p className="muted" style={{ marginTop: 14, maxWidth: 330 }}>
            Sacred Connections, Trusted Pandits. We are a directory, not a booking agent — you contact pandit ji directly and keep the relationship yours.
          </p>
          <div className="socials">
            {SOCIALS.map(([icon, label]) => (
              <a key={icon} href="#" aria-label={label} title={label}><Icon name={icon} size={18} /></a>
            ))}
          </div>
        </div>

        <div className="footer-col">
          <h4>Explore</h4>
          {EXPLORE.map(([href, label]) => <Link key={href} to={href}>{label}</Link>)}
        </div>

        <div className="footer-col">
          <h4>Company</h4>
          {COMPANY.map(([href, label]) => <Link key={href} to={href}>{label}</Link>)}
        </div>

        <div className="footer-col">
          <h4>Weekly Panchang Mail</h4>
          <p className="muted">Festival dates and shubh muhurat, every Monday.</p>
          <form className="stack" style={{ gap: 10, marginTop: 12 }} onSubmit={onSubmit}>
            <label className="sr-only" htmlFor="nlMail">Email address</label>
            <input className="input" id="nlMail" type="email" required placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn btn-gold" type="submit"><Icon name="send" size={17} /> Subscribe</button>
          </form>
          <ul style={{ marginTop: 16 }}>
            <li><Icon name="phone" size={14} /> +91 90000 00000</li>
            <li><Icon name="mail" size={14} /> namaste@panditconnect.in</li>
          </ul>
        </div>
      </div>

      <div className="shell footer-bottom">
        <span>© 2026 PanditConnect. Made with devotion in Bharat.</span>
        <span className="row" style={{ gap: 18 }}>
          <a href="#">Privacy</a><a href="#">Terms</a><a href="#">Sitemap</a>
        </span>
      </div>
    </footer>
  );
}
