import { useEffect, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../lib/icons";
import { StarRow } from "../components/ui/StarRating";
import { ReviewCard } from "../components/ui/ReviewCard";
import { PanditCard } from "../components/ui/PanditCard";
import { DecorativeQr } from "../lib/qr";
import { onImgError } from "../lib/format";
import { VideoReels, type ReelVideo } from "../components/ui/VideoReels";
import { ContactBar } from "../components/ui/ContactBar";
import { WriteReview } from "../components/ui/WriteReview";
import "../styles/pandit-profile.css";
import { useToast } from "../components/ui/Toast";
import { usePandit, usePandits, useReviews } from "../hooks/useData";
import { normPandit, normPandits, normReviews, withPanditHonorific } from "../lib/normalize";
import { Loading, ErrorState } from "../components/ui/DataState";
import { api, useFairRanking, useReportExposure } from "../lib/api";
import { usePanditContact } from "../lib/usePanditContact";
import { useLang } from "../lib/i18n";
import { Seo } from "../lib/Seo";
import { useStructuredData, breadcrumbSchema, personSchema, organizationSchema, websiteSchema } from "../lib/structuredData";
import { isPanditIndexable } from "../lib/indexability";

export default function PanditProfile() {
  const { id } = useParams();
  const { data: rawPandit, loading, error } = usePandit(id || "");
  const { data: rawReviews } = useReviews("pandit", id);
  const { data: rawAll } = usePandits({ perPage: 50 });
  
  const p = useMemo(() => rawPandit ? normPandit(rawPandit) : null, [rawPandit]);
  const panditReviews = useMemo(() => normReviews(rawReviews), [rawReviews]);
  const allPandits = useMemo(() => normPandits(rawAll), [rawAll]);
  
  const toast = useToast();
  const { t, lang } = useLang();
  const displayName = p ? (lang === "hi" && p.nameHi ? p.nameHi : p.name) : "";

  // Single shared contact flow — guest gating, mobile-verification gating and
  // "only the server decides what a lead is" all live in one place.
  const { contact, isPending, disclosure } = usePanditContact();
  /** The hero CTA row — the sticky bar appears only once this scrolls away. */
  const ctaRef = useRef<HTMLDivElement>(null);

  const handleAction = (e: React.MouseEvent, type: "whatsapp" | "call") => {
    e.preventDefault();
    e.stopPropagation();
    if (!p) return;
    contact({
      panditSlug: p.id,
      action: type,
      phone: p.phone,
      whatsapp: p.phone,
      waMessage: `Namaste ${p.name}, I found your profile on PanditSuggest. I would like to enquire about a puja.`,
      source: "pandit_profile",
    });
  };

  // The detail endpoint returns videos[]; normPandit() only carries the single
  // legacy video_intro_url, so fall back to that for profiles whose media has
  // not been re-uploaded through the new admin screen yet.
  const reels: ReelVideo[] = useMemo(() => {
    const api = rawPandit as { videos?: { id: string; url: string; title?: string | null; caption?: string | null }[] } | null;
    if (api?.videos?.length) {
      return api.videos.map((v) => ({ id: v.id, url: v.url, title: v.title, caption: v.caption }));
    }
    const legacy = (p as (typeof p) & { videoUrl?: string } | null)?.videoUrl;
    return legacy ? [{ id: "legacy", url: legacy, title: null, caption: null }] : [];
  }, [rawPandit, p]);

  useEffect(() => {
    if (p) api.trackView(p.id).catch(() => {});
  }, [p]);

  const panditMeta = rawPandit as { meta_title?: string | null; meta_description?: string | null } | null;

  // The detail endpoint already fetches each associated temple's real name
  // (pandits.repository.js's getBySlug() -> associatedTemples), but the
  // associated-temples list below was building its link text by title-casing
  // the temple's slug instead of using it — real content, previously unused.
  // Falls back to the slug-guess only for a temple id this map doesn't cover.
  const templeNameBySlug = useMemo(() => {
    const associated = (rawPandit as { associatedTemples?: { slug: string; name: string }[] } | null)?.associatedTemples || [];
    return new Map(associated.map((tp) => [tp.slug, tp.name]));
  }, [rawPandit]);

  // Relevance first (same city or a shared service — and never the profile
  // being viewed), then fair rotation within that relevant band, the same
  // "eligible pool -> rotate" shape as every other marketplace surface.
  const fairScores = useFairRanking();
  const similar = useMemo(() => {
    if (!p) return [];
    const relevant = allPandits.filter(
      (x) => x.id !== p.id && (x.city === p.city || x.services.some((s) => p.services.includes(s))),
    );
    if (!fairScores) return relevant.slice(0, 4);
    const bandSize = Math.min(relevant.length, 12);
    const band = [...relevant.slice(0, bandSize)].sort((a, b) => {
      const diff = (fairScores.get(b.id) ?? -Infinity) - (fairScores.get(a.id) ?? -Infinity);
      return diff || b.rating - a.rating;
    });
    return band.slice(0, 4);
  }, [p, allPandits, fairScores]);
  useReportExposure(similar.map((sp) => sp.id), { enabled: similar.length > 0 });

  function copyLink() {
    const url = window.location.href;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast(t("panditProfile.profileLinkCopiedToast")));
    else toast(url);
  }

  // Hook call must be unconditional (before the loading/error early returns
  // below) — see docs/SEO_ARCHITECTURE.md. Passing null until data arrives.
  useStructuredData(p ? [
    organizationSchema(),
    websiteSchema(),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Pandits", path: "/pandits" },
      { name: displayName, path: `/pandits/${p.id}` },
    ]),
    personSchema({
      name: displayName, path: `/pandits/${p.id}`, city: p.city, state: p.state,
      image: p.img, rating: p.rating, reviewCount: p.reviews,
    }),
  ] : null);

  if (loading) return <div className="section"><div className="shell"><Loading lines={1} type="detail" /></div></div>;
  if (error || !p) return <div className="section"><div className="shell"><ErrorState message={error || "Pandit not found"} /></div></div>;

  return (
    <>
      <Seo
        title={panditMeta?.meta_title || `${withPanditHonorific(displayName)} — Puja & Havan Services in ${p.city}`}
        description={panditMeta?.meta_description || `${displayName}, a verified Pandit in ${p.city}${p.state ? `, ${p.state}` : ""} with ${p.exp} years of experience. Contact directly on WhatsApp or call — no middleman, no commission.`}
        path={`/pandits/${p.id}`}
        image={p.img}
        noindex={!isPanditIndexable(p)}
      />
      <section className="section" style={{ paddingTop: 48 }}>
        <div className="shell">


          <div className="profile-hero">
            <div className="profile-id">
              {/* Warm amber gradient "cover" zone */}
              <div className="profile-id__header" />
              {/* Avatar overlaps the header/body boundary */}
              <div className="avatar-wrap">
                <div className="avatar-ring avatar-ring--lg">
                  <img src={p.img} alt={displayName} onError={onImgError("pandit")} fetchPriority="high" />
                </div>
              </div>
              {/* All text content below the avatar */}
              <div className="profile-id__body">
                <h1>
                  {displayName}{" "}
                  {p.verified && (
                    <span className="verified-dot" title={t("panditProfile.verifiedPandit")}><Icon name="verified" size={28} /></span>
                  )}
                </h1>
                {/* A pandit with no reviews yet showed "0.0/5 · 0 reviews", which
                    reads as a BAD pandit rather than a new one — actively worse
                    than showing nothing. Stars appear once there is something to
                    average. */}
                <div className="row" style={{ justifyContent: "center", marginTop: 10 }}>
                  {p.reviews > 0 ? (
                    <>
                      <StarRow rating={p.rating} size={21} />
                      <span className="rating-num" style={{ fontSize: "1.05rem" }}>({p.rating.toFixed(1)}/5)</span>
                      <span className="muted">{p.reviews} {t("panditProfile.reviewsCount")}</span>
                    </>
                  ) : (
                    <span className="pp-chip-new">{t("panditProfile.newOnPlatform")}</span>
                  )}
                </div>
                <div className="row" style={{ justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
                  <span className="meta-line"><Icon name="map-pin" size={17} /> {p.city}, {p.state}</span>
                  <span className="tag">{t("panditProfile.yearsExperience", { exp: p.exp })}</span>
                </div>
                <div ref={ctaRef} className="row" style={{ justifyContent: "center", marginTop: 22, gap: 16, flexWrap: "wrap" }}>
                  <button
                    type="button" className="btn-icon btn-3d-wa"
                    aria-label={`WhatsApp ${displayName}`}
                    disabled={isPending(p.id, "whatsapp")}
                    onClick={(e) => handleAction(e, "whatsapp")}
                  >
                    <Icon name="whatsapp" size={24} />
                  </button>
                  <button
                    type="button" className="btn btn-3d-call btn-lg"
                    disabled={isPending(p.id, "call")}
                    onClick={(e) => handleAction(e, "call")}
                  >
                    <Icon name="phone" size={20} />{" "}
                    {isPending(p.id, "call") ? "…" : t("panditProfile.callNow")}
                  </button>
                </div>
                <p className="muted" style={{ marginTop: 14, fontSize: ".84rem" }}>
                  <Icon name="shield-check" size={14} /> {t("panditProfile.verifiedProfileNote")}
                </p>
                {/* Contact-data disclosure: stated up front, not buried. */}
                <p className="muted" style={{ marginTop: 6, fontSize: ".8rem", maxWidth: 460, marginInline: "auto" }}>
                  {disclosure}
                </p>
              </div>
            </div>

            <div className="stack" style={{ gap: 20 }}>
              {/* PROOF FIRST.
                  A face and a voice is the strongest trust signal this product
                  has — far stronger than prose — and for a pandit with no
                  reviews yet it is the only one. It used to sit below About and
                  Qualifications, roughly four screens down on a phone. */}
              {reels.length > 0 && <VideoReels videos={reels} panditName={displayName} />}

              <div className="grid g-2" style={{ gap: 20, alignItems: "start" }}>
                <div className="card card-pad info-card">
                  <h3>{t("panditProfile.servicesOffered")}</h3>
                  <div className="tag-row" style={{ justifyContent: "flex-start" }}>
                    {p.services.map((s) => <Link className="tag" to={`/services/${s}`} key={s}>{s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Link>)}
                  </div>
                </div>
                <div className="card card-pad info-card">
                  <h3>{t("panditProfile.associatedTemples")}</h3>
                  <ul className="dot-list">
                    {p.temples.map((tid) => (
                      <li key={tid}><Link to={`/temples/${tid}`}>{templeNameBySlug.get(tid) || tid.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Link></li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="card card-pad info-card">
                <h3>{t("panditProfile.aboutTitle", { name: displayName })}</h3>
                <p style={{ color: "#4d4a45" }}>{p.about}</p>
              </div>

              <div className="card card-pad info-card">
                <h3>{t("panditProfile.qualificationsTitle")}</h3>
                <div className="grid g-2" style={{ gap: 14, marginTop: 6 }}>
                  {([
                    [t("panditProfile.vedicEducation"), p.edu],
                    [t("panditProfile.gotraTradition"), [p.gotra, p.tradition].filter(Boolean).join(" · ")],
                    [t("panditProfile.languagesSpoken"), p.langs.join(", ")],
                    [t("panditProfile.experience"), t("panditProfile.yearsSuffix", { exp: p.exp })],
                  ] as [string, string][])
                    // An empty bordered box reads as a broken page. These are
                    // real admin fields now (migration 08), so blank means
                    // "not filled in", not "no such concept".
                    .filter(([, v]) => Boolean(v && String(v).trim()))
                    .map(([k, v]) => (
                    <div className="pg-item" key={k}><div className="k">{k}</div><div className="v" style={{ fontSize: ".98rem" }}>{v}</div></div>
                  ))}
                </div>
                <div className="usp-band" style={{ marginTop: 18, padding: "18px 20px" }}>
                  <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
                    {[t("panditProfile.docVerified"), t("panditProfile.videoKyc"), t("panditProfile.certChecked"), t("panditProfile.templeConfirmed")].map((v) => (
                      <span className="meta-line" style={{ fontWeight: 500, color: "var(--text)" }} key={v}>
                        <Icon name="check-circle" size={16} /> {v}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* The 14-day availability grid was removed. Its Free/Busy values
                  were generated by `(date * 7 + name.length * 3 + month) % 10 > 2`
                  — a hash of the pandit's NAME, not a schedule. It could show
                  "Busy" on a day he was free and cost him the enquiry. If real
                  availability is wanted, pandit_availability and
                  pandit_blocked_dates already exist to hold it. */}
              {p.respondsWithin && (
                <div className="card card-pad info-card">
                  <h3>{t("panditProfile.responseTimeTitle")}</h3>
                  <p style={{ marginTop: 8 }}>{p.respondsWithin}</p>
                </div>
              )}

              <div className="card card-pad info-card">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0 }}>{t("panditProfile.reviewsTitle")}</h3>
                  <WriteReview targetType="pandit" targetSlug={p.id} targetName={displayName} />
                </div>
                {panditReviews.length ? (
                  <div className="scroll-x" style={{ marginTop: 14 }}>
                    {panditReviews.map((r) => <ReviewCard r={r} key={r.name} />)}
                  </div>
                ) : (
                  // An invitation, not an apology — and honest that this pandit
                  // is simply new rather than unrated.
                  <div className="pp-empty" style={{ marginTop: 14 }}>
                    {t("panditProfile.noReviewsYet")}<br />
                    <span style={{ fontSize: ".84rem" }}>
                      {t("panditProfile.noReviewsInvite")}
                    </span>
                  </div>
                )}
              </div>

              <div className="card card-pad info-card">
                <h3>{t("panditProfile.shareProfileTitle")}</h3>
                <div className="row" style={{ gap: 18, marginTop: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div className="qr-box">
                    <DecorativeQr seed={p.id} />
                    <p className="muted" style={{ fontSize: ".76rem", marginTop: 8 }}>{t("panditProfile.scanForProfile")}</p>
                  </div>
                  <div className="stack" style={{ gap: 10, flex: 1, minWidth: 200 }}>
                    <button className="btn btn-outline" onClick={copyLink}><Icon name="share" size={17} /> {t("panditProfile.copyProfileLink")}</button>
                    <a
                      className="btn btn-outline"
                      href={`https://wa.me/?text=${encodeURIComponent(window.location.href)}`}
                      target="_blank" rel="noopener noreferrer"
                    ><Icon name="whatsapp" size={17} /> {t("panditProfile.shareOnWhatsapp")}</a>
                    <p className="muted" style={{ fontSize: ".82rem" }}>{t("panditProfile.qrNote")}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--cream">
        <div className="shell">
          <h2 className="section-title section-title--left" style={{ fontSize: "clamp(1.5rem,2.6vw,2rem)", marginBottom: 26 }}>{t("panditProfile.similarPanditsTitle")}</h2>
          <div className="grid g-2 grid-2up-mobile">
            {similar.slice(0, 6).map((sp, i) => <PanditCard p={sp} key={sp.id} index={i} sourceSurface="similar_pandits" />)}
          </div>
          <div className="text-c" style={{ marginTop: 32 }}>
            <Link className="btn btn-outline" to="/pandits">{t("panditProfile.seeAllPandits")}</Link>
          </div>
        </div>
      </section>
      <ContactBar
        anchorRef={ctaRef}
        name={displayName}
        callLabel={t("panditProfile.callNow")}
        busy={isPending(p.id, "call") || isPending(p.id, "whatsapp")}
        onCall={() => contact({ panditSlug: p.id, action: "call", phone: p.phone, whatsapp: p.phone, source: "sticky_bar" })}
        onWhatsApp={() => contact({
          panditSlug: p.id, action: "whatsapp", phone: p.phone, whatsapp: p.phone,
          waMessage: `Namaste ${p.name}, I found your profile on PanditSuggest. I would like to enquire about a puja.`,
          source: "sticky_bar",
        })}
      />
    </>
  );
}
