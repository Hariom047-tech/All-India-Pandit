import { useState, useRef, useEffect } from "react";
import type { Review } from "../../data/types";
import { StarRow } from "./StarRating";
import { onImgError } from "../../lib/format";

/** Max visible lines before "Read more" kicks in on mobile */


export function ReviewCard({ r }: { r: Review }) {
  const variant = r.variant || "standard";
  const [expanded, setExpanded] = useState(false);
  const [needsClamp, setNeedsClamp] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  /* Check on mount (and resize) whether the text overflows the 3-line clamp */
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const check = () => setNeedsClamp(el.scrollHeight > el.clientHeight + 2);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [r.text]);

  return (
    <div className={`review-card review-card--${variant}`}>
      {/* Featured Photo Section (for 'with-photo' or 'featured' variants) */}
      {r.photos && r.photos.length > 0 && (
        <div className="review-card__photo-wrap">
          <img src={r.photos[0]} alt="Puja ceremony" className="review-card__photo" />
        </div>
      )}

      <div className="review-card__content">
        <StarRow rating={r.rating} size={variant === "short" ? 20 : 16} />

        <p
          ref={textRef}
          className={`review-card__text${expanded ? " review-card__text--expanded" : ""}`}
        >
          {variant === "short" ? `"${r.text}"` : r.text}
        </p>

        {/* Read More / Read Less toggle — only shows when text is clamped */}
        {(needsClamp || expanded) && (
          <button
            className="review-card__read-more"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "Read Less ▲" : "Read More ▼"}
          </button>
        )}

        <div className="review-card__author row">
          <span className="avatar-ring avatar-ring--sm review-card__avatar">
            <img src={r.avatar || "/assets/img/pandit-placeholder.svg"} alt="" onError={onImgError("pandit")} />
          </span>
          <span>
            <strong className="review-card__author-name">{r.name}</strong>
            <span className="muted review-card__author-detail">
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
