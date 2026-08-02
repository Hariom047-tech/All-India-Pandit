import { Icon } from "../../lib/icons";

export function StarRow({ rating, size = 15 }: { rating: number; size?: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.4;
  return (
    <span className="stars" style={{ gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const on = i < full;
        const isHalf = !on && i === full && half;
        return (
          <span key={i} style={{ opacity: on ? 1 : isHalf ? 0.55 : 0.26 }}>
            <Icon name="star" fill size={size} />
          </span>
        );
      })}
    </span>
  );
}

export function RatingRow({ rating, reviews }: { rating: number; reviews?: number }) {
  return (
    <span className="row" style={{ gap: 7 }}>
      <StarRow rating={rating} />
      <span className="rating-num">{rating.toFixed(1)}</span>
      {reviews ? <span className="muted">({reviews})</span> : null}
    </span>
  );
}

export function RatingCompact({ rating }: { rating: number }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="rating-num">{rating.toFixed(1)}</span>
      <StarRow rating={rating} />
    </span>
  );
}
