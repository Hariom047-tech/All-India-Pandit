import { Link } from "react-router-dom";
import { useState, type FormEvent } from "react";
import { Icon } from "../../lib/icons";
import { api } from "../../lib/api";
import { useToast } from "../ui/Toast";
import { useLang } from "../../lib/i18n";

const SOCIALS: [string, string][] = [
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["youtube", "YouTube"],
  ["twitter", "X"],
  ["linkedin", "LinkedIn"],
];

const EXPLORE: [string, string][] = [
  ["/temples", "footer.templeDirectory"],
  ["/pandits", "footer.panditDirectory"],
  ["/services", "footer.allServices"],
  ["/temple-map", "footer.templeMap"],
  ["/panchang", "footer.panchangMuhurat"],
  ["/ai-recommender", "footer.aiPoojaGuide"],
];

const COMPANY: [string, string][] = [
  ["/about", "footer.aboutUs"],
  ["/blog", "footer.spiritualBlog"],
  ["/contact", "footer.contact"],
  ["/dashboard", "footer.panditDashboard"],
  ["/contact#faq", "footer.faq"],
  ["/about#verify", "footer.verificationProcess"],
];

export function Footer() {
  const [email, setEmail] = useState("");
  const toast = useToast();
  const { t } = useLang();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const done = () => {
      toast(t("footer.subscribedToast"));
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
          <Link className="brand" to="/" aria-label="PanditSuggest home">
            <img src="/assets/img/logo-suggest.svg" alt="PanditSuggest Logo" style={{ objectFit: 'contain' }} width={40} height={40} />
            <span className="brand-name" style={{ fontSize: "1.3rem" }}>Pandit <span>Suggest</span></span>
          </Link>
          <p className="muted" style={{ marginTop: 14, maxWidth: 330 }}>
            {t("footer.tagline")}
          </p>
          <div className="socials">
            {SOCIALS.map(([icon, label]) => (
              <a key={icon} href="#" aria-label={label} title={label}><Icon name={icon} size={18} /></a>
            ))}
          </div>
        </div>

        <div className="footer-col">
          <h4>{t("footer.explore")}</h4>
          {EXPLORE.map(([href, labelKey]) => <Link key={href} to={href}>{t(labelKey)}</Link>)}
        </div>

        <div className="footer-col">
          <h4>{t("footer.company")}</h4>
          {COMPANY.map(([href, labelKey]) => <Link key={href} to={href}>{t(labelKey)}</Link>)}
        </div>

        <div className="footer-col">
          <h4>{t("footer.weeklyMail")}</h4>
          <p className="muted">{t("footer.newsletterTitle")}</p>
          <form className="stack" style={{ gap: 10, marginTop: 12 }} onSubmit={onSubmit}>
            <label className="sr-only" htmlFor="nlMail">{t("footer.emailAddressLabel")}</label>
            <input className="input" id="nlMail" type="email" required placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn btn-gold" type="submit"><Icon name="send" size={17} /> {t("footer.subscribe")}</button>
          </form>
          <ul style={{ marginTop: 16 }}>
            <li><Icon name="phone" size={14} /> +91 90000 00000</li>
            <li><Icon name="mail" size={14} /> namaste@panditsuggest.in</li>
          </ul>
        </div>
      </div>

      <div className="shell footer-bottom">
        <span>{t("footer.copyright")}</span>
        <span className="row" style={{ gap: 18 }}>
          <a href="#">{t("footer.privacy")}</a><a href="#">{t("footer.terms")}</a><a href="#">{t("footer.sitemap")}</a>
        </span>
      </div>
    </footer>
  );
}
