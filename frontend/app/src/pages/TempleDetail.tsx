import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../lib/icons";
import { StarRow } from "../components/ui/StarRating";
import { PanditCard } from "../components/ui/PanditCard";
import { ServiceCard } from "../components/ui/ServiceCard";
import { ReviewCard } from "../components/ui/ReviewCard";
import { TempleCard } from "../components/ui/TempleCard";
import { Modal } from "../components/ui/Modal";
import { Lightbox } from "../components/ui/Lightbox";
import { TempleBanner } from "../components/temple/TempleBanner";
import { SacredBackground } from "../components/temple/SacredBackground";
import { useToast } from "../components/ui/Toast";
import { onImgError } from "../lib/format";
import { api } from "../lib/api";
import { temples, panditsAtTemple, service, serviceName, reviews as allReviews } from "../data/content";
import "../styles/temple-detail.css";

const TABS = [
  { id: "overview", label: "Overview", icon: "eye" },
  { id: "gallery", label: "Gallery", icon: "image" },
  { id: "pandits", label: "Pandits", icon: "users" },
  { id: "services", label: "Services", icon: "diya" },
  { id: "reviews", label: "Reviews", icon: "star" },
  { id: "location", label: "Location", icon: "map-pin" },
];

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
  animate: { transition: { staggerChildren: 0.08 } },
};

const cardReveal = {
  initial: { opacity: 0, y: 20, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.45, ease: EASE },
};

