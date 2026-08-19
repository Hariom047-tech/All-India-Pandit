import { Link } from "react-router-dom";
import type { Pandit } from "../../data/types";
// serviceName & panditDisplayName are now inline helpers
import { Icon } from "../../lib/icons";
import { onImgError } from "../../lib/format";
import { usePanditContact } from "../../lib/usePanditContact";
import { useLang } from "../../lib/i18n";
import { useInViewOnce } from "../../lib/useInViewOnce";

export function PanditCard({ p, index = 0, sourceSurface }: { p: Pandit; index?: number; sourceSurface?: string }) {
  const { t, lang } = useLang();
  const displayName = lang === "hi" && p.nameHi ? p.nameHi : p.name;
  const { ref, visible } = useInViewOnce<HTMLElement>();
  // One shared contact flow (see lib/usePanditContact.ts). This card sits
  // inside a <Link>, so the press must be stopped from navigating first.
  const { contact, isPending } = usePanditContact();

  const handleAction = (e: React.MouseEvent, type: "whatsapp" | "call") => {
    e.preventDefault();
    e.stopPropagation();
    contact({
      panditSlug: p.id,
      action: type,
      phone: p.phone,
      whatsapp: p.phone,
      waMessage: `Namaste ${p.name}, I found your profile on PanditSuggest. I would like to enquire about a puja.`,
      // Which page this card is rendered on, for the admin activity/lead
      // source-surface breakdown — see backend's SOURCE_SURFACE_MAP.
      // Falls back to the pre-existing generic value for any caller that
      // hasn't been updated to pass one.
      source: sourceSurface || "pandit_card",
    });
  };

  return (
    <article
      ref={ref}
      className={`astro-card card-reveal${visible ? " is-visible" : ""}`}
      style={{ transitionDelay: `${Math.min(index, 6) * 50}ms` }}
    >
      <Link to={`/pandits/${p.id}`} className="astro-card__link-wrap">
        
        {/* Header: Avatar, Name, Tier */}
        <div className="astro-card__header">
          <div className="astro-card__avatar">
            <img src={p.img} alt={displayName} loading="lazy" onError={onImgError("pandit")} />
          </div>

          <div className="astro-card__header-info">
            <div className="astro-card__name-row">
              <h3 className="astro-card__name">{displayName}</h3>
              {p.verified && (
                <span className="astro-card__verified" title={t("common.verified")}>
                  <Icon name="verified" size={16} />
                </span>
              )}
            </div>
            <div className="astro-card__meta-short">
              {p.exp} {t("common.yearsExp")} • {p.langs.slice(0, 2).join(", ")}
            </div>
            {/* Always rendered, even when city is blank (e.g. a profile mid
                onboarding) — an empty row keeps every card the same height
                and the same internal alignment as one with a real city. */}
            <div className="astro-card__location">
              <Icon name="map-pin" size={12} />
              <span>{p.city || t("panditCard.locationUnknown")}</span>
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="astro-card__tags">
          {p.services.slice(0, 3).map((s) => (
            <span className="astro-card__tag" key={s}>{s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
          ))}
        </div>

        {/* Rating and Online Status */}
        <div className="astro-card__stats-row">
          <div className="astro-card__rating">
            <span className="astro-card__star">★</span> 
            <span className="astro-card__rating-num">{p.rating.toFixed(1)}</span>
            <span className="astro-card__orders">{p.reviews}k+ {t("panditCard.orders")}</span>
          </div>
          <div className="astro-card__online">
            <span className="astro-card__online-dot" /> {t("common.online")}
          </div>
        </div>

        {/* Footer: Price & Buttons */}
        <div className="astro-card__footer">
          <div className="astro-card__price-col">
            <div className="astro-card__price">{t("panditCard.dakshina")}</div>
            <div className="astro-card__free">{t("panditCard.viaCall")}</div>
          </div>

          <div className="astro-card__actions">
            <button
              type="button"
              className="btn btn-outline btn-sm astro-card__btn"
              onClick={(e) => handleAction(e, "whatsapp")}
              disabled={isPending(p.id, "whatsapp")}
              aria-label={`WhatsApp ${displayName}`}
            >
              <Icon name="whatsapp" size={14} /> {t("common.chat")}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm astro-card__btn astro-card__btn--green"
              onClick={(e) => handleAction(e, "call")}
              disabled={isPending(p.id, "call")}
              aria-label={`Call ${displayName}`}
            >
              <Icon name="phone" size={14} /> {t("common.call")}
            </button>
          </div>
        </div>

      </Link>
    </article>
  );
}
