import { Link } from "react-router-dom";
import { useState } from "react";
import type { Temple } from "../../data/types";
import { Icon } from "../../lib/icons";
import { RatingCompact } from "./StarRating";
import { onImgError } from "../../lib/format";
import { useLang } from "../../lib/i18n";
import { useInViewOnce } from "../../lib/useInViewOnce";

export function TempleCard({ t, index = 0 }: { t: Temple; index?: number }) {
  // aliased: this component's prop is already named `t` (the temple object)
  const { t: tr } = useLang();
  const [fav, setFav] = useState(false);
  const { ref, visible } = useInViewOnce<HTMLElement>();
  return (
    // .card--hover already has its own CSS-only :hover lift (base.css) —
    // framer-motion's whileHover was redundant with it, same as this
    // component's entrance animation (Phase 12, docs/SEO_ARCHITECTURE.md).
    <article
      ref={ref}
      className={`card card--hover card-reveal${visible ? " is-visible" : ""}`}
      style={{ transitionDelay: `${Math.min(index, 6) * 50}ms` }}
    >
      <div className="thumb">
        <img src={t.img} alt={t.name} loading="lazy" onError={onImgError("temple")} />
        <span className="thumb-badge badge-gold">
          <Icon name="user" size={13} /> {t.pandits} {tr("temples.pandits")}
        </span>
        <button
          className={`thumb-fav${fav ? " is-on" : ""}`}
          aria-label={`Save ${t.name}`}
          onClick={() => setFav((v) => !v)}
        >
          <Icon name="heart" size={17} />
        </button>
      </div>
      <div className="card-body">
        <h3 className="card-title">
          <Link to={`/temples/${t.id}`}>{t.name}</Link>
        </h3>
        <p className="meta-line"><Icon name="map-pin" size={15} /> {t.city}, {t.state}</p>
        <p className="meta-line" style={{ marginTop: 4 }}><Icon name="clock" size={15} /> {t.timings}</p>
        <div className="card-foot">
          <RatingCompact rating={t.rating} />
          <Link className="btn btn-outline btn-sm" to={`/temples/${t.id}`}>{tr("common.viewPandits")}</Link>
        </div>
      </div>
    </article>
  );
}
