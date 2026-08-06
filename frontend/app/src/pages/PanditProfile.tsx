import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../lib/icons";
import { StarRow } from "../components/ui/StarRating";
import { ReviewCard } from "../components/ui/ReviewCard";
import { PanditCard } from "../components/ui/PanditCard";
import { DecorativeQr } from "../lib/qr";
import { onImgError, telLink, waLink } from "../lib/format";
import { useToast } from "../components/ui/Toast";
import { pandits, temple, serviceName, reviews, panditDisplayName } from "../data/content";
import { api } from "../lib/api";
import { useAuth } from "../lib/Auth";
import { useNavigate, useLocation } from "react-router-dom";
import { useLang } from "../lib/i18n";

export default function PanditProfile() {
  const { id } = useParams();
  const p = pandits.find((x) => x.id === id) || pandits[0];
  const toast = useToast();
  const { t, lang } = useLang();
  const displayName = panditDisplayName(p, lang);

  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleAction = (e: React.MouseEvent, type: "whatsapp" | "call") => {
    e.stopPropagation();
    if (!user) {
      e.preventDefault();
      navigate("/login", { state: { from: location } });
      return;
    }
    api.trackClick(p.id, type).catch(() => {});
  };

  useEffect(() => {
    document.title = `${displayName} — PanditSuggest`;
    api.trackView(p.id).catch(()=>{});
  }, [p, displayName]);

  const availability = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const seed = (d.getDate() * 7 + p.name.length * 3 + d.getMonth()) % 10;
      return { d, free: seed > 2 };
    });
  }, [p]);

  const similar = pandits
    .filter((x) => x.id !== p.id && (x.city === p.city || x.services.some((s) => p.services.includes(s))))
    .slice(0, 4);

  function copyLink() {
    const url = window.location.href;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast(t("panditProfile.profileLinkCopiedToast")));
    else toast(url);
  }

  return (
    <>
      <section className="section" style={{ paddingTop: 48 }}>
        <div className="shell">


          <div className="profile-hero">
            <div className="profile-id">
              <img src="/assets/img/mandala.svg" className="mandala-bg" alt="" />
              <div className="avatar-ring avatar-ring--lg">
                <img src={p.img} alt={displayName} onError={onImgError("pandit")} />
              </div>
              <h1>
                {displayName}{" "}
                {p.verified && (
                  <span className="verified-dot" title={t("panditProfile.verifiedPandit")}><Icon name="verified" size={28} /></span>
                )}
              </h1>
              <div className="row" style={{ justifyContent: "center", marginTop: 10 }}>
                <StarRow rating={p.rating} size={21} />
                <span className="rating-num" style={{ fontSize: "1.05rem" }}>({p.rating.toFixed(1)}/5)</span>
                <span className="muted">{p.reviews} {t("panditProfile.reviewsCount")}</span>
              </div>
              <div className="row" style={{ justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
                <span className="meta-line"><Icon name="map-pin" size={17} /> {p.city}, {p.state}</span>
                <span className="tag">{t("panditProfile.yearsExperience", { exp: p.exp })}</span>
              </div>
              <div className="row" style={{ justifyContent: "center", marginTop: 22, gap: 16, flexWrap: "wrap" }}>
                <a className="btn-icon btn-3d-wa" href={user ? waLink(p) : "#"} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${displayName}`} onClick={(e) => handleAction(e, "whatsapp")}>
                  <Icon name="whatsapp" size={24} />
                </a>
                <a className="btn btn-3d-call btn-lg" href={user ? telLink(p) : "#"} onClick={(e) => handleAction(e, "call")}>
                  <Icon name="phone" size={20} /> {t("panditProfile.callNow")}
                </a>
              </div>
              <p className="muted" style={{ marginTop: 14, fontSize: ".84rem" }}>
                <Icon name="shield-check" size={14} /> {t("panditProfile.verifiedProfileNote")}
              </p>
            </div>

            <div className="stack" style={{ gap: 20 }}>
              <div className="grid g-2" style={{ gap: 20, alignItems: "start" }}>
                <div className="card card-pad info-card">
                  <h3>{t("panditProfile.servicesOffered")}</h3>
                  <div className="tag-row" style={{ justifyContent: "flex-start" }}>
                    {p.services.map((s) => <Link className="tag" to={`/services/${s}`} key={s}>{serviceName(s)}</Link>)}
                  </div>
                </div>
                <div className="card card-pad info-card">
                  <h3>{t("panditProfile.associatedTemples")}</h3>
                  <ul className="dot-list">
                    {p.temples.map((tid) => {
                      const tm = temple(tid);
                      return tm ? <li key={tid}><Link to={`/temples/${tm.id}`}>{tm.name}</Link></li> : null;
                    })}
                  </ul>
                </div>
              </div>

              <div className="card card-pad info-card">
                <h3>{t("panditProfile.aboutTitle", { name: displayName })}</h3>
                <p style={{ color: "#4d4a45" }}>{p.about}</p>
              </div>

              <div className="card card-pad info-card">
                <h3>{t("panditProfile.videoIntroTitle")}</h3>
                <div
                  className="video-ph"
                  style={{ marginTop: 12 }}
                  role="button"
                  tabIndex={0}
                  aria-label={t("panditProfile.playVideoIntro")}
                  onClick={() => toast(t("panditProfile.videoComingSoon"))}
                  onKeyDown={(e) => { if (e.key === "Enter") toast(t("panditProfile.videoComingSoon")); }}
                >
                  <span className="play"><Icon name="play" size={26} fill /></span>
                  <span>{t("panditProfile.videoIntroBy", { name: displayName })}</span>
                </div>
              </div>

              <div className="card card-pad info-card">
                <h3>{t("panditProfile.qualificationsTitle")}</h3>
                <div className="grid g-2" style={{ gap: 14, marginTop: 6 }}>
                  {[
                    [t("panditProfile.vedicEducation"), p.edu],
                    [t("panditProfile.gotraTradition"), p.gotra],
                    [t("panditProfile.languagesSpoken"), p.langs.join(", ")],
                    [t("panditProfile.experience"), t("panditProfile.yearsSuffix", { exp: p.exp })],
                  ].map(([k, v]) => (
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

              <div className="card card-pad info-card">
                <h3>{t("panditProfile.availabilityTitle")}</h3>
                <div className="grid" style={{ gridTemplateColumns: "repeat(7,1fr)", gap: 8, marginTop: 14 }}>
                  {availability.map(({ d, free }) => (
                    <div className="cal-d" key={d.toISOString()} style={!free ? { opacity: 0.42, background: "var(--cream-deep)" } : undefined} title={free ? t("panditProfile.available") : t("panditProfile.booked")}>
                      <strong style={{ fontSize: ".95rem" }}>{d.getDate()}</strong>
                      <span style={{ fontSize: ".62rem", color: free ? "var(--success)" : "var(--text-2)" }}>{free ? t("panditProfile.free") : t("panditProfile.busy")}</span>
                    </div>
                  ))}
                </div>
                <p className="form-note">{t("panditProfile.availabilityNote")}</p>
              </div>

              <div className="card card-pad info-card">
                <h3>{t("panditProfile.reviewsTitle")}</h3>
                <div className="scroll-x" style={{ marginTop: 14 }}>
                  {reviews.map((r) => <ReviewCard r={r} key={r.name} />)}
                </div>
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
                    <a className="btn btn-outline" href={user ? waLink(p) : "#"} target="_blank" rel="noopener noreferrer" onClick={(e) => handleAction(e, "whatsapp")}><Icon name="whatsapp" size={17} /> {t("panditProfile.shareOnWhatsapp")}</a>
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
            {similar.slice(0, 6).map((sp, i) => <PanditCard p={sp} key={sp.id} index={i} />)}
          </div>
          <div className="text-c" style={{ marginTop: 32 }}>
            <Link className="btn btn-outline" to="/pandits">{t("panditProfile.seeAllPandits")}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
