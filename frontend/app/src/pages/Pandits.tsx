import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../lib/icons";
import { pandits, cities, languages, services, panditsForService, serviceName } from "../data/content";
import { useFairRanking } from "../lib/api";
import { useLang } from "../lib/i18n";
import { PanditCard } from "../components/ui/PanditCard";
import { EmptyState } from "../components/ui/ReviewCard";
import { Pager, paginate, countBy } from "../components/ui/Pager";
import { CheckboxGroup, RadioGroup } from "../components/ui/CheckboxGroup";
import { StarRow } from "../components/ui/StarRating";
import { SacredBackground } from "../components/ui/SacredBackground";
import { HeroTicker } from "../components/ui/HeroTicker";

const PER_PAGE = 12;

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
  const [sort, setSort] = useState("recommended");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const fairScores = useFairRanking();

  // mobile filter drawer: lock body scroll and close on Escape while open
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

  const cityCounts = useMemo(() => countBy(pandits, "city"), []);
  const usedCities = cities.filter((c) => cityCounts[c]);
  const svcUsed = useMemo(() => services.filter((s) => panditsForService(s.id).length), []);
  const usedLangs = languages.filter((l) => pandits.some((p) => p.langs.includes(l)));

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    let list = pandits.filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.nameHi || ""} ${p.city} ${p.state} ${p.langs.join(" ")} ${p.services.map(serviceName).join(" ")}`.toLowerCase();
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
      if (sort === "exp") return b.exp - a.exp;
      if (sort === "reviews") return b.reviews - a.reviews;
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "recommended" && fairScores) {
        const diff = (fairScores.get(b.id) ?? -Infinity) - (fairScores.get(a.id) ?? -Infinity);
        if (diff) return diff;
      }
      return b.rating - a.rating;
    });
    return list;
  }, [query, cityFilter, svcFilter, langFilter, minExp, minRating, verifiedOnly, sort, fairScores]);

  const pg = paginate(filtered, page, PER_PAGE);

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
      <SacredBackground />
      {/* the mobile filters drawer is position:fixed with a high z-index, but
          this wrapper's own z-index:1 stacking context otherwise traps it
          below the sticky site header (z-index 90) — lift the whole
          subtree above the header only while the drawer is open */}
      <div style={{ position: "relative", zIndex: filtersOpen ? 140 : 1 }}>
      <section className="sp-hero">
        <div className="shell">
          <div className="sp-hero__grid">
            <div className="sp-hero__content">
              <h1 className="sp-hero__title">
                {t("pandits.heroTitle1")} <br />
                <span className="gold-text">{t("pandits.heroTitleGold")}</span>
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
                    <span className="check-count">({panditsForService(s.id).length})</span>
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
                <label className="row" style={{ gap: 8 }}>
                  <span className="muted">{t("common.sortBy")}</span>
                  <select className="select" style={{ width: "auto", padding: "9px 40px 9px 14px" }} value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
                    <option value="recommended">{t("pandits.sortRecommended")}</option>
                    <option value="rating">{t("pandits.sortRating")}</option>
                    <option value="exp">{t("pandits.sortExp")}</option>
                    <option value="reviews">{t("pandits.sortReviews")}</option>
                    <option value="name">{t("pandits.sortName")}</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="grid g-3 grid-2up-mobile">
              {pg.slice.length
                ? pg.slice.map((p, i) => <PanditCard p={p} key={p.id} index={i} />)
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
