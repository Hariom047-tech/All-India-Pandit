import type { Review } from "../../data/types";
import { StarRow } from "./StarRating";

export function ReviewCard({ r }: { r: Review }) {
  return (
    <div className="review">
      <StarRow rating={r.rating} />
      <p>{r.text}</p>
      <p className="review-meta">
        {r.name} · {r.city}{r.service ? ` · ${r.service}` : ""}
      </p>
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
