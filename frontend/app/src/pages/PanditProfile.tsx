import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../lib/icons";
import { StarRow } from "../components/ui/StarRating";
import { ReviewCard } from "../components/ui/ReviewCard";
import { PanditCard } from "../components/ui/PanditCard";
import { DecorativeQr } from "../lib/qr";
import { onImgError, telLink, waLink } from "../lib/format";
import { useToast } from "../components/ui/Toast";
import { pandits, temple, serviceName, reviews } from "../data/content";

export default function PanditProfile() {
  const { id } = useParams();
  const p = pandits.find((x) => x.id === id) || pandits[0];
  const toast = useToast();

  useEffect(() => {
    document.title = `${p.name} — PanditConnect`;
  }, [p]);

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
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast("Profile link copied"));
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
                <img src={p.img} alt={p.name} onError={onImgError("pandit")} />
              </div>
              <h1>
                {p.name}{" "}
                {p.verified && (
                  <span className="verified-dot" title="Verified pandit"><Icon name="verified" size={28} /></span>
                )}
              </h1>
              <div className="row" style={{ justifyContent: "center", marginTop: 10 }}>
                <StarRow rating={p.rating} size={21} />
                <span className="rating-num" style={{ fontSize: "1.05rem" }}>({p.rating.toFixed(1)}/5)</span>
                <span className="muted">{p.reviews} reviews</span>
              </div>
              <div className="row" style={{ justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
                <span className="meta-line"><Icon name="map-pin" size={17} /> {p.city}, {p.state}</span>
                <span className="tag">{p.exp}+ Years Experience</span>
              </div>
              <div className="row" style={{ justifyContent: "center", marginTop: 22, gap: 16, flexWrap: "wrap" }}>
                <a className="btn-icon btn-3d-wa" href={waLink(p)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${p.name}`}>
                  <Icon name="whatsapp" size={24} />
                </a>
                <a className="btn btn-3d-call btn-lg" href={telLink(p)}>
                  <Icon name="phone" size={20} /> Call Now
                </a>
              </div>
              <p className="muted" style={{ marginTop: 14, fontSize: ".84rem" }}>
                <Icon name="shield-check" size={14} /> Verified profile · You contact pandit ji directly — we charge no commission
              </p>
            </div>

            <div className="stack" style={{ gap: 20 }}>
              <div className="grid g-2" style={{ gap: 20, alignItems: "start" }}>
                <div className="card card-pad info-card">
                  <h3>Services Offered</h3>
                  <div className="tag-row" style={{ justifyContent: "flex-start" }}>
                    {p.services.map((s) => <Link className="tag" to={`/services/${s}`} key={s}>{serviceName(s)}</Link>)}
                  </div>
                </div>
                <div className="card card-pad info-card">
                  <h3>Associated Temples</h3>
                  <ul className="dot-list">
                    {p.temples.map((tid) => {
                      const t = temple(tid);
                      return t ? <li key={tid}><Link to={`/temples/${t.id}`}>{t.name}</Link></li> : null;
                    })}
                  </ul>
                </div>
              </div>

              <div className="card card-pad info-card">
                <h3>About {p.name.replace("Pandit ", "Pandit ji — ")}</h3>
                <p style={{ color: "#4d4a45" }}>{p.about}</p>
              </div>

              <div className="card card-pad info-card">
                <h3>60-second video introduction</h3>
                <div
                  className="video-ph"
                  style={{ marginTop: 12 }}
                  role="button"
                  tabIndex={0}
                  aria-label="Play video introduction"
                  onClick={() => toast("Video intros go live once the pandit uploads from the dashboard.")}
                  onKeyDown={(e) => { if (e.key === "Enter") toast("Video intros go live once the pandit uploads from the dashboard."); }}
                >
                  <span className="play"><Icon name="play" size={26} fill /></span>
                  <span>Video intro by {p.name}</span>
                </div>
              </div>

              <div className="card card-pad info-card">
                <h3>Qualifications &amp; Verification</h3>
                <div className="grid g-2" style={{ gap: 14, marginTop: 6 }}>
                  {[
                    ["Vedic education", p.edu],
                    ["Gotra / tradition", p.gotra],
                    ["Languages spoken", p.langs.join(", ")],
                    ["Experience", `${p.exp} years`],
                  ].map(([k, v]) => (
                    <div className="pg-item" key={k}><div className="k">{k}</div><div className="v" style={{ fontSize: ".98rem" }}>{v}</div></div>
                  ))}
                </div>
                <div className="usp-band" style={{ marginTop: 18, padding: "18px 20px" }}>
                  <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
                    {["Documents verified", "Video KYC completed", "Certificate checked", "Temple confirmed"].map((v) => (
                      <span className="meta-line" style={{ fontWeight: 500, color: "var(--text)" }} key={v}>
                        <Icon name="check-circle" size={16} /> {v}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card card-pad info-card">
                <h3>Availability — next 14 days</h3>
                <div className="grid" style={{ gridTemplateColumns: "repeat(7,1fr)", gap: 8, marginTop: 14 }}>
                  {availability.map(({ d, free }) => (
                    <div className="cal-d" key={d.toISOString()} style={!free ? { opacity: 0.42, background: "var(--cream-deep)" } : undefined} title={free ? "Available" : "Booked"}>
                      <strong style={{ fontSize: ".95rem" }}>{d.getDate()}</strong>
                      <span style={{ fontSize: ".62rem", color: free ? "var(--success)" : "var(--text-2)" }}>{free ? "Free" : "Busy"}</span>
                    </div>
                  ))}
                </div>
                <p className="form-note">Indicative only — always confirm the date on call or WhatsApp.</p>
              </div>

              <div className="card card-pad info-card">
                <h3>Reviews</h3>
                <div className="scroll-x" style={{ marginTop: 14 }}>
                  {reviews.map((r) => <ReviewCard r={r} key={r.name} />)}
                </div>
              </div>

              <div className="card card-pad info-card">
                <h3>Share this profile</h3>
                <div className="row" style={{ gap: 18, marginTop: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div className="qr-box">
                    <DecorativeQr seed={p.id} />
                    <p className="muted" style={{ fontSize: ".76rem", marginTop: 8 }}>Scan for profile</p>
                  </div>
                  <div className="stack" style={{ gap: 10, flex: 1, minWidth: 200 }}>
                    <button className="btn btn-outline" onClick={copyLink}><Icon name="share" size={17} /> Copy profile link</button>
                    <a className="btn btn-outline" href={waLink(p)} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={17} /> Share on WhatsApp</a>
                    <p className="muted" style={{ fontSize: ".82rem" }}>Every pandit gets a printable QR code — paste it at the temple counter so devotees can find the profile offline.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--cream">
        <div className="shell">
          <h2 className="section-title section-title--left" style={{ fontSize: "clamp(1.5rem,2.6vw,2rem)", marginBottom: 26 }}>Similar Pandit Ji nearby</h2>
          <div className="grid g-2">
            {similar.map((sp, i) => <PanditCard p={sp} key={sp.id} index={i} />)}
          </div>
        </div>
      </section>
    </>
  );
}
