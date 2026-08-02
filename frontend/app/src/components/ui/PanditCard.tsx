import { Link } from "react-router-dom";
import type { Pandit } from "../../data/types";
import { serviceName } from "../../data/content";
import { Icon } from "../../lib/icons";
import { onImgError, telLink, waLink } from "../../lib/format";
import { motion } from "framer-motion";

export function PanditCard({ p, index = 0 }: { p: Pandit; index?: number }) {
  return (
    <motion.article
      className="astro-card"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.45, delay: Math.min(index, 6) * 0.05, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link to={`/pandits/${p.id}`} className="astro-card__link-wrap">
        
        {/* Header: Avatar, Name, Tier */}
        <div className="astro-card__header">
          <div className="astro-card__avatar">
            <img src={p.img} alt={p.name} loading="lazy" onError={onImgError("pandit")} />
          </div>
          
          <div className="astro-card__header-info">
            <div className="astro-card__name-row">
              <h3 className="astro-card__name">{p.name}</h3>
              {p.verified && (
                <span className="astro-card__verified" title="Verified">
                  <Icon name="verified" size={16} />
                </span>
              )}
            </div>
            <div className="astro-card__meta-short">
              {p.exp} yrs exp • {p.langs.slice(0, 2).join(", ")}
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="astro-card__tags">
          {p.services.slice(0, 3).map((s) => (
            <span className="astro-card__tag" key={s}>{serviceName(s)}</span>
          ))}
        </div>

        {/* Rating and Online Status */}
        <div className="astro-card__stats-row">
          <div className="astro-card__rating">
            <span className="astro-card__star">★</span> 
            <span className="astro-card__rating-num">{p.rating.toFixed(1)}</span>
            <span className="astro-card__orders">{p.reviews}k+ orders</span>
          </div>
          <div className="astro-card__online">
            <span className="astro-card__online-dot" /> Online
          </div>
        </div>

        {/* Footer: Price & Buttons */}
        <div className="astro-card__footer">
          <div className="astro-card__price-col">
            <div className="astro-card__price">Dakshina</div>
            <div className="astro-card__free">Via Call</div>
          </div>
          
          <div className="astro-card__actions">
            <a href={waLink(p)} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm astro-card__btn" onClick={(e) => e.stopPropagation()}>
              <Icon name="whatsapp" size={14} /> Chat
            </a>
            <a href={telLink(p)} className="btn btn-outline btn-sm astro-card__btn astro-card__btn--green" onClick={(e) => e.stopPropagation()}>
              <Icon name="phone" size={14} /> Call
            </a>
          </div>
        </div>

      </Link>
    </motion.article>
  );
}