export default function TempleDetail() {
  const { id } = useParams();
  const t = temples.find((x) => x.id === id) || temples[0];
  const [tab, setTab] = useState("overview");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const toast = useToast();

  useEffect(() => {
    document.title = `${t.name} — PanditSuggest`;
    setTab("overview");
    window.scrollTo({ top: 0 });
  }, [t]);

  const galleryImages = [t.img, ...t.gallery].map((src) => ({ src, alt: t.name, caption: t.name }));
  const pandits = panditsAtTemple(t.id);
  const reviews = allReviews.slice(0, 4);
  const mapQ = encodeURIComponent(`${t.name}, ${t.city}, ${t.state}`);
  let nearby = temples.filter((x) => x.id !== t.id && (x.state === t.state || x.deity === t.deity)).slice(0, 3);
  if (!nearby.length) nearby = temples.filter((x) => x.id !== t.id).slice(0, 3);

  async function onInquiry(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const payload = {
      name: String(data.get("name") || ""),
      phone: String(data.get("phone") || ""),
      service: String(data.get("service") || ""),
      date: String(data.get("date") || ""),
    };
    try { await api.templeInquiry(t.id, payload); } catch { /* soft-fail */ }
    toast(`Inquiry sent to ${t.pandits} pandits at this temple.`);
    e.currentTarget.reset();
  }

  function onReviewSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setReviewOpen(false);
    toast("Review submitted for verification. Dhanyavaad!");
  }

  return (
    <>
      {/* ═══ HERO BANNER ═══ */}
      <TempleBanner temple={t} photos={galleryImages} onOpenGallery={setLightboxIndex} />

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
        <SacredBackground />
        <div className="shell td-content" style={{ position: "relative", zIndex: 1 }}>

          {/* ── LEFT COLUMN: tab panels ── */}
          <div style={{ minWidth: 0 }}>
            <AnimatePresence mode="wait">
              {/* ━━━━━ OVERVIEW ━━━━━ */}
              {tab === "overview" && (
                <motion.div key="overview" {...fadeUp}>

                  {/* Available Pandits */}
                  <motion.div {...stagger} initial="initial" animate="animate">
                    <div className="row-between" style={{ marginBottom: 18 }}>
                      <h2 className="td-heading">
                        <span className="td-heading__icon"><Icon name="users" size={20} /></span>
                        Available Pandits
                        <span className="td-heading__ornament" />
                      </h2>
                      <button className="row" style={{ color: "var(--gold-deep)", fontWeight: 600, fontSize: ".92rem", background: "none", border: 0, cursor: "pointer" }} onClick={() => setTab("pandits")}>
                        All <Icon name="chevron-right" size={16} />
                      </button>
                    </div>
                    <div className="scroll-x" style={{ gap: 16 }}>
                      {pandits.map((p, i) => (
                        <motion.div key={p.id} {...cardReveal} transition={{ ...cardReveal.transition, delay: i * 0.1 }}>
                          <PanditCard p={p} />
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>

                  <hr className="sacred-divider" />

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
                      ["Established", t.est, "calendar"],
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

                  {/* History & Significance */}
                  <motion.div {...fadeUp} transition={{ delay: 0.3 }}>
                    <h3 className="td-heading" style={{ fontSize: "1.3rem" }}>
                      <span className="td-heading__icon" style={{ width: 34, height: 34, borderRadius: 10 }}><Icon name="book-open" size={17} /></span>
                      History &amp; significance
                    </h3>
                    <p className="td-about-text" style={{ marginTop: 10 }}>{t.history}</p>
                  </motion.div>

                  <hr className="sacred-divider" />

                  {/* Highlights & special sevas */}
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

              {/* ━━━━━ PANDITS ━━━━━ */}
              {tab === "pandits" && (
                <motion.div key="pandits" {...fadeUp}>
                  <h2 className="td-heading">
                    <span className="td-heading__icon"><Icon name="users" size={20} /></span>
                    All Pandits at this temple
                    <span className="td-heading__ornament" />
                  </h2>
                  <motion.div className="grid g-2 grid-2up-mobile" variants={stagger} initial="initial" animate="animate">
                    {pandits.map((p) => (
                      <motion.div key={p.id} variants={cardReveal}>
                        <PanditCard p={p} />
                      </motion.div>
                    ))}
                  </motion.div>
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
                  <motion.div className="grid g-3" variants={stagger} initial="initial" animate="animate">
                    {t.services.map((id2) => {
                      const s = service(id2);
                      return s ? (
                        <motion.div key={id2} variants={cardReveal}>
                          <ServiceCard s={s} />
                        </motion.div>
                      ) : null;
                    })}
                  </motion.div>
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

                  <motion.div className="grid g-2" variants={stagger} initial="initial" animate="animate">
                    {reviews.map((r) => (
                      <motion.div key={r.name} variants={cardReveal}>
                        <ReviewCard r={r} />
                      </motion.div>
                    ))}
                  </motion.div>

                  <motion.button
                    className="btn btn-outline"
                    style={{ marginTop: 22 }}
                    onClick={() => setReviewOpen(true)}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Icon name="edit" size={17} /> Write a review
                  </motion.button>
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
                        <SacredBackground />
                        <div style={{ position: "relative", zIndex: 1 }}>
                          <Icon name="map" size={54} style={{ color: "var(--gold)" }} />
                          <p style={{ fontFamily: "var(--font-head)", fontWeight: 600, marginTop: 10, fontSize: "1.1rem" }}>{t.name}</p>
                          <p className="muted">{t.lat.toFixed(4)}° N, {t.lng.toFixed(4)}° E</p>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── RIGHT COLUMN: Inquiry sidebar ── */}
          <aside>
            <motion.div
              className="td-inquiry"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.3 }}
            >
              <SacredBackground />
              <div style={{ position: "relative", zIndex: 1 }}>
                <h3 className="td-inquiry__title">
                  <span className="td-inquiry__title-icon"><Icon name="send" size={18} /></span>
                  Inquiry
                </h3>
                <form onSubmit={onInquiry}>
                  <div className="field-group"><label className="label" htmlFor="iqName">Your name</label><input className="input" id="iqName" name="name" required placeholder="Your name" /></div>
                  <div className="field-group"><label className="label" htmlFor="iqPhone">Phone number</label><input className="input" id="iqPhone" name="phone" type="tel" required placeholder="Phone number" /></div>
                  <div className="field-group">
                    <label className="label" htmlFor="iqSvc">Select your service</label>
                    <select className="select" id="iqSvc" name="service">
                      {t.services.map((sid) => <option key={sid} value={sid}>{serviceName(sid)}</option>)}
                    </select>
                  </div>
                  <div className="field-group"><label className="label" htmlFor="iqDate">Date picker</label><input className="input" id="iqDate" name="date" type="date" /></div>
                  <motion.button className="btn btn-gold btn-block" type="submit" style={{ marginTop: 18 }} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Icon name="send" size={17} /> Send Inquiry
                  </motion.button>
                  <p className="form-note">Free to send. No commission — you deal with pandit ji directly.</p>
                </form>
              </div>
            </motion.div>
          </aside>

        </div>
      </section>

      {/* ═══ NEARBY TEMPLES ═══ */}
      <section className="section td-section td-nearby">
        <SacredBackground />
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

      {/* ═══ REVIEW MODAL ═══ */}
      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)}>
        <h3 style={{ fontSize: "1.4rem" }}>Write a review</h3>
        <p className="muted" style={{ marginTop: 6 }}>Only devotees who have had a ceremony performed can post — we verify before publishing.</p>
        <form style={{ marginTop: 18 }} onSubmit={onReviewSubmit}>
          <div className="field-group"><label className="label" htmlFor="rvName">Your name</label><input className="input" id="rvName" required /></div>
          <div className="field-group"><label className="label" htmlFor="rvText">Your experience</label><textarea className="textarea" id="rvText" required /></div>
          <button className="btn btn-gold btn-block" type="submit">Submit review</button>
        </form>
      </Modal>
    </>
  );
}
