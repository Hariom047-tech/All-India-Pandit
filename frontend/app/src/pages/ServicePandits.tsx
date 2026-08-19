import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useService, usePandits } from "../hooks/useData";
import { normService, normPandits } from "../lib/normalize";
import { useFairRanking, useReportExposure } from "../lib/api";
import { PanditCard } from "../components/ui/PanditCard";
import { Loading, ErrorState } from "../components/ui/DataState";
import { EmptyState } from "../components/ui/ReviewCard";
import { Pager, paginate } from "../components/ui/Pager";
import { Seo } from "../lib/Seo";
import { useStructuredData, organizationSchema, websiteSchema, webPageSchema, breadcrumbSchema } from "../lib/structuredData";

const PER_PAGE = 24;

/**
 * A dedicated, focused listing of every Pandit who performs one specific
 * service — not the general /pandits directory with a `?service=` filter
 * applied. This is the pattern the master SEO prompt itself recommends
 * (Part 129: a curated "Pandits in Ujjain" page over a query-param
 * variation of the main directory) and what the user explicitly asked for
 * over the query-filtered version this replaced: no directory chrome
 * (search bar, sidebar filters, generic hero) — just the heading and every
 * matching Pandit, paginated (docs/SEO_ARCHITECTURE.md).
 */
export default function ServicePandits() {
  const { id } = useParams();
  const { data: rawService, loading, error } = useService(id || "");
  // 600: same reasoning as every other full-batch pandit fetch on this site
  // (Pandits.tsx, ServiceDetail.tsx) — "limit" isn't a real API param.
  const { data: rawPandits } = usePandits({ perPage: 600 });
  const [page, setPage] = useState(1);

  const s = useMemo(() => (rawService ? normService(rawService) : null), [rawService]);
  const allPandits = useMemo(() => normPandits(rawPandits), [rawPandits]);

  // Same fair-rotation engine as every other pandit listing on the site —
  // never a separate order for this page.
  const fairScores = useFairRanking(undefined, s?.id, { enabled: Boolean(s) });
  const pandits = useMemo(() => {
    if (!s) return [];
    const list = allPandits.filter((p) => p.services.includes(s.id));
    return [...list].sort((a, b) => {
      if (fairScores) {
        const diff = (fairScores.get(b.id) ?? -Infinity) - (fairScores.get(a.id) ?? -Infinity);
        if (diff) return diff;
      }
      return b.rating - a.rating;
    });
  }, [allPandits, s, fairScores]);

  const { page: clampedPage, pages, slice: pageItems } = useMemo(
    () => paginate(pandits, page, PER_PAGE),
    [pandits, page],
  );
  useReportExposure(pageItems.map((p) => p.id), { service: s?.id, enabled: Boolean(s) });

  // Hook call must be unconditional (before the loading/error early returns
  // below) — see docs/SEO_ARCHITECTURE.md. Passing null until data arrives.
  useStructuredData(s ? [
    organizationSchema(),
    websiteSchema(),
    webPageSchema({ path: `/services/${s.id}/pandits`, name: `Pandits who perform ${s.name}` }),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Services", path: "/services" },
      { name: s.name, path: `/services/${s.id}` },
      { name: "Pandits", path: `/services/${s.id}/pandits` },
    ]),
  ] : null);

  if (loading) return <div className="section"><div className="shell"><Loading lines={1} type="detail" /></div></div>;
  if (error || !s) return <div className="section"><div className="shell"><ErrorState message={error || "Service not found"} /></div></div>;

  return (
    <div className="section" style={{ paddingTop: 48, paddingBottom: 60 }}>
      <Seo
        title={`Pandits who perform ${s.name} — PanditSuggest`}
        description={`Browse all ${pandits.length} verified Pandits who perform ${s.name}. Compare experience, languages and reviews, then contact directly on WhatsApp or call — no middleman, no commission.`}
        path={`/services/${s.id}/pandits`}
      />
      <div className="shell">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link> <span>/</span>{" "}
          <Link to="/services">Services</Link> <span>/</span>{" "}
          <Link to={`/services/${s.id}`}>{s.name}</Link> <span>/</span> Pandits
        </nav>
        <h1 className="section-title section-title--left" style={{ fontSize: "clamp(1.5rem,2.6vw,2rem)", marginTop: 10 }}>
          Pandits who perform {s.name}
        </h1>
        <p className="muted" style={{ marginTop: 8 }}>{pandits.length} verified Pandits</p>

        {pandits.length ? (
          <>
            <div className="grid g-3 grid-2up-mobile" style={{ marginTop: 28 }}>
              {pageItems.map((p, i) => <PanditCard p={p} key={p.id} index={i} sourceSurface="service_pandits_page" />)}
            </div>
            <div className="text-c" style={{ marginTop: 30 }}>
              <Pager page={clampedPage} pages={pages} onChange={setPage} />
            </div>
          </>
        ) : (
          <EmptyState msg="No pandit has listed this service yet. Try the directory or send an enquiry." />
        )}
      </div>
    </div>
  );
}
