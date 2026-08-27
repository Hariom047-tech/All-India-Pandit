import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../lib/icons";
import { StarRow } from "../components/ui/StarRating";
import { PanditCard } from "../components/ui/PanditCard";
import { ServiceCard } from "../components/ui/ServiceCard";
import { ReviewCard } from "../components/ui/ReviewCard";
import { TempleCard } from "../components/ui/TempleCard";
import { Lightbox } from "../components/ui/Lightbox";
import { WriteReview } from "../components/ui/WriteReview";
import { TempleBanner, type HeroSlide } from "../components/temple/TempleBanner";
import { useToast } from "../components/ui/Toast";
import { onImgError } from "../lib/format";
import { useFairRanking, useReportExposure } from "../lib/api";
import { useTemple, useTemples, usePandits, useReviews, useServices } from "../hooks/useData";
import { useUrlTab } from "../hooks/useUrlTab";
import { normTemple, normTemples, normPandits, normReviews, normServices } from "../lib/normalize";
import { Loading, ErrorState } from "../components/ui/DataState";
import { Seo } from "../lib/Seo";
import { useStructuredData, breadcrumbSchema, placeOfWorshipSchema, organizationSchema, websiteSchema, webPageSchema, placeOfWorshipId } from "../lib/structuredData";
import { isTempleIndexable } from "../lib/indexability";
import "../styles/temple-detail.css";

const TABS = [
  { id: "overview", label: "Overview", icon: "eye" },
  { id: "gallery", label: "Gallery", icon: "image" },
  { id: "pandits", label: "Pandits", icon: "users" },
  { id: "services", label: "Services", icon: "diya" },
  { id: "reviews", label: "Reviews", icon: "star" },
  { id: "location", label: "Location", icon: "map-pin" },
];
const TAB_IDS = TABS.map((tb) => tb.id);

const REVIEW_DIST = [76, 17, 4, 2, 1];

/* animation presets */
const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.5, ease: EASE },
};

const stagger = {
  initial: {},
  animate: { transition: { staggerChildren: 0.08 } },
};

const cardReveal = {
  initial: { opacity: 0, y: 20, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.45, ease: EASE },
};

