import type { Review } from "../../data/types";
import { StarRow } from "./StarRating";
import { onImgError } from "../../lib/format";

export function ReviewCard({ r }: { r: Review }) {
  const variant = r.variant || "standard";
  
  return (
    <div className={`review-card review-card--${variant}`}>
      {/* Featured Photo Section (for 'with-photo' or 'featured' variants) */}
      {r.photos && r.photos.length > 0 && (
        <div className="review-card__photo-wrap">
          <img src={r.photos[0]} alt="Puja ceremony" className="review-card__photo" />
        </div>
      )}
      
      <div className="review-card__content">
        <StarRow rating={r.rating} size={variant === "short" ? 22 : 18} />
        
        <p className="review-card__text">
          {variant === "short" ? `"${r.text}"` : r.text}
        </p>
        
        <div className="review-card__author row">
          <span className="avatar-ring avatar-ring--sm" style={{ width: 44, height: 44 }}>
            <img src={r.avatar || "/assets/img/pandit-placeholder.svg"} alt="" onError={onImgError("pandit")} />
          </span>
          <span>
            <strong style={{ fontFamily: "var(--font-head)", fontSize: ".95rem" }}>{r.name}</strong>
            <span className="muted" style={{ display: "block", fontSize: ".82rem" }}>
              {r.city}{r.service ? ` · ${r.service}` : ""}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="empty">
      <svg viewBox="0 0 24 24" width={56} height={56} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.6-3.6" />
      </svg>
      <h3 style={{ marginBottom: 6 }}>Nothing matched</h3>
      <p>{msg}</p>
    </div>
  );
}
