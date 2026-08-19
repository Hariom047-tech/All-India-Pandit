import { useState, useRef, useEffect } from "react";
import type { Review } from "../../data/types";
import { StarRow } from "./StarRating";
import { onImgError } from "../../lib/format";
import { Lightbox } from "./Lightbox";

/** "12 Aug 2026" — short, unambiguous, and locale-correct for India. */
function reviewDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Max visible lines before "Read more" kicks in on mobile */


export function ReviewCard({ r }: { r: Review }) {
  const variant = r.variant || "standard";
  const [expanded, setExpanded] = useState(false);
  const [lightboxAt, setLightboxAt] = useState<number | null>(null);
  const photos = r.photos ?? [];
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
      {/* Hero photo, only for the variants whose layout is built around one.
          A standard card shows its photos as a thumbnail strip instead, so a
          five-photo review does not become a five-screen-tall card. */}
      {photos.length > 0 && (variant === "featured" || variant === "with-photo") && (
        <div className="review-card__photo-wrap">
          <img src={photos[0]} alt={`Photo from ${r.name}'s review`} className="review-card__photo" loading="lazy" />
        </div>
      )}

      <div className="review-card__content">
        <div className="review-card__head">
          <StarRow rating={r.rating} size={variant === "short" ? 20 : 16} />
          {r.date && <time className="review-card__date" dateTime={r.date}>{reviewDate(r.date)}</time>}
        </div>

        {r.title && <h4 className="review-card__title">{r.title}</h4>}

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

        {/* Thumbnails for the standard card. Tapping opens the shared
            lightbox, which already handles Escape and arrow-key paging. */}
        {photos.length > 0 && variant !== "featured" && variant !== "with-photo" && (
          <div className="review-card__thumbs">
            {photos.slice(0, 5).map((src, i) => (
              <button
                type="button"
                key={src}
                className="review-card__thumb"
                onClick={() => setLightboxAt(i)}
                aria-label={`Open photo ${i + 1} of ${photos.length} from ${r.name}'s review`}
              >
                <img src={src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}

        {lightboxAt !== null && (
          <Lightbox
            images={photos.map((src) => ({ src, alt: `Photo from ${r.name}'s review` }))}
            index={lightboxAt}
            onClose={() => setLightboxAt(null)}
            onIndexChange={setLightboxAt}
          />
        )}

        <div className="review-card__author row">
          <span className="avatar-ring avatar-ring--sm review-card__avatar">
            <img src={r.avatar || "/assets/img/pandit-placeholder.svg"} alt="" onError={onImgError("pandit")} />
          </span>
          <span>
            <strong className="review-card__author-name">{r.name}</strong>
            <span className="muted review-card__author-detail">
              {[r.city, r.service].filter(Boolean).join(" · ")}
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
