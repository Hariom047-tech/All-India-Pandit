import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../lib/icons";
import { useService, useServices, usePandits, useTemples } from "../hooks/useData";
import { normService, normServices, normPandits, normTemples } from "../lib/normalize";
import { useFairRanking, useReportExposure } from "../lib/api";
import { useUrlTab } from "../hooks/useUrlTab";
import { Loading, ErrorState } from "../components/ui/DataState";
import { getServiceMeta } from "../data/serviceMeta";
import { PanditCard } from "../components/ui/PanditCard";
import { TempleCard } from "../components/ui/TempleCard";
import { ServiceCard } from "../components/ui/ServiceCard";
import { EmptyState } from "../components/ui/ReviewCard";
import { useEnquiryModal } from "../components/ui/EnquiryModal";
import { SacredBackground } from "../components/ui/SacredBackground";
import { Seo } from "../lib/Seo";
import { useStructuredData, breadcrumbSchema, serviceSchema, faqPageSchema, organizationSchema, websiteSchema, webPageSchema, serviceId } from "../lib/structuredData";
import { isServiceIndexable } from "../lib/indexability";

type Tab = "overview" | "samagri" | "pandits" | "reviews";
const TAB_KEYS: readonly Tab[] = ["overview", "samagri", "pandits", "reviews"];

