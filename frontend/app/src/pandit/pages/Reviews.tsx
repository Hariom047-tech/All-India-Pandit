import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { PageHead, Loading, EmptyState, ErrorState, formatDate } from "./_shared";

interface Review { id: string; rating: number; title?: string; body?: string; created_at: string; author?: string }

export default function Reviews() {
  const [items, setItems] = useState<Review[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ slug: string }>("/me/pandit-profile")
      .then((me) => api.get<Review[] | { data: Review[] }>(`/reviews?targetType=pandit&targetSlug=${me.slug}`))
      .then((res) => setItems(Array.isArray(res) ? res : res.data || []))
      .catch(() => setError("Reviews load nahi ho payin."));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!items) return <Loading />;

  return (
    <div className="pandit-page">
      <PageHead title="Reviews" sub="Devotees ne aapke baare mein kya kaha." />
      {items.length === 0 ? (
        <EmptyState title="Abhi koi review nahi hai." sub="Puja ke baad devotees review chhod sakte hain." />
      ) : (
        <ul className="pandit-reviews">
          {items.map((r) => (
            <li key={r.id} className="pandit-review">
              <div className="pandit-review__head">
                <span aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                <small>{formatDate(r.created_at)}</small>
              </div>
              {r.title && <strong>{r.title}</strong>}
              {r.body && <p>{r.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
