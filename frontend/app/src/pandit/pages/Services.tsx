import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { PageHead, Loading, EmptyState, ErrorState } from "./_shared";

interface Svc { id?: string; name: string; slug?: string }

/**
 * Read-only for now, and honest about it: the pandit<->service mapping is
 * assigned by an admin (admin/pandits update syncs pandit_services), so this
 * screen shows what is currently mapped rather than pretending to be editable.
 */
export default function Services() {
  const [items, setItems] = useState<Svc[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ slug: string; services?: Svc[] }>("/me/pandit-profile")
      .then(async (me) => {
        const full = await api.get<{ services?: Svc[] }>(`/pandits/${me.slug}`);
        setItems(full.services || []);
      })
      .catch(() => setError("Services load nahi ho payin."));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!items) return <Loading />;

  return (
    <div className="pandit-page">
      <PageHead title="Services" sub="Aap jin pujaon ke liye listed hain." />
      {items.length === 0 ? (
        <EmptyState title="Abhi koi service mapped nahi hai."
          sub="Nayi service add karwane ke liye support se sampark karein." />
      ) : (
        <ul className="pandit-chiplist">
          {items.map((s, i) => <li key={s.slug || i} className="pandit-chip pandit-chip--lg">{s.name}</li>)}
        </ul>
      )}
      <p className="pandit-note">Services admin dwara assign ki jaati hain.</p>
    </div>
  );
}
