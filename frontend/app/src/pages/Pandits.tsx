import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../lib/icons";
import { usePandits, useServices, usePublicSettings } from "../hooks/useData";
import { normPandits, normServices } from "../lib/normalize";
import { useFairRanking, useReportExposure } from "../lib/api";
import { useLang } from "../lib/i18n";
import { PanditCard } from "../components/ui/PanditCard";
import { EmptyState } from "../components/ui/ReviewCard";

import { Pager, paginate, countBy } from "../components/ui/Pager";
import { CheckboxGroup, RadioGroup } from "../components/ui/CheckboxGroup";
import { StarRow } from "../components/ui/StarRating";
import { SacredBackground } from "../components/ui/SacredBackground";
import { HeroTicker } from "../components/ui/HeroTicker";
import { Seo } from "../lib/Seo";

// Falls back to this while /settings hasn't loaded yet or the admin has
// never set pandits_per_page — matches the backend's own default.
const DEFAULT_PER_PAGE = 30;

export default function Pandits() {
  const { t } = useLang();
  const [params] = useSearchParams();
  const preSvc = params.get("service") || "";
  const [query, setQuery] = useState(params.get("q") || "");
  const [cityFilter, setCityFilter] = useState<string[]>([]);
  const [svcFilter, setSvcFilter] = useState<string[]>(preSvc ? [preSvc] : []);
  const [langFilter, setLangFilter] = useState<string[]>([]);
  const [minExp, setMinExp] = useState("");
  const [minRating, setMinRating] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const fairScores = useFairRanking();

  /* ── Fetch data from API ── */
  // 600, not 100: "limit" was never a param the API recognized (silently
  // ignored, falling back to a 12-row default) — this directory needs to
  // cover a temple the size of Nalkheda (500 associated pandits) in one
  // batch, since filtering/sorting happens client-side over what's fetched.
  const { data: rawPandits } = usePandits({ perPage: 600 });
  const { data: rawSvcs } = useServices();
  const { data: publicSettings } = usePublicSettings();
  const pandits = useMemo(() => normPandits(rawPandits), [rawPandits]);
  const allServices = useMemo(() => normServices(rawSvcs), [rawSvcs]);
  const perPage = publicSettings?.pandits_per_page || DEFAULT_PER_PAGE;

  // filter drawer (off-canvas at every width): lock body scroll and close on Escape while open
  useEffect(() => {
    document.body.style.overflow = filtersOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [filtersOpen]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const cityCounts = useMemo(() => countBy(pandits, "city"), [pandits]);
  const usedCities = useMemo(() => {
    const allCities = [...new Set(pandits.map(p => p.city))].sort();
    return allCities.filter(c => cityCounts[c]);
  }, [pandits, cityCounts]);
  const svcUsed = useMemo(() => allServices.filter(s => pandits.some(p => p.services.includes(s.id))), [allServices, pandits]);
  // Arriving from a service page's "See all N pandits" link (?service=slug)
  // should read as "Pandits who perform Rudrabhishek", not the generic
  // directory heading — otherwise the destination looks like an unfiltered
  // "all pandits" page even though the list itself is correctly filtered.
  const preSvcName = useMemo(() => allServices.find((sv) => sv.id === preSvc)?.name, [allServices, preSvc]);
  const usedLangs = useMemo(() => {
    const langs = new Set<string>();
    pandits.forEach(p => p.langs.forEach(l => langs.add(l)));
    return [...langs].sort();
  }, [pandits]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    let list = pandits.filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.nameHi || ""} ${p.city} ${p.state} ${p.langs.join(" ")} ${p.services.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (cityFilter.length && !cityFilter.includes(p.city)) return false;
      if (svcFilter.length && !svcFilter.some((s) => p.services.includes(s))) return false;
      if (langFilter.length && !langFilter.some((l) => p.langs.includes(l))) return false;
      if (minExp && p.exp < parseInt(minExp, 10)) return false;
      if (minRating && p.rating < parseFloat(minRating)) return false;
      if (verifiedOnly && !p.verified) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (fairScores) {
        const diff = (fairScores.get(b.id) ?? -Infinity) - (fairScores.get(a.id) ?? -Infinity);
        if (diff) return diff;
      }
      return b.rating - a.rating;
    });
    return list;
  }, [pandits, query, cityFilter, svcFilter, langFilter, minExp, minRating, verifiedOnly, fairScores]);

  const pg = paginate(filtered, page, perPage);

  /* Exposure: only the cards on the current page, in the order shown. Not the
     whole filtered set — a pandit on page 4 was not seen. This is what lets the
     engine tell "shown and ignored" apart from "never shown", which is the
     difference the whole fairness correction rests on. */
  useReportExposure(pg.slice.map((p) => p.id), { enabled: true });

  function toggle(list: string[], setter: (v: string[]) => void, value: string) {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
    setPage(1);
  }

  function clearAll() {
    setCityFilter([]); setSvcFilter([]); setLangFilter([]);
    setMinExp(""); setMinRating(""); setVerifiedOnly(false);
    setQuery(""); setPage(1);
  }

  const activeFilterCount = cityFilter.length + svcFilter.length + langFilter.length + (minExp ? 1 : 0) + (minRating ? 1 : 0);

  return (
    <div className="hp-sacred-section" style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <Seo
        title="Find a Pandit — Verified Profiles Across India"
        description="Search verified Pandits by city, service and language. Compare profiles, ratings and experience, then contact directly on WhatsApp or call — no middleman, no commission."
        path="/pandits"
      />
      <SacredBackground />
      {/* the filters drawer is position:fixed with a high z-index, but this
          wrapper's own z-index:1 stacking context otherwise traps it below
          the sticky site header (z-index 90) — lift the whole subtree above
          the header only while the drawer is open */}
      <div style={{ position: "relative", zIndex: filtersOpen ? 140 : 1 }}>
      <section className="sp-hero">
        <div className="shell">
          <div className="sp-hero__grid">
            <div className="sp-hero__content">
              <h1 className="sp-hero__title">
                {preSvcName ? (
                  <>Pandits who perform <span className="gold-text">{preSvcName}</span></>
                ) : (
                  <>{t("pandits.heroTitle1")} <br />
                    <span className="gold-text">{t("pandits.heroTitleGold")}</span></>
                )}
              </h1>
              <ul className="sp-hero__list">
                <li>
                  <div className="sp-hero__check"><Icon name="check" size={14} /></div>
                  {t("pandits.heroCheck1")}
                </li>
                <li>
                  <div className="sp-hero__check"><Icon name="check" size={14} /></div>
                  {t("pandits.heroCheck2")}
                </li>
                <li>
                  <div className="sp-hero__check"><Icon name="check" size={14} /></div>
                  {t("pandits.heroCheck3")}
                </li>
              </ul>
              <div className="sp-hero__cta">
                <a href="#panditGrid" className="btn btn-gold btn-lg btn-pill">
                  {t("pandits.heroCta")} <Icon name="arrow-right" size={18} />
                </a>
              </div>
            </div>
            <div className="sp-hero__img-wrap">
              <img src="/assets/img/services/pandit-hero.jpg" alt="Verified Pandit" className="sp-hero__img" />
              <div className="sp-hero__glow" />
            </div>
          </div>
        </div>

        {/* Scrolling ticker */}
        <HeroTicker />
      </section>

      <section className="section" style={{ paddingTop: 44 }}>
        <div className="shell layout-side">
          {filtersOpen && <div className="filters-scrim is-open" onClick={() => setFiltersOpen(false)} />}
          <aside className={`filters${filtersOpen ? " is-open" : ""}`} aria-label="Filters">
            <div className="row-between">
              <h3 style={{ fontSize: "1.16rem" }}><Icon name="sliders" size={19} /> {t("pandits.filtersTitle")}</h3>
              <div className="row" style={{ gap: 14 }}>
                <button className="filter-clear" onClick={clearAll}>{t("common.clearAll")}</button>
                <button className="filters-close" aria-label="Close filters" onClick={() => setFiltersOpen(false)}>
                  <Icon name="x" size={19} />
                </button>
              </div>
            </div>
            <div className="filter-group" style={{ marginTop: 18 }}>
              <h4>{t("pandits.city")}</h4>
              <CheckboxGroup values={usedCities} counts={cityCounts} selected={cityFilter} onToggle={(v) => toggle(cityFilter, setCityFilter, v)} />
            </div>
            <div className="filter-group">
              <h4>{t("pandits.service")}</h4>
              <div style={{ maxHeight: 230, overflowY: "auto", paddingRight: 4 }}>
                {svcUsed.map((s) => (
                  <label className="check" key={s.id}>
                    <input type="checkbox" checked={svcFilter.includes(s.id)} onChange={() => toggle(svcFilter, setSvcFilter, s.id)} />
                    <span>{s.name}</span>
                    <span className="check-count">({pandits.filter((p) => p.services.includes(s.id)).length})</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <h4>{t("pandits.languageFilter")}</h4>
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                <CheckboxGroup values={usedLangs} selected={langFilter} onToggle={(v) => toggle(langFilter, setLangFilter, v)} />
              </div>
            </div>
            <div className="filter-group">
              <h4>{t("pandits.experience")}</h4>
              <RadioGroup
                name="exp"
                value={minExp}
                onChange={(v) => { setMinExp(v); setPage(1); }}
                options={[20, 15, 10, 5].map((y) => ({ value: String(y), count: pandits.filter((p) => p.exp >= y).length }))}
                render={(v) => <span>{v}{t("pandits.yearsPlus")}</span>}
              />
            </div>
            <div className="filter-group">
              <h4>{t("pandits.ratingFilter")}</h4>
              <RadioGroup
                name="rating"
                value={minRating}
                onChange={(v) => { setMinRating(v); setPage(1); }}
                options={[4.8, 4.7, 4.5].map((r) => ({ value: String(r), count: pandits.filter((p) => p.rating >= r).length }))}
                render={(v) => <StarRow rating={parseFloat(v)} />}
              />
            </div>
            <div className="filter-group">
              <label className="check">
                <input type="checkbox" checked={verifiedOnly} onChange={(e) => { setVerifiedOnly(e.target.checked); setPage(1); }} />
                <span>{t("pandits.verifiedOnly")}</span>
              </label>
            </div>
            <button className="btn btn-gold btn-block filters-apply" onClick={() => setFiltersOpen(false)}>
              {t("pandits.showResults", { count: filtered.length })}
            </button>
          </aside>

          <div id="gridTop">
            <div className="result-bar">
              <span><strong>{filtered.length}</strong> {filtered.length === 1 ? t("pandits.pandit") : t("pandits.panditsPlural")} {t("pandits.available")}</span>
              <div className="row" style={{ gap: 10 }}>
                <button className="filters-toggle" onClick={() => setFiltersOpen(true)}>
                  <Icon name="sliders" size={16} /> {t("common.filters")}
                  {activeFilterCount > 0 && <span className="filters-toggle__badge">{activeFilterCount}</span>}
                </button>
              </div>
            </div>
            <div className="grid g-4 pandit-results-grid grid-2up-mobile">
              {pg.slice.length
                ? pg.slice.map((p, i) => <PanditCard p={p} key={p.id} index={i} sourceSurface="pandit_directory" />)
                : <EmptyState msg={t("pandits.emptyState")} />}
            </div>
            <Pager page={pg.page} pages={pg.pages} onChange={(p) => { setPage(p); document.getElementById("gridTop")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
          </div>
        </div>
      </section>

      </div>
    </div>
  );
}
