import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../lib/icons";
import { onImgError } from "../lib/format";
import { SacredBackground } from "../components/ui/SacredBackground";
import { SearchEngine } from "../lib/searchEngine";
import { useFairRanking, useReportExposure } from "../lib/api";
import { usePandits, useTemples, useServices } from "../hooks/useData";
import { normPandits, normTemples, normServices } from "../lib/normalize";
import "../styles/search.css";
import { Seo } from "../lib/Seo";

const POPULAR_SEARCHES = [
  "Griha Pravesh",
  "Havan",
  "Satyanarayan Katha",
  "Mahakal Mandir",
  "Wedding Pandit",
  "Baglamukhi",
  "Rudrabhishek",
  "Mundan",
];

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") || "";
  const [query, setQuery] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ── Fetch data from API ── */
  // 600: "limit" was never a real API param (silently ignored, falling back
  // to a 12-row default) — see Pandits.tsx for the full explanation.
  const { data: rawPandits } = usePandits({ perPage: 600 });
  const { data: rawTemples } = useTemples({ perPage: 50 });
  const { data: rawServices } = useServices();
  const pandits = useMemo(() => normPandits(rawPandits), [rawPandits]);
  const temples = useMemo(() => normTemples(rawTemples), [rawTemples]);
  const services = useMemo(() => normServices(rawServices), [rawServices]);

  const engine = useMemo(() => new SearchEngine(pandits, temples, services), [pandits, temples, services]);
  const fairScores = useFairRanking();

  // Auto-focus on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Sync state to URL with debounce
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (query.trim()) {
        setSearchParams({ q: query });
      } else {
        setSearchParams({});
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, setSearchParams]);

  const handleClear = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  const handleChipClick = (term: string) => {
    setQuery(term);
    inputRef.current?.focus();
  };

  const results = useMemo(() => {
    return engine.search(query);
  }, [engine, query]);

  /**
   * Relevance first, then fair rotation WITHIN the relevant band — never the
   * other way round. results.pandits is already filtered/sorted by
   * searchEngine's own relevance score; this only reorders among the top
   * candidates that are already comparably relevant, the same "eligible
   * pool -> rotate" shape every other marketplace surface uses. A result
   * outside the top 12 by relevance can never be promoted into the visible
   * 6 just because it's under-exposed.
   */
  const shownPandits = useMemo(() => {
    const relevant = results.pandits;
    if (!fairScores || relevant.length === 0) return relevant.slice(0, 6);
    const bandSize = Math.min(relevant.length, 12);
    const band = [...relevant.slice(0, bandSize)].sort((a, b) => {
      const diff = (fairScores.get(b.id) ?? -Infinity) - (fairScores.get(a.id) ?? -Infinity);
      return diff || b.score - a.score;
    });
    return band.slice(0, 6);
  }, [results.pandits, fairScores]);
  useReportExposure(shownPandits.map((p) => p.id), { enabled: shownPandits.length > 0 });

  const hasResults = results.pandits.length > 0 || results.temples.length > 0 || results.services.length > 0;
  const showSuggestions = !query.trim();

  // Helper for inline stars
  const renderStars = (rating: number) => {
    return (
      <span className="search-card__stars">
        <Icon name="star" size={12} />
        {rating.toFixed(1)}
      </span>
    );
  };

  return (
    <div className="hp-sacred-section search-page" style={{ minHeight: "100vh", position: "relative" }}>
      {/* Internal search results are not curated landing pages — noindex so
          the infinite ?q= variations never compete with the real temple/
          pandit/service pages for the same queries (master SEO prompt §52).
          Canonical points at the bare path (no query string) for the same
          reason. Still "follow" so a crawler that lands here anyway can
          still reach the real pages linked from the results. */}
      <Seo
        title="Search PanditSuggest"
        path="/search"
        noindex
      />
      <SacredBackground />

      <div className="search-page__content">
        <div className="shell">
          {/* ── Search Bar ── */}
          <div className="search-bar-wrap">
            <div className="search-bar">
              <Icon name="search" size={22} className="search-bar__icon" />
              <input
                ref={inputRef}
                type="text"
                className="search-bar__input"
                placeholder="Search pujas, pandits, temples..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button className="search-bar__clear" onClick={handleClear} aria-label="Clear search">
                  <Icon name="x" size={20} />
                </button>
              )}
            </div>
          </div>

          {/* ── Popular Searches (Empty state) ── */}
          {showSuggestions && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="search-suggestions">
              <h3 className="search-suggestions__title">Popular Searches</h3>
              <div className="search-suggestions__chips">
                {POPULAR_SEARCHES.map((term) => (
                  <button key={term} className="search-chip" onClick={() => handleChipClick(term)}>
                    <Icon name="search" size={12} />
                    {term}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Results Area ── */}
          {!showSuggestions && (
            <div className="search-results">
              
              {/* ── NLP Context & Spell Check ── */}
              {query.trim() && (results.state.didYouMean || results.state.understoodAs) && (
                <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="search-context">
                  {results.state.didYouMean && (
                    <div className="search-context__spell">
                      Did you mean: <button className="btn-link" onClick={() => handleChipClick(results.state.didYouMean!)}>"{results.state.didYouMean}"</button> ?
                    </div>
                  )}
                  {results.state.understoodAs && hasResults && (
                    <div className="search-context__intent">
                      <Icon name="sparkles" size={14} /> Showing results for: <strong>{results.state.understoodAs}</strong>
                    </div>
                  )}
                </motion.div>
              )}

              <AnimatePresence mode="popLayout">
                {/* ── Pandits ── */}
                {results.pandits.length > 0 && (
                  <motion.div
                    className="search-group"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <h2 className="search-group__title">
                      <Icon name="users" size={18} /> Pandits ({results.pandits.length})
                    </h2>
                    <div className="search-grid">
                      {shownPandits.map((p) => (
                        <Link to={`/pandits/${p.id}`} key={p.id} className="search-card">
                          <img
                            src={p.img}
                            alt={p.name}
                            className="search-card__img search-card__img--circle"
                            onError={onImgError("pandit")}
                          />
                          <div className="search-card__body">
                            <h3 className="search-card__title">
                              {p.name} {p.verified && <Icon name="check" size={14} className="search-card__verified" />}
                            </h3>
                            <p className="search-card__sub">{p.city}, {p.state}</p>
                            <div className="search-card__meta">
                              <span className={`search-card__badge tier-${p.tier.toLowerCase()}`}>{p.tier}</span>
                              {renderStars(p.rating)}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* ── Temples ── */}
                {results.temples.length > 0 && (
                  <motion.div
                    className="search-group"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: 0.05 }}
                  >
                    <h2 className="search-group__title">
                      <Icon name="temple" size={18} /> Temples ({results.temples.length})
                    </h2>
                    <div className="search-grid">
                      {results.temples.slice(0, 6).map((t) => (
                        <Link to={`/temples/${t.id}`} key={t.id} className="search-card">
                          <img
                            src={t.img}
                            alt={t.name}
                            className="search-card__img search-card__img--rounded"
                            onError={onImgError("temple")}
                          />
                          <div className="search-card__body">
                            <h3 className="search-card__title">{t.name}</h3>
                            <p className="search-card__sub">{t.city}, {t.state}</p>
                            <div className="search-card__meta">
                              <span className="search-card__badge">Deity: {t.deity}</span>
                              {renderStars(t.rating)}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* ── Services ── */}
                {results.services.length > 0 && (
                  <motion.div
                    className="search-group"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: 0.1 }}
                  >
                    <h2 className="search-group__title">
                      <Icon name="book-open" size={18} /> Pujas & Havans ({results.services.length})
                    </h2>
                    <div className="search-grid">
                      {results.services.slice(0, 6).map((s) => (
                        <Link to={`/services/${s.id}`} key={s.id} className="search-card">
                          {s.img ? (
                            <img
                              src={s.img.replace('.jpg', '_new.jpg')} // use new generated images if available
                              alt={s.name}
                              className="search-card__img search-card__img--rounded"
                              onError={(e) => { (e.target as HTMLImageElement).src = s.name.toLowerCase().includes('havan') ? '/assets/img/services/tiles/havan_new.jpg' : '/assets/img/services/tiles/puja_new.jpg'; }}
                            />
                          ) : (
                            <img
                              src={s.name.toLowerCase().includes('havan') ? '/assets/img/services/tiles/havan_new.jpg' : '/assets/img/services/tiles/puja_new.jpg'}
                              alt={s.name}
                              className="search-card__img search-card__img--rounded"
                            />
                          )}
                          <div className="search-card__body">
                            <h3 className="search-card__title">{s.name}</h3>
                            <p className="search-card__sub">{s.tag}</p>
                            <div className="search-card__meta">
                              <span className="search-card__badge">
                                <Icon name="clock" size={12} /> {s.dur}
                              </span>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>

              {/* ── No Results ── */}
              {!hasResults && query.trim() && (
                <motion.div className="search-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="search-empty__icon">
                    <Icon name="search" size={48} />
                  </div>
                  <h3>No results found for "{query}"</h3>
                  <p>Try searching for a puja, temple, or pandit by name or location.</p>
                  <button className="btn btn-outline" onClick={handleClear} style={{ marginTop: 20 }}>
                    Clear Search
                  </button>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
