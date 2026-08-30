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
  ["/ai-recommender", "footer.aiPoojaGuide"],
];

const COMPANY: [string, string][] = [
  ["/about", "footer.aboutUs"],
  ["/how-it-works", "footer.howItWorks"],
  ["/blog", "footer.spiritualBlog"],
  ["/contact", "footer.contact"],
];

const SUPPORT: [string, string][] = [
  ["/dashboard", "footer.panditDashboard"],
  ["/contact#faq", "footer.faq"],
  ["/about#verify", "footer.verificationProcess"],
];

/** One collapsible link column. A native <details>/<summary> — collapsed by
 *  default (compact on a phone-length footer), no JS needed for the
 *  toggle; base.css forces it permanently open (and hides the chevron) from
 *  tablet width up, where there's room to just show the links. */
function FooterAccordion({ title, links, t }: { title: string; links: [string, string][]; t: (k: string) => string }) {
  return (
    <details className="footer-acc">
      <summary className="footer-acc__head">
        {title}
        <Icon name="chevron-down" size={16} className="footer-acc__chevron" />
      </summary>
      <div className="footer-acc__body">
        {links.map(([href, labelKey]) => <Link key={href} to={href}>{t(labelKey)}</Link>)}
      </div>
    </details>
  );
}

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
        <div className="footer-col footer-col--brand">
          <Link className="brand" to="/" aria-label="PanditSuggest home">
            <img src="/assets/img/logo-header.webp" alt="PanditSuggest Logo" width={60} height={60} style={{ objectFit: 'contain' }} />
            <span className="brand-name" style={{ fontSize: "1.3rem" }}>Pandit <span>Suggest</span></span>
          </Link>
          <p className="muted" style={{ marginTop: 14, maxWidth: 330 }}>
            {t("footer.tagline")}
          </p>
          <ul className="footer-contact">
            <li><Icon name="phone" size={14} /> +91 90000 00000</li>
            <li><Icon name="mail" size={14} /> namaste@panditsuggest.in</li>
          </ul>
          <div className="socials">
            {SOCIALS.map(([icon, label]) => (
              <a key={icon} href="#" aria-label={label} title={label}><Icon name={icon} size={18} /></a>
            ))}
          </div>
        </div>

        <FooterAccordion title={t("footer.explore")} links={EXPLORE} t={t} />
        <FooterAccordion title={t("footer.company")} links={COMPANY} t={t} />
        <FooterAccordion title={t("footer.support")} links={SUPPORT} t={t} />

        <div className="footer-col footer-col--newsletter">
          <h4>{t("footer.weeklyMail")}</h4>
          <p className="muted">{t("footer.newsletterTitle")}</p>
          <form className="footer-newsletter-form" onSubmit={onSubmit}>
            <label className="sr-only" htmlFor="nlMail">{t("footer.emailAddressLabel")}</label>
            <input className="input" id="nlMail" type="email" required placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn btn-gold" type="submit"><Icon name="send" size={17} /> {t("footer.subscribe")}</button>
          </form>
        </div>
      </div>

      <div className="shell footer-bottom">
        <span>{t("footer.copyright")}</span>
        <span className="row footer-bottom__legal">
          <Link to="/privacy">{t("footer.privacy")}</Link>
          <Link to="/terms">{t("footer.terms")}</Link>
          <a href="#">{t("footer.sitemap")}</a>
        </span>
      </div>
    </footer>
  );
}