export default function ServiceDetail() {
  const { id } = useParams();
  const { data: rawService, loading, error } = useService(id || "");
  const { data: rawServices } = useServices();
  // 600: "limit" was never a real API param (silently ignored, falling back
  // to a 12-row default) — see Pandits.tsx for the full explanation.
  const { data: rawPandits } = usePandits({ perPage: 600 });
  // Server-side filtered by the temples list endpoint's own `service` param
  // (temples.repository.js's list()) — NOT client-filtered from an unfiltered
  // batch: the temples LIST endpoint's row shape has no `services` field at
  // all (only the single-temple detail endpoint joins that), so filtering an
  // unfiltered `useTemples({perPage:50})` batch by `t.services.includes(...)`
  // always evaluated against an empty array and silently returned nothing,
  // regardless of real temple-service relationships. Found while wiring this
  // list up for the first time (docs/SEO_ARCHITECTURE.md, Phase 6).
  const { data: rawTemplesForService } = useTemples({ service: id, perPage: 6 });

  const s = useMemo(() => rawService ? normService(rawService) : null, [rawService]);
  const services = useMemo(() => normServices(rawServices), [rawServices]);
  const allPandits = useMemo(() => normPandits(rawPandits), [rawPandits]);
  const temples = useMemo(() => normTemples(rawTemplesForService), [rawTemplesForService]);

  const openEnquiry = useEnquiryModal();
  // URL-backed, not component memory — see useUrlTab. This is the actual fix
  // for the "Pandits tab → refresh → back to Overview" bug: activeTab used
  // to live only in useState, which a full reload always destroys, and
  // nothing in this file ever restored it from anywhere.
  const [activeTab, setActiveTab] = useUrlTab<Tab>(TAB_KEYS, "overview");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Fair, market-aware rotation instead of a frozen rating sort — same
  // engine and pattern as /pandits and the temple detail page, scoped to
  // this service. Always enabled (not just on the Pandits tab): a small
  // preview now renders on Overview too (docs/SEO_ARCHITECTURE.md, Phase 6 —
  // a service page must link to pandits who perform it without requiring a
  // tab click first), and it must go through the same rotation as the full
  // tab, never a separate "SEO ranking".
  const fairScores = useFairRanking(undefined, s?.id, { enabled: Boolean(s) });
  const pandits = useMemo(() => {
    if (!s) return [];
    const list = allPandits.filter((p) => p.services.includes(s.id));
    return [...list].sort((a, b) => {
      if (fairScores) {
        const diff = (fairScores.get(b.id) ?? -Infinity) - (fairScores.get(a.id) ?? -Infinity);
        if (diff) return diff;
      }
      return b.rating - a.rating;
    });
  }, [allPandits, s, fairScores]);
  const previewPandits = useMemo(() => pandits.slice(0, 6), [pandits]);
  // Exposure reporting must always match exactly what's visible right now —
  // the Overview preview or the full Pandits tab (its own top 6), never
  // both, never neither.
  const visiblePandits = activeTab === "pandits" ? pandits.slice(0, 6) : previewPandits;
  useReportExposure(visiblePandits.map((p) => p.id), {
    service: s?.id,
    enabled: Boolean(s),
  });

  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 620);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 620);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Hook call must be unconditional (before the loading/error early returns
  // below) — see docs/SEO_ARCHITECTURE.md. Passing null until data arrives.
  useStructuredData(s ? (() => {
    const apiRaw = rawService as { faqs?: { q: string; a: string }[]; short_description?: string | null; image_url?: string | null; meta_title?: string | null } | null;
    const staticFallback = getServiceMeta(s.id);
    const faqsForSchema = apiRaw?.faqs?.length ? apiRaw.faqs : staticFallback.faq;
    return [
      organizationSchema(),
      websiteSchema(),
      webPageSchema({
        path: `/services/${s.id}`,
        name: apiRaw?.meta_title || `${s.name} — Puja & Havan Service`,
        aboutId: serviceId(`/services/${s.id}`),
      }),
      breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "Services", path: "/services" },
        { name: s.name, path: `/services/${s.id}` },
      ]),
      serviceSchema({
        name: s.name, path: `/services/${s.id}`,
        description: s.desc || apiRaw?.short_description || staticFallback.tagline,
        image: apiRaw?.image_url || staticFallback.heroImg,
      }),
      faqPageSchema(faqsForSchema),
    ];
  })() : null);

  if (loading) return <div className="section"><div className="shell"><Loading lines={1} type="detail" /></div></div>;
  if (error || !s) return <div className="section"><div className="shell"><ErrorState message={error || "Service not found"} /></div></div>;

  const allRelated = services.filter((x) => x.id !== s.id && x.cat === s.cat);
  const related = allRelated.slice(0, isMobile ? 6 : 4);
  const hasMoreRelated = allRelated.length > (isMobile ? 6 : 4);
  /**
   * Admin-managed content, from the API. `serviceMeta` is no longer the source
   * of truth — it survives only as a fallback so the 32 services seeded before
   * this feature existed do not suddenly render empty sections. Once a service
   * has admin content, none of the static table is used for it.
   */
  const api = rawService as unknown as {
    benefits?: { title: string; detail?: string }[];
    process?: { step?: number; title: string; detail?: string; duration?: string }[];
    faqs?: { q: string; a: string }[];
    samagri?: ({ item: string; qty?: string } | string)[];
    image_url?: string | null;
    is_online_available?: boolean;
    online_note?: string | null;
    onlinePandits?: { id: string; slug?: string; name: string; img?: string; city?: string }[];
    recommended_muhurat?: string | null;
    short_description?: string | null;
    meta_title?: string | null;
    meta_description?: string | null;
  } | null;

  const staticMeta = getServiceMeta(s.id);

  const benefits = (api?.benefits?.length
    ? api.benefits.map((b) => ({ icon: "🕉️", title: b.title, detail: b.detail }))
    : staticMeta.benefits.map((b) => ({ ...b, detail: undefined as string | undefined })));

  const process = (api?.process?.length
    ? api.process.map((p, i) => ({ step: p.step ?? i + 1, title: p.title, desc: p.detail || "", duration: p.duration }))
    : staticMeta.process.map((p) => ({ ...p, duration: undefined as string | undefined })));

  const faqs = api?.faqs?.length ? api.faqs : staticMeta.faq;

  // samagri arrives as [{item, qty}] from the admin editor, but older seeded
  // rows are a plain string[]. Normalise both to a display string.
  const samagriItems: string[] = (api?.samagri?.length
    ? api.samagri.map((x) => (typeof x === "string" ? x : [x.item, x.qty].filter(Boolean).join(" — ")))
    : (s.samagri || []));

  const heroImg = api?.image_url || staticMeta.heroImg;
  const tagline = api?.short_description || staticMeta.tagline;

  const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "pandits", label: "Pandits" },
    { key: "samagri", label: "Samagri" },
    { key: "reviews", label: "Reviews" },
  ];

  return (
    <div className="hp-sacred-section" style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <Seo
        title={api?.meta_title || `${s.name} — Puja & Havan Service`}
        description={api?.meta_description || tagline || `${s.name}: traditional significance, process and samagri, with verified Pandits available to perform it at your temple, online, or at home.`}
        path={`/services/${s.id}`}
        image={heroImg}
        noindex={!isServiceIndexable(s)}
      />
      <SacredBackground />
      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ======================== SPLIT HERO ======================== */}
        <section className="sd-hero">
          <div className="shell">
            <div className="sd-hero__grid">
              {/* Left: Image */}
              <div className="sd-hero__img-wrap">
                <img src={heroImg} alt={s.name} className="sd-hero__img" fetchPriority="high" />
                <div className="sd-hero__img-overlay" />
              </div>

              {/* Right: Info Card */}
              <div className="sd-hero__info">
                <h1 className="sd-hero__title">{s.name}</h1>
                <div className="sd-hero__rating">
                  <span className="sd-hero__star">★</span>
                  <strong>4.9</strong>
                  <span className="sd-hero__reviews">(2,450+ reviews)</span>
                </div>
                <p className="sd-hero__tagline">{tagline}</p>

                <div className="sd-hero__highlights">
                  <div className="sd-hero__hl-row">
                    <span className="sd-hero__hl-icon">⏱</span>
                    <span>Duration: {s.dur}</span>
                  </div>
                  <div className="sd-hero__hl-row">
                    <span className="sd-hero__hl-icon">📿</span>
                    <span>Complete Samagri Kit Included</span>
                  </div>
                  <div className="sd-hero__hl-row">
                    <span className="sd-hero__hl-icon">🔥</span>
                    <span>Includes Havan & Vastu Shanti</span>
                  </div>
                  <div className="sd-hero__hl-row">
                    <span className="sd-hero__hl-icon">👨‍🦳</span>
                    <span>Verified Vedic Pandits</span>
                  </div>
                </div>

                <div className="sd-hero__cta-wrap">
                  <button
                    className="sd-hero__cta"
                    onClick={() => openEnquiry({ service: s.id })}
                  >
                    🙏 Connect with Pandit
                  </button>
                  <p className="sd-hero__cta-sub">{s.pandits} verified pandits available near you</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ======================== TAB NAV ======================== */}
        <nav className="sd-tabs">
          <div className="shell">
            <div className="sd-tabs__list">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  className={`sd-tabs__btn ${activeTab === t.key ? "sd-tabs__btn--active" : ""}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* ======================== TAB CONTENT ======================== */}

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <section className="section" style={{ paddingTop: 48 }}>
            <div className="shell sd-content-grid">
              <div className="sd-main">
                {/* Spiritual Significance */}
                <div className="sd-card">
                  <h2 className="sd-card__title">
                    <span className="sd-card__title-icon">🕉️</span>
                    Spiritual Significance
                  </h2>
                  <p className="sd-card__text">{s.desc}</p>
                  <p className="sd-card__text" style={{ marginTop: 12 }}>
                    This sacred ceremony has been performed for centuries in the Hindu tradition. It is believed to purify the space, remove negative energies, and invite divine blessings for everyone involved. The mantras chanted during the puja create powerful vibrations that bring peace and positive energy.
                  </p>
                </div>

                {/* Benefits — Premium Scroll Strip */}
                {api?.is_online_available && (
                  <div className="sd-online-card">
                    <h3>🌐 Online puja / havan available</h3>
                    <p>{api.online_note || "Yeh puja video call par live karvai ja sakti hai — sankalp aapke naam se."}</p>
                    {api.onlinePandits?.length ? (
                      <>
                        <span className="sd-online-card__label">
                          {api.onlinePandits.length} Pandit ji online available
                        </span>
                        <div className="sd-online-card__pandits">
                          {api.onlinePandits.slice(0, 6).map((op) => (
                            <Link key={op.id} to={`/pandits/${op.slug || op.id}`} className="sd-online-pandit">
                              <img src={op.img || "/assets/img/pandits/default.jpg"} alt="" />
                              <span>{op.name}</span>
                            </Link>
                          ))}
                        </div>
                      </>
                    ) : (
                      <span className="sd-online-card__label">
                        Online ke liye Pandit ji jald hi allocate honge.
                      </span>
                    )}
                  </div>
                )}

                <div className="sd-benefits-section">
                  <div className="sd-benefits-header">
                    <h2 className="sd-card__title" style={{ margin: 0 }}>
                      <span className="sd-card__title-icon">✨</span>
                      Benefits
                    </h2>
                    <span className="sd-benefits-count">{benefits.length} blessings</span>
                  </div>
                  <div className="sd-benefits-strip">
                    {benefits.map((b) => (
                      <div className="sd-benefit-chip" key={b.title}>
                        <div className="sd-benefit-chip__glow" />
                        <div className="sd-benefit-chip__icon">{b.icon}</div>
                        <span className="sd-benefit-chip__label">{b.title}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Puja Process — Sacred Journey Timeline ── */}
                <div className="sd-journey-wrap">
                  {/* Warm cream + golden glow background */}
                  <div className="sd-journey-bg" />
                  <div className="sd-journey-glow" />

                  <div className="sd-journey-head">
                    <span className="sd-journey-head__icon">🪔</span>
                    <div>
                      <h2 className="sd-journey-title">Sacred Journey</h2>
                      <p className="sd-journey-sub">{process.length} steps · Complete Vidhi</p>
                    </div>
                  </div>

                  <div className="sd-journey-steps">
                    {process.map((p, i) => (
                      <motion.div
                        className="sd-journey-step"
                        key={p.step}
                        initial={{ opacity: 0, x: -28 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-30px" }}
                        transition={{ duration: 0.55, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {/* Connector line */}
                        {i < process.length - 1 && (
                          <motion.div
                            className="sd-journey-connector"
                            initial={{ scaleY: 0 }}
                            whileInView={{ scaleY: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: i * 0.12 + 0.3 }}
                            style={{ transformOrigin: "top" }}
                          />
                        )}

                        {/* Badge */}
                        <motion.div
                          className="sd-journey-badge"
                          initial={{ scale: 0, rotate: -30 }}
                          whileInView={{ scale: 1, rotate: 0 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.4, delay: i * 0.12, type: "spring", stiffness: 200 }}
                        >
                          <span className="sd-journey-badge__num">{p.step}</span>
                          <div className="sd-journey-badge__ring" />
                        </motion.div>

                        {/* Content card */}
                        <motion.div
                          className="sd-journey-card"
                          initial={{ opacity: 0, y: 10 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.4, delay: i * 0.12 + 0.1 }}
                          whileHover={{ scale: 1.02 }}
                        >
                          <h4 className="sd-journey-card__title">{p.title}</h4>
                          <p className="sd-journey-card__desc">{p.desc}</p>
                          <span className="sd-journey-card__step-label">Step {p.step} of {process.length}</span>
                        </motion.div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Pandits who perform this service — always in the DOM on the
                    default tab (not gated behind the Pandits tab click), so
                    the service page always links out to real pandit profiles
                    (docs/SEO_ARCHITECTURE.md, Phase 6). Runs through the same
                    fair-rotation engine as the full tab — see fairScores/
                    visiblePandits above, never a separate order. */}
                {previewPandits.length > 0 && (
                  <div>
                    <div className="row-between">
                      <h2 className="sd-card__title" style={{ margin: 0 }}>
                        <span className="sd-card__title-icon">🙏</span>
                        Pandits who perform this puja
                      </h2>
                      <Link
                        className="row" style={{ color: "var(--gold-deep)", fontWeight: 600, fontSize: ".9rem" }}
                        to={`/services/${s.id}/pandits`}
                      >
                        All {pandits.length} <Icon name="chevron-right" size={16} />
                      </Link>
                    </div>
                    <div className="grid g-3 grid-2up-mobile" style={{ marginTop: 14 }}>
                      {previewPandits.map((p, i) => <PanditCard p={p} key={p.id} index={i} sourceSurface="service_detail_preview" />)}
                    </div>
                  </div>
                )}

                {/* Temples where this service is offered — the `temples`
                    filtered list was already computed but never rendered
                    anywhere; a real, cheap internal-linking gap (Phase 6). */}
                {temples.length > 0 && (
                  <div>
                    <h2 className="sd-card__title">
                      <span className="sd-card__title-icon">🛕</span>
                      Temples offering this puja
                    </h2>
                    <div className="grid g-3 grid-2up-mobile" style={{ marginTop: 14 }}>
                      {temples.slice(0, 3).map((tp, i) => <TempleCard t={tp} key={tp.id} index={i} />)}
                    </div>
                  </div>
                )}

                {/* FAQ */}
                <div className="sd-card">
                  <h2 className="sd-card__title">
                    <span className="sd-card__title-icon">❓</span>
                    Frequently Asked Questions
                  </h2>
                  <div className="sd-faq">
                    {faqs.map((f, i) => (
                      <div className={`sd-faq__item ${openFaq === i ? "sd-faq__item--open" : ""}`} key={i}>
                        <button className="sd-faq__q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                          <span>{f.q}</span>
                          <Icon name={openFaq === i ? "chevron-up" : "chevron-down"} size={18} />
                        </button>
                        {openFaq === i && <p className="sd-faq__a">{f.a}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT SIDEBAR */}
              <aside className="sd-sidebar">
                {/* Need Help */}
                <div className="sd-sidebar-card sd-sidebar-card--help">
                  <h3 className="sd-sidebar-card__title">Need Help?</h3>
                  <p className="muted" style={{ margin: "8px 0 14px", fontSize: ".88rem" }}>
                    Get answers from our expert team about this puja.
                  </p>
                  <a href="tel:+919876543210" className="btn btn-gold btn-block">
                    <Icon name="phone" size={16} /> Contact Us
                  </a>
                </div>
              </aside>
            </div>
          </section>
        )}

        {/* SAMAGRI TAB */}
        {activeTab === "samagri" && (
          <section className="section" style={{ paddingTop: 48 }}>
            <div className="shell" style={{ maxWidth: 860 }}>
              <div className="sd-card">
                <h2 className="sd-card__title">
                  <span className="sd-card__title-icon">📿</span>
                  Required Samagri for {s.name}
                </h2>
                <p className="muted" style={{ margin: "8px 0 20px" }}>
                  Standard list — confirm with pandit ji who arranges what. Many pandits bring the full kit for a small extra amount.
                </p>
                <div className="sd-samagri-grid">
                  {samagriItems.map((x) => (
                    <div className="sd-samagri-item" key={x}>
                      <span className="sd-samagri-check">✓</span>
                      <span>{x}</span>
                    </div>
                  ))}
                </div>
                <button className="btn btn-outline btn-sm" style={{ marginTop: 22 }} onClick={() => window.print()}>
                  <Icon name="download" size={16} /> Print / save this list
                </button>
              </div>
            </div>
          </section>
        )}

        {/* PANDITS TAB */}
        {activeTab === "pandits" && (
          <section className="section" style={{ paddingTop: 48 }}>
            <div className="shell">
              <h2 className="section-title" style={{ fontSize: "clamp(1.5rem,2.6vw,2rem)", marginBottom: 32 }}>
                Pandits who perform {s.name}
              </h2>
              {pandits.length ? (
                <>
                  <div className="grid g-2 grid-2up-mobile">{pandits.slice(0, 6).map((p, i) => <PanditCard p={p} key={p.id} index={i} sourceSurface="service_detail" />)}</div>
                  {pandits.length > 6 && (
                    <div className="text-c" style={{ marginTop: 26 }}>
                      <Link className="btn btn-outline" to={`/services/${s.id}/pandits`}>See all {pandits.length} pandits</Link>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState msg="No pandit has listed this service yet. Try the directory or send an enquiry." />
              )}
            </div>
          </section>
        )}

        {/* REVIEWS TAB */}
        {activeTab === "reviews" && (
          <section className="section" style={{ paddingTop: 48 }}>
            <div className="shell" style={{ maxWidth: 660 }}>
              <div className="sd-card text-c" style={{ padding: "50px 30px" }}>
                <div style={{ fontSize: "3rem", marginBottom: 12 }}>⭐</div>
                <h2 style={{ fontSize: "1.4rem", marginBottom: 8 }}>4.9 out of 5</h2>
                <p className="muted">Based on 2,450+ devotees who performed {s.name}</p>
                <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: 40 }}>
                  <div><strong style={{ fontSize: "1.6rem", color: "var(--gold-deep)" }}>{s.pandits}</strong><br /><span className="muted">Pandits</span></div>
                  <div><strong style={{ fontSize: "1.6rem", color: "var(--gold-deep)" }}>{temples.length}</strong><br /><span className="muted">Temples</span></div>
                  <div><strong style={{ fontSize: "1.6rem", color: "var(--gold-deep)" }}>2,450+</strong><br /><span className="muted">Bookings</span></div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ======================== RELATED SERVICES ======================== */}
        <section className="section section--cream">
          <div className="shell">
            <div className="row-between" style={{ marginBottom: 26, flexWrap: "wrap", gap: 12 }}>
              <h2 className="section-title section-title--left" style={{ fontSize: "clamp(1.5rem,2.6vw,2rem)", marginBottom: 0 }}>Related services</h2>
              {hasMoreRelated && (
                <Link className="btn btn-outline btn-sm" to="/services">See All</Link>
              )}
            </div>
            <div className="grid g-4 svc-related-grid">
              {related.map((r, i) => <ServiceCard s={r} key={r.id} index={i} variant="grid" />)}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
