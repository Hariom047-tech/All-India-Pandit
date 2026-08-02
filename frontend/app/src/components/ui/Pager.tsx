import { Icon } from "../../lib/icons";

export function Pager({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  if (pages < 2) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1);
  return (
    <div className="pager">
      <button disabled={page === 1} aria-label="Previous page" onClick={() => onChange(page - 1)}>
        <Icon name="chevron-left" size={18} />
      </button>
      {nums.map((n) => (
        <button key={n} className={n === page ? "is-active" : ""} aria-current={n === page ? "page" : undefined} onClick={() => onChange(n)}>
          {n}
        </button>
      ))}
      <button disabled={page === pages} aria-label="Next page" onClick={() => onChange(page + 1)}>
        <Icon name="chevron-right" size={18} />
      </button>
    </div>
  );
}

export function paginate<T>(items: T[], page: number, per: number) {
  const pages = Math.max(1, Math.ceil(items.length / per));
  const clamped = Math.min(Math.max(1, page), pages);
  return { page: clamped, pages, slice: items.slice((clamped - 1) * per, clamped * per) };
}

export function countBy<T, K extends keyof T>(list: T[], key: K): Record<string, number> {
  return list.reduce((acc: Record<string, number>, item) => {
    const k = String(item[key]);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}