export default function TempleDetail() {
  const { id } = useParams();
  const { data: rawTemple, loading, error } = useTemple(id || "");
  const { data: rawTemples } = useTemples({ perPage: 50 });
  // 600, not 50: "limit" was never a real API param (silently ignored,
  // falling back to a 12-row default) — a temple can have hundreds of
  // associated pandits (Nalkheda has 500), all of which need to be in this
  // batch since the fair-ranking overlay below can only rank what it has.
  const { data: rawPandits } = usePandits({ perPage: 600 });
  const { data: rawReviews } = useReviews("temple", id);
  // Services has no pagination at all — "~50 rows is small enough to send
  // whole" per its own controller comment — so this param is a no-op either
  // way, but named correctly for anyone reading it as documentation.
  const { data: rawServices } = useServices();

  const t = useMemo(() => rawTemple ? normTemple(rawTemple) : null, [rawTemple]);
  const allTemples = useMemo(() => normTemples(rawTemples), [rawTemples]);
  const allPandits = useMemo(() => normPandits(rawPandits), [rawPandits]);
  const reviews = useMemo(() => normReviews(rawReviews), [rawReviews]);
  const allServices = useMemo(() => normServices(rawServices), [rawServices]);

  // URL-backed, not component memory: a direct link, a copied share URL, and
  // a browser refresh must all restore the same tab (see useUrlTab). This
  // also fixes the actual bug: the temple-load effect below used to call
  // setTab("overview") unconditionally, clobbering whatever tab the URL (or
  // the visitor) had selected the moment temple data finished loading.
  const [tab, setTab] = useUrlTab(TAB_IDS, "overview");

  // Fair, market-aware rotation instead of a frozen rating sort — the same
  // engine and pattern already used on /pandits, scoped to this temple so a
  // devotee doesn't see the same five pandits at Nalkheda on every visit.
  // Always enabled (not just on the Pandits tab): a small preview now renders
  // on Overview too (docs/SEO_ARCHITECTURE.md, Phase 6 — a temple page must
  // link to its pandits without requiring a tab click first, for crawlers
  // and for real visitors alike), and it must go through the same rotation
  // as the full tab, never a separate "SEO ranking".
  const fairScores = useFairRanking(t?.id, undefined, { enabled: Boolean(t) });
  const pandits = useMemo(() => {
    if (!t) return [];
    const list = allPandits.filter((p) => p.temples.includes(t.id));
    return [...list].sort((a, b) => {
      if (fairScores) {
        const diff = (fairScores.get(b.id) ?? -Infinity) - (fairScores.get(a.id) ?? -Infinity);
        if (diff) return diff;
      }
      return b.rating - a.rating;
    });
  }, [allPandits, t, fairScores]);
  const previewPandits = useMemo(() => pandits.slice(0, 3), [pandits]);
  // Exposure reporting must always match exactly what's visible right now —
  // the Overview preview or the full Pandits tab, never both, never neither
  // — so the fairness engine's impression counts stay accurate regardless
  // of which section a visitor is looking at.
  const visiblePandits = tab === "pandits" ? pandits : previewPandits;
  useReportExposure(visiblePandits.map((p) => p.id), { temple: t?.id, enabled: Boolean(t) });

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (t) window.scrollTo({ top: 0 });
  }, [t]);

  // Hook call must be unconditional (before the loading/error early returns
  // below) — see docs/SEO_ARCHITECTURE.md. Passing null until data arrives.
  useStructuredData(t ? [
    organizationSchema(),
    websiteSchema(),
    webPageSchema({
      path: `/temples/${t.id}`,
      name: (rawTemple as { meta_title?: string | null } | null)?.meta_title || `${t.name} — Puja, Havan & Pandits`,
      aboutId: placeOfWorshipId(`/temples/${t.id}`),
    }),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Temples", path: "/temples" },
      { name: t.name, path: `/temples/${t.id}` },
    ]),
    placeOfWorshipSchema({
      name: t.name, path: `/temples/${t.id}`, city: t.city, state: t.state,
      addressLine1: (rawTemple as { address_line1?: string | null } | null)?.address_line1,
      lat: t.lat, lng: t.lng, image: t.img, rating: t.rating, reviewCount: t.reviews,
    }),
  ] : null);

  if (loading) return <div className="section"><div className="shell"><Loading lines={1} type="detail" /></div></div>;
  if (error || !t) return <div className="section"><div className="shell"><ErrorState message={error || "Temple not found"} /></div></div>;

  /**
   * Real uploaded media, with the bundled artwork kept only as a fallback for
   * temples that have not had photos uploaded yet. Once an admin uploads even
   * one photo, none of the stock images are used for that temple.
   */
  const apiTemple = rawTemple as unknown as {
    gallery?: { id: string; url: string; title?: string | null; caption?: string | null }[];
    videos?: { id: string; url: string; title?: string | null; caption?: string | null }[];
    /** Admin-curated hero slides (temple_media.show_in_hero), photos + videos. */
    hero?: HeroSlide[];
    /** Rituals unique to this temple — no catalogue entry, so no detail page. */
    customServices?: { name: string; description?: string }[];
    meta_title?: string | null;
    meta_description?: string | null;
    address_line1?: string | null;
  } | null;

  const uploaded = apiTemple?.gallery ?? [];
  const galleryImages = uploaded.length
    ? uploaded.map((g) => ({ src: g.url, alt: g.title || t.name, caption: g.caption || t.name }))
    : [t.img, ...t.gallery].map((src) => ({ src, alt: t.name, caption: t.name }));

  // Bundled temples have no uploads and so no `hero` — the banner falls back to
  // the photo list on its own.
  const heroSlides = apiTemple?.hero ?? [];
  // Every uploaded video, hero-marked or not — the Gallery tab lists them all.
  const templeVideos = apiTemple?.videos ?? [];
  const customServices = apiTemple?.customServices ?? [];

  /* Catalogue slugs that no longer resolve to a live service are dropped from
     the grid, so count what will actually render rather than what was stored —
     otherwise a temple whose only service was deleted shows an empty grid
     instead of the empty state. */
  const linkedServices = t.services
    .map((sid) => allServices.find((x) => x.id === sid))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const hasAnyService = linkedServices.length > 0 || customServices.length > 0;
  const mapQ = encodeURIComponent(`${t.name}, ${t.city}, ${t.state}`);
  let nearby = allTemples.filter((x) => x.id !== t.id && (x.state === t.state || x.deity === t.deity)).slice(0, 3);
  if (!nearby.length) nearby = allTemples.filter((x) => x.id !== t.id).slice(0, 3);

  /** No dedicated page exists for a temple-specific ritual, so "Enquire"
   *  sends the devotee to the Pandits tab to Chat/Call someone directly
   *  instead — there is no separate inquiry form anymore. */
  function askAbout(serviceName: string) {
    toast(`Chat with a pandit at this temple to ask about ${serviceName}.`);
    setTab("pandits");
  }

  return (
    <>
      <Seo
        title={apiTemple?.meta_title || `${t.name} — Puja, Havan & Pandits`}
        description={apiTemple?.meta_description || `Explore ${t.name} in ${t.city}, ${t.state}. Discover available puja and havan services, and connect directly with verified Pandits associated with the temple.`}
        path={`/temples/${t.id}`}
        image={t.img}
        noindex={!isTempleIndexable(t)}
      />
      {/* ═══ HERO BANNER ═══ */}
      <TempleBanner temple={t} photos={galleryImages} slides={heroSlides} onOpenGallery={setLightboxIndex} />

      {/* ═══ STICKY PREMIUM TAB BAR ═══ */}
      <nav className="td-tabs" aria-label="Temple sections">
        <div className="shell">
          <div className="td-tabs__inner">
            {TABS.map((tb) => (
              <button
                key={tb.id}
                className={`td-tab${tab === tb.id ? " is-active" : ""}`}
                role="tab"
                aria-selected={tab === tb.id}
                onClick={() => setTab(tb.id)}
              >
                <Icon name={tb.icon} size={15} />
                <span style={{ marginLeft: 6 }}>{tb.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ═══ MAIN CONTENT ═══ */}
      <section className="section td-section">
        <div className="shell" style={{ position: "relative", zIndex: 1 }}>

          {/* ── LEFT COLUMN: tab panels ── */}
          <div style={{ minWidth: 0 }}>
            <AnimatePresence mode="wait">
              {/* ━━━━━ OVERVIEW ━━━━━ */}
              {tab === "overview" && (
                <motion.div key="overview" {...fadeUp}>

                  {/* About the temple */}
                  <motion.div {...fadeUp} transition={{ delay: 0.2 }}>
                    <h2 className="td-heading">
                      <span className="td-heading__icon"><Icon name="temple" size={20} /></span>
                      About the temple
                      <span className="td-heading__ornament" />
                    </h2>
                    <p className="td-about-text">{t.about}</p>
                  </motion.div>

                  {/* Info stat cards */}
                  <motion.div className="td-info-grid" variants={stagger} initial="initial" animate="animate">
                    {([
                      ["Darshan Timings", t.timings, "clock"],
                      ["Presiding Deity", t.deity, "om"],
                      ["Established", t.est || "—", "calendar"],
                      ["Location", `${t.city}, ${t.state}`, "map-pin"],
                    ] as [string, string, string][]).map(([label, value, icon], i) => (
                      <motion.div
                        key={label}
                        className="glass-card td-info-card"
                        {...cardReveal}
                        transition={{ ...cardReveal.transition, delay: i * 0.1 }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <Icon name={icon} size={16} style={{ color: "var(--gold-deep)" }} />
                          <div className="td-info-label">{label}</div>
                        </div>
                        <div className="td-info-value">{value}</div>
                      </motion.div>
                    ))}
                  </motion.div>

                  <hr className="sacred-divider" />

                  {/* Services performed here — always in the DOM on the default
                      tab (not gated behind the Services tab click), so the
                      temple page always links out to real service pages
                      (docs/SEO_ARCHITECTURE.md, Phase 6). */}
                  {hasAnyService && linkedServices.length > 0 && (
                    <>
                      <motion.div {...fadeUp} transition={{ delay: 0.22 }}>
                        <div className="row-between">
                          <h3 className="td-heading" style={{ fontSize: "1.3rem" }}>
                            <span className="td-heading__icon" style={{ width: 34, height: 34, borderRadius: 10 }}><Icon name="diya" size={17} /></span>
                            Puja &amp; havan performed here
                          </h3>
                          {linkedServices.length > 4 && (
                            <button className="row" style={{ color: "var(--gold-deep)", fontWeight: 600, fontSize: ".9rem", background: "none", border: 0, cursor: "pointer" }} onClick={() => setTab("services")}>
                              All {linkedServices.length} <Icon name="chevron-right" size={16} />
                            </button>
                          )}
                        </div>
                        <div className="grid g-4 grid-2up-mobile svc-related-grid" style={{ marginTop: 14 }}>
                          {linkedServices.slice(0, 4).map((s, i) => <ServiceCard s={s} key={s.id} index={i} variant="grid" hideTag />)}
                        </div>
                      </motion.div>
                      <hr className="sacred-divider" />
                    </>
                  )}

                  {/* Pandits at this temple — same reasoning; runs through the
                      same fair-rotation engine as the full Pandits tab (see
                      fairScores/visiblePandits above), never a separate order. */}
                  {previewPandits.length > 0 && (
                    <>
                      <motion.div {...fadeUp} transition={{ delay: 0.24 }}>
                        <div className="row-between">
                          <h3 className="td-heading" style={{ fontSize: "1.3rem" }}>
                            <span className="td-heading__icon" style={{ width: 34, height: 34, borderRadius: 10 }}><Icon name="users" size={17} /></span>
                            Pandits at this temple
                          </h3>
                          <button className="row" style={{ color: "var(--gold-deep)", fontWeight: 600, fontSize: ".9rem", background: "none", border: 0, cursor: "pointer" }} onClick={() => setTab("pandits")}>
                            All {pandits.length} <Icon name="chevron-right" size={16} />
                          </button>
                        </div>
                        <div className="grid g-3 grid-2up-mobile" style={{ marginTop: 14 }}>
                          {previewPandits.map((p, i) => <PanditCard p={p} key={p.id} index={i} sourceSurface="temple_detail_preview" />)}
                        </div>
                      </motion.div>
                      <hr className="sacred-divider" />
                    </>
                  )}

                  {/* History & significance — admin-managed. Rendered only when
                      there is something to show; an empty heading above blank
                      space reads as a broken page, which is exactly how this
                      looked before the fields became editable. */}
                  {(t.history || t.significance) && (
                    <>
                      <motion.div {...fadeUp} transition={{ delay: 0.3 }}>
                        <h3 className="td-heading" style={{ fontSize: "1.3rem" }}>
                          <span className="td-heading__icon" style={{ width: 34, height: 34, borderRadius: 10 }}><Icon name="book-open" size={17} /></span>
                          History &amp; significance
                        </h3>
                        {t.history && <p className="td-about-text" style={{ marginTop: 10 }}>{t.history}</p>}
                        {t.significance && <p className="td-about-text" style={{ marginTop: 10 }}>{t.significance}</p>}
                      </motion.div>

                      <hr className="sacred-divider" />
                    </>
                  )}

                  {/* Highlights & special sevas — admin-managed. */}
                  {t.highlights.length > 0 && (
                    <motion.div {...fadeUp} transition={{ delay: 0.35 }}>
                      <h3 className="td-heading" style={{ fontSize: "1.3rem" }}>
                        <span className="td-heading__icon" style={{ width: 34, height: 34, borderRadius: 10 }}><Icon name="sparkles" size={17} /></span>
                        Highlights &amp; special sevas
                      </h3>
                      <ul className="td-highlights">
                        {t.highlights.map((h, i) => (
                          <motion.li key={h} className="td-highlight-item" {...cardReveal} transition={{ ...cardReveal.transition, delay: i * 0.06 }}>
                            <span className="td-highlight-dot" />
                            {h}
                          </motion.li>
                        ))}
                      </ul>
                    </motion.div>
                  )}

                  {/* Photo gallery preview */}
                  {galleryImages.length > 1 && (
                    <>
                      <hr className="sacred-divider" />
                      <motion.div {...fadeUp} transition={{ delay: 0.4 }}>
                        <div className="row-between">
                          <h3 className="td-heading" style={{ fontSize: "1.3rem" }}>
                            <span className="td-heading__icon" style={{ width: 34, height: 34, borderRadius: 10 }}><Icon name="image" size={17} /></span>
                            Photo gallery
                          </h3>
                          <button className="row" style={{ color: "var(--gold-deep)", fontWeight: 600, fontSize: ".9rem", background: "none", border: 0, cursor: "pointer" }} onClick={() => setTab("gallery")}>
                            All <Icon name="chevron-right" size={16} />
                          </button>
                        </div>
                        <div className="td-gallery" style={{ marginTop: 14 }}>
                          {galleryImages.slice(0, 4).map((img, i) => (
                            <motion.button
                              className="td-gallery__item"
                              key={img.src}
                              onClick={() => setLightboxIndex(i)}
                              aria-label={`View photo ${i + 1} of ${t.name}`}
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <img src={img.src} alt={img.alt} onError={onImgError("temple")} loading="lazy" />
                              <span className="td-gallery__overlay">
                                <Icon name="eye" size={16} /> View
                              </span>
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
                    </>
                  )}
                </motion.div>
              )}

              {/* ━━━━━ GALLERY ━━━━━ */}
              {tab === "gallery" && (
                <motion.div key="gallery" {...fadeUp}>
                  <h2 className="td-heading">
                    <span className="td-heading__icon"><Icon name="image" size={20} /></span>
                    Photo gallery
                    <span className="td-heading__ornament" />
                  </h2>
                  <p className="muted" style={{ marginBottom: 22 }}>{galleryImages.length} photo{galleryImages.length === 1 ? "" : "s"} of {t.name}. Tap any photo for the full-size view.</p>

                  {/* Every video, with controls. The hero autoplays the first
                      one muted; this is where a visitor can actually watch
                      them properly, and where videos 2+ would otherwise be
                      unreachable. */}
                  {templeVideos.length > 0 && (
                    <div style={{ marginBottom: 26 }}>
                      <h3 style={{ fontSize: "1rem", marginBottom: 10 }}>
                        {templeVideos.length} video{templeVideos.length === 1 ? "" : "s"}
                      </h3>
                      <div className="td-video-grid">
                        {templeVideos.map((v) => (
                          <figure key={v.id} style={{ margin: 0 }}>
                            <video src={v.url} controls preload="metadata" playsInline />
                            {(v.title || v.caption) && (
                              <figcaption className="muted" style={{ fontSize: ".82rem", marginTop: 6 }}>
                                {v.title || v.caption}
                              </figcaption>
                            )}
                          </figure>
                        ))}
                      </div>
                    </div>
                  )}
                  <motion.div className="td-gallery" variants={stagger} initial="initial" animate="animate">
                    {galleryImages.map((img, i) => (
                      <motion.button
                        className="td-gallery__item"
                        key={img.src}
                        onClick={() => setLightboxIndex(i)}
                        aria-label={`View photo ${i + 1} of ${t.name}`}
                        variants={cardReveal}
                        whileHover={{ scale: 1.04 }}
                      >
                        <img src={img.src} alt={img.alt} onError={onImgError("temple")} loading="lazy" />
                        <span className="td-gallery__overlay">
                          <Icon name="eye" size={16} /> View
                        </span>
                      </motion.button>
                    ))}
                  </motion.div>
                </motion.div>
              )}

              {tab === "pandits" && (
                <motion.div key="pandits" {...fadeUp}>
                  <h2 className="td-heading">
                    <span className="td-heading__icon"><Icon name="users" size={20} /></span>
                    All Pandits at this temple
                    <span className="td-heading__ornament" />
                  </h2>
                  {pandits.length > 0 ? (
                    // PanditCard already animates itself in (whileInView, per-card) — an
                    // outer stagger wrapper here would fire a SECOND animation on mount
                    // for every card in the array, up to ~500 at Nalkheda, most of them
                    // off-screen. Plain grid; PanditCard owns its own reveal.
                    <div className="grid g-3 grid-2up-mobile">
                      {pandits.map((p) => (
                        <PanditCard p={p} key={p.id} sourceSurface="temple_detail" />
                      ))}
                    </div>
                  ) : (
                    <div className="td-empty-state">
                      <div className="td-empty-state__icon">🙏</div>
                      <p className="td-empty-state__text">No pandits listed at this temple yet.</p>
                      <p className="muted" style={{ fontSize: ".88rem", marginTop: 8 }}>Check back soon — our team is verifying temple associations.</p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ━━━━━ SERVICES ━━━━━ */}
              {tab === "services" && (
                <motion.div key="services" {...fadeUp}>
                  <h2 className="td-heading">
                    <span className="td-heading__icon"><Icon name="diya" size={20} /></span>
                    Services performed here
                    <span className="td-heading__ornament" />
                  </h2>
                  <p className="muted" style={{ marginBottom: 22 }}>Rituals regularly performed at {t.name}. Tap any service to see the samagri list and the pandits who offer it.</p>
                  {hasAnyService ? (
                    <>
                      {linkedServices.length > 0 && (
                        <motion.div className="grid g-4 grid-2up-mobile svc-related-grid" variants={stagger} initial="initial" animate="animate">
                          {linkedServices.map((s, i) => (
                            <motion.div key={s.id} variants={cardReveal}>
                              <ServiceCard s={s} index={i} variant="grid" hideTag />
                            </motion.div>
                          ))}
                        </motion.div>
                      )}

                      {/* This temple's own rituals. Visually a sibling of the
                          catalogue cards, but deliberately not a ServiceCard:
                          there is no detail page to link to, so the action is
                          an enquiry rather than a dead "learn more". */}
                      {customServices.length > 0 && (
                        <>
                          <h3 className="td-subheading">Only at {t.name}</h3>
                          <motion.div className="grid g-3 grid-2up-mobile" variants={stagger} initial="initial" animate="animate">
                            {customServices.map((cs) => (
                              <motion.div key={cs.name} variants={cardReveal}>
                                <button
                                  type="button"
                                  className="td-custom-service"
                                  onClick={() => askAbout(cs.name)}
                                >
                                  <span className="td-custom-service__icon"><Icon name="diya" size={18} /></span>
                                  <span className="td-custom-service__name">{cs.name}</span>
                                  {cs.description && (
                                    <span className="td-custom-service__desc">{cs.description}</span>
                                  )}
                                  <span className="td-custom-service__cta">
                                    Enquire <Icon name="send" size={13} />
                                  </span>
                                </button>
                              </motion.div>
                            ))}
                          </motion.div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="td-empty-state">
                      <div className="td-empty-state__icon">🕉️</div>
                      <p className="td-empty-state__text">No services listed yet for this temple.</p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ━━━━━ REVIEWS ━━━━━ */}
              {tab === "reviews" && (
                <motion.div key="reviews" {...fadeUp}>
                  <h2 className="td-heading">
                    <span className="td-heading__icon"><Icon name="star" size={20} /></span>
                    Devotee Reviews
                    <span className="td-heading__ornament" />
                  </h2>
                  <div style={{ marginBottom: 18 }}>
                    <WriteReview targetType="temple" targetSlug={t.id} targetName={t.name} />
                  </div>

                  <div className="td-review-summary">
                    <motion.div className="td-review-big" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: "easeOut" }}>
                      <div className="td-review-score">{t.rating.toFixed(1)}</div>
                      <StarRow rating={t.rating} size={22} />
                      <p className="muted" style={{ marginTop: 8 }}>{t.reviews} devotee reviews</p>
                    </motion.div>

                    <div className="td-review-bars">
                      {[5, 4, 3, 2, 1].map((n, i) => (
                        <motion.div className="td-bar-row" key={n} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
                          <span className="td-bar-label">{n} ★</span>
                          <div className="td-bar-track">
                            <motion.div
                              className="td-bar-fill"
                              initial={{ width: 0 }}
                              animate={{ width: `${REVIEW_DIST[i]}%` }}
                              transition={{ duration: 1, delay: 0.3 + i * 0.1, ease: "easeOut" }}
                            />
                          </div>
                          <span className="td-bar-pct">{REVIEW_DIST[i]}%</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  <div className="td-reviews-carousel-wrap" style={{ margin: "16px -18px 0", padding: "10px 18px 20px" }}>
                    {reviews.length > 0 ? reviews.map((r) => (
                      <ReviewCard key={r.name} r={r} />
                    )) : (
                      <p className="muted" style={{ padding: "8px 0" }}>No reviews yet. Be the first devotee to leave a review after your visit.</p>
                    )}
                  </div>

                </motion.div>
              )}

              {/* ━━━━━ LOCATION ━━━━━ */}
              {tab === "location" && (
                <motion.div key="location" {...fadeUp}>
                  <h2 className="td-heading">
                    <span className="td-heading__icon"><Icon name="map-pin" size={20} /></span>
                    Location &amp; travel
                    <span className="td-heading__ornament" />
                  </h2>
                  <div className="grid g-2" style={{ alignItems: "start", gap: 24 }}>
                    <motion.div {...cardReveal}>
                      <h3 style={{ fontSize: "1.24rem", marginBottom: 12, fontFamily: "var(--font-head)" }}>How to reach</h3>
                      <ul className="td-highlights" style={{ gridTemplateColumns: "1fr" }}>
                        {[
                          `Nearest railway station: ${t.city} Junction`,
                          "Auto and e-rickshaw available from the station to the temple gate",
                          "Shoe stands and cloakroom near the main entrance",
                          "Arrive 40 minutes before aarti on weekends and festival days",
                        ].map((item) => (
                          <li key={item} className="td-highlight-item">
                            <span className="td-highlight-dot" />
                            {item}
                          </li>
                        ))}
                      </ul>
                      <div className="row" style={{ gap: 10, marginTop: 22, flexWrap: "wrap" }}>
                        <a className="btn btn-gold" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${mapQ}`}>
                          <Icon name="map-pin" size={17} /> Open in Google Maps
                        </a>
                        <Link className="btn btn-outline" to="/temple-map"><Icon name="map" size={17} /> See all temples</Link>
                      </div>
                    </motion.div>
                    <motion.div className="glass-card" style={{ padding: 0, overflow: "hidden" }} {...cardReveal} transition={{ ...cardReveal.transition, delay: 0.15 }}>
                      <div style={{ aspectRatio: "4/3", background: "linear-gradient(145deg, rgba(250,247,240,0.9), rgba(255,255,255,0.95))", display: "grid", placeItems: "center", textAlign: "center", padding: 24, position: "relative" }}>
                        <div style={{ position: "relative", zIndex: 1 }}>
                          <Icon name="map" size={54} style={{ color: "var(--gold)" }} />
                          <p style={{ fontFamily: "var(--font-head)", fontWeight: 600, marginTop: 10, fontSize: "1.1rem" }}>{t.name}</p>
                          {(t.lat !== 0 || t.lng !== 0) ? (
                            <p className="muted">{t.lat.toFixed(4)}° N, {t.lng.toFixed(4)}° E</p>
                          ) : (
                            <p className="muted">{t.city}, {t.state}</p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* ═══ NEARBY TEMPLES ═══ */}
      <section className="section td-section td-nearby">
        <div className="shell" style={{ position: "relative", zIndex: 1 }}>
          <motion.h2
            className="td-heading"
            style={{ fontSize: "clamp(1.5rem,2.6vw,2rem)", marginBottom: 26 }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
          >
            <span className="td-heading__icon"><Icon name="temple" size={22} /></span>
            Nearby &amp; similar temples
            <span className="td-heading__ornament" />
          </motion.h2>
          <motion.div
            className="grid g-3 hp-cards-2up"
            variants={stagger}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-50px" }}
          >
            {nearby.map((n, i) => (
              <motion.div key={n.id} variants={cardReveal}>
                <TempleCard t={n} index={i} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ LIGHTBOX ═══ */}
      <Lightbox
        images={galleryImages}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />

    </>
  );
}
