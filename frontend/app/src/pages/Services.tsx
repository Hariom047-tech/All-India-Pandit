import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../lib/icons";
import { useServices, useServiceCategories } from "../hooks/useData";
import { normServices } from "../lib/normalize";
import { EmptyState } from "../components/ui/ReviewCard";
import { SacredBackground } from "../components/ui/SacredBackground";
import { HeroTicker } from "../components/ui/HeroTicker";
import { useLang } from "../lib/i18n";
import { Seo } from "../lib/Seo";

export default function Services() {
  const { t } = useLang();
  const { data: rawServices } = useServices();
  const services = useMemo(() => normServices(rawServices), [rawServices]);

  /**
   * "Most booked" tiles, admin-curated.
   *
   * This was a literal array with invented pandit counts (186 / 257 / 251 /
   * 167) that could never be right, and four fixed stock images. Categories
   * now carry their own image and the counts are computed from
   * pandit_services, so the number on screen is either true or absent.
   *
   * The old array stays as a fallback only until an admin sets home_rank on
   * some categories — otherwise the strip would vanish on first deploy.
   */
  const { data: apiCategories } = useServiceCategories();

  const MOST_BOOKED = useMemo(() => {
    if (apiCategories?.length) {
      return apiCategories.map((c) => ({
        cat: c.slug,
        label: c.name,
        img: c.image_url || `/assets/img/services/cat-${c.slug}.jpg`,
        pandits: c.pandit_count,
        services: c.service_count,
        tagline: c.tagline,
      }));
    }
    return [
      { cat: "life", label: t("services.catLife"), img: "/assets/img/services/cat-life.jpg", pandits: 0, services: 0, tagline: null },
      { cat: "daily", label: t("services.catDaily"), img: "/assets/img/services/cat-daily.jpg", pandits: 0, services: 0, tagline: null },
      { cat: "festival", label: t("services.catFestival"), img: "/assets/img/services/cat-festival.jpg", pandits: 0, services: 0, tagline: null },
      { cat: "shanti", label: t("services.catShanti"), img: "/assets/img/services/cat-shanti.jpg", pandits: 0, services: 0, tagline: null },
    ];
  }, [apiCategories, t]);
  const [query] = useState("");
  const [onlineOnly, setOnlineOnly] = useState(false);
  // Which "Most Booked" tile (if any) the grid below is currently filtered
  // to — those tiles used to be inert decoration with nothing to click
  // through to; this is what makes them do something.
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const allServicesRef = useRef<HTMLElement>(null);

  const filtered = useMemo(() => {
    return services.filter((s) => {
      if (query && !`${s.name} ${s.tag} ${s.desc}`.toLowerCase().includes(query.toLowerCase())) return false;
      if (onlineOnly && !s.onlineAvailable) return false;
      if (categoryFilter && s.cat !== categoryFilter) return false;
      return true;
    });
  }, [services, query, onlineOnly, categoryFilter]);

  function selectCategory(cat: string) {
    setCategoryFilter((prev) => (prev === cat ? null : cat));
    allServicesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const onlineCount = useMemo(() => services.filter((s) => s.onlineAvailable).length, [services]);

  return (
    <div className="hp-sacred-section" style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <Seo
        title="All Puja & Havan Services — Book a Pandit"
        description="33+ traditional rituals, from daily aarti to Griha Pravesh, Rudrabhishek and Satyanarayan Katha — with samagri lists and verified Pandits who perform each service."
        path="/services"
      />
      <SacredBackground />
      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ======================== HERO ======================== */}
        <section className="sp-hero">
          <div className="shell">
            <div className="sp-hero__grid">
              <div className="sp-hero__content">
                <h1 className="sp-hero__title">
                  {t("services.heroTitle1")} <br />
                  <span className="gold-text">{t("services.heroTitleGold")}</span>
                </h1>
                <ul className="sp-hero__list">
                  <li>
                    <div className="sp-hero__check"><Icon name="check" size={14} /></div>
                    {t("services.heroCheck1")}
                  </li>
                  <li>
                    <div className="sp-hero__check"><Icon name="check" size={14} /></div>
                    {t("services.heroCheck2")}
                  </li>
                  <li>
                    <div className="sp-hero__check"><Icon name="check" size={14} /></div>
                    {t("services.heroCheck3")}
                  </li>
                </ul>
                <div className="sp-hero__cta">
                  <Link to="/pandits" className="btn btn-gold btn-lg btn-pill">
                    {t("services.heroCta")} <Icon name="arrow-right" size={18} />
                  </Link>
                </div>
              </div>
              <div className="sp-hero__img-wrap">
                <img src="/assets/img/services/pandit-hero.jpg" alt="Pandit performing puja" className="sp-hero__img" />
                <div className="sp-hero__glow" />
              </div>
            </div>
          </div>

          {/* Scrolling ticker */}
          <HeroTicker />
        </section>

        {/* ======================== MOST BOOKED ======================== */}
        <section className="section" style={{ paddingTop: 40, paddingBottom: 30 }}>
          <div className="shell">
            <h2 className="sp-section-title">{t("services.mostBooked")}</h2>
            <div className="sp-booked-row">
              {MOST_BOOKED.map((mb) => (
                <button
                  key={mb.cat}
                  type="button"
                  className={`sp-booked-card${categoryFilter === mb.cat ? " is-active" : ""}`}
                  onClick={() => selectCategory(mb.cat)}
                  aria-pressed={categoryFilter === mb.cat}
                >
                  <img src={mb.img} alt={mb.label} className="sp-booked-card__img" loading="lazy" />
                  <div className="sp-booked-card__overlay" />
                  <span className="sp-booked-card__badge">⭐ {t("services.popular")}</span>
                  <div className="sp-booked-card__bottom">
                    <h4 className="sp-booked-card__name">{mb.label}</h4>
                    <div className="sp-booked-card__meta">
                      {/* Show a count only when there is a real one. A hardcoded
                          "257 Pandits" under a category with zero mapped
                          pandits is worse than showing nothing. */}
                      {mb.pandits > 0
                        ? <span>{mb.pandits} {t("services.pandits")}</span>
                        : mb.services > 0
                          ? <span>{mb.services} {mb.services === 1 ? "service" : "services"}</span>
                          : mb.tagline
                            ? <span>{mb.tagline}</span>
                            : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ======================== ALL SERVICES GRID ======================== */}
        <section className="section" style={{ paddingTop: 10, paddingBottom: 50 }} ref={allServicesRef}>
          <div className="shell">
            <div className="sp-all-header">
              <div className="sp-all-header__left">
                <h2 className="sp-section-title" style={{ margin: 0 }}>{t("services.title")}</h2>
                <span className="muted sp-all-header__count">{filtered.length} {t("services.servicesFound")}</span>
              </div>
              {/* Set by clicking a "Most Booked" tile above — the only way
                  this grid can be scoped to one category. */}
              {categoryFilter && (
                <button
                  type="button"
                  className="sp-online-toggle sp-all-header__online is-on"
                  onClick={() => setCategoryFilter(null)}
                >
                  {MOST_BOOKED.find((mb) => mb.cat === categoryFilter)?.label || categoryFilter} ✕
                </button>
              )}
              {/* Rendered only when something is actually available online —
                  an "Online" filter that always returns nothing is worse
                  than no filter. */}
              {onlineCount > 0 && (
                <button
                  type="button"
                  className={`sp-online-toggle sp-all-header__online${onlineOnly ? " is-on" : ""}`}
                  aria-pressed={onlineOnly}
                  onClick={() => setOnlineOnly((v) => !v)}
                >
                  🌐 Online puja ({onlineCount})
                </button>
              )}
            </div>

            {filtered.length ? (
              <div className="sp-all-grid">
                {filtered.map((s) => (
                  <Link
                    to={`/services/${s.id}`}
                    className="sp-all-card"
                    key={s.id}
                  >
                    <img
                      src={s.img ? s.img.replace('.jpg', '_new.jpg') : (s.name.toLowerCase().includes('havan') ? '/assets/img/services/tiles/havan_new.jpg' : '/assets/img/services/tiles/puja_new.jpg')}
                      alt={s.name}
                      className="sp-all-card__img"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).src = s.name.toLowerCase().includes('havan') ? '/assets/img/services/tiles/havan_new.jpg' : '/assets/img/services/tiles/puja_new.jpg'; }}
                    />
                    <div className="sp-all-card__overlay" />
                    {s.onlineAvailable && <span className="sp-online-badge">🌐 Online</span>}
                    <div className="sp-all-card__bottom">
                      <h4 className="sp-all-card__name">{s.name}</h4>
                      <p className="sp-all-card__tag">{s.tag}</p>
                      <div className="sp-all-card__meta">
                        <span className="sp-all-card__meta-dur"><Icon name="clock" size={13} /> {s.dur}</span>
                        <span className="sp-all-card__meta-pandits"><Icon name="users" size={13} /> {s.pandits} {t("services.pandits")}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState msg={t("services.noServiceMatch")} />
            )}
          </div>
        </section>

        {/* ======================== TRUST FOOTER ======================== */}
        <section className="sp-trust-footer">
          <div className="shell">
            <div className="sp-trust-footer__inner">
              <p className="sp-trust-footer__text" dangerouslySetInnerHTML={{ __html: t("services.trustText") }} />
              <div className="sp-trust-footer__badges">
                <span className="sp-trust-badge">{t("services.verifiedPandits")}</span>
                <span className="sp-trust-badge">{t("services.authenticRituals")}</span>
                <span className="sp-trust-badge">{t("services.ratingBadge")}</span>
                <span className="sp-trust-badge">{t("services.panIndia")}</span>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
