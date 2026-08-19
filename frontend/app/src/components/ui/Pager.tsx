import { Icon } from "../../lib/icons";

/**
 * Which page-number buttons to actually render, for potentially dozens of
 * pages. Always keeps the current page inside a small consecutive window
 * (so "Next" reveals one more number at a time — 1,2,3 → 2,3,4 → 3,4,5 — the
 * page itself still only moves by one), plus the first and last page as
 * fixed anchors with an ellipsis when there's a gap. A page count this
 * component used to render as one unbroken row of buttons (up to 50 of them
 * on the pandit directory) is why this exists.
 */
function visiblePageNumbers(page: number, pages: number, windowSize = 3): (number | "…")[] {
  if (pages <= windowSize + 2) return Array.from({ length: pages }, (_, i) => i + 1);

  const half = Math.floor(windowSize / 2);
  let start = Math.max(2, page - half);
  let end = Math.min(pages - 1, start + windowSize - 1);
  start = Math.max(2, end - windowSize + 1);

  const out: (number | "…")[] = [1];
  if (start > 2) out.push("…");
  for (let n = start; n <= end; n += 1) out.push(n);
  if (end < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

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
  const nums = visiblePageNumbers(page, pages);
  return (
    <div className="pager">
      <button disabled={page === 1} aria-label="Previous page" onClick={() => onChange(page - 1)}>
        <Icon name="chevron-left" size={18} />
      </button>
      {nums.map((n, i) =>
        n === "…" ? (
          <span key={`ellipsis-${i}`} className="pager__ellipsis" aria-hidden="true">…</span>
        ) : (
          <button key={n} className={n === page ? "is-active" : ""} aria-current={n === page ? "page" : undefined} onClick={() => onChange(n)}>
            {n}
          </button>
        ),
      )}
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
