import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../lib/icons";
import { temples, cities, serviceName } from "../data/content";
import { TempleCard } from "../components/ui/TempleCard";
import { EmptyState } from "../components/ui/ReviewCard";
import { Pager, paginate, countBy } from "../components/ui/Pager";
import { SacredBackground } from "../components/ui/SacredBackground";
import { HeroTicker } from "../components/ui/HeroTicker";
import { useLang } from "../lib/i18n";

const PER_PAGE = 9;

export default function Temples() {
  const { t } = useLang();
  const [params] = useSearchParams();
  const [query] = useState(params.get("q") || "");
  const [cityFilter, setCityFilter] = useState<string[]>(params.get("city") ? [params.get("city")!] : []);
  const [stateFilter] = useState<string[]>([]);
  const [svcFilter] = useState<string[]>([]);
  const [minRating] = useState("");
  const [sort, setSort] = useState("rating");
  const [page, setPage] = useState(1);

  const cityCounts = useMemo(() => countBy(temples, "city"), []);
  const usedCities = cities.filter((c) => cityCounts[c]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    let list = temples.filter((t) => {
      if (q && !`${t.name} ${t.city} ${t.state} ${t.deity}`.toLowerCase().includes(q)) return false;
      if (cityFilter.length && !cityFilter.includes(t.city)) return false;
      if (stateFilter.length && !stateFilter.includes(t.state)) return false;
      if (minRating && t.rating < parseFloat(minRating)) return false;
      if (svcFilter.length) {
        const names = t.services.map(serviceName);
        if (!svcFilter.some((s) => names.includes(s))) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "pandits") return b.pandits - a.pandits;
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "reviews") return b.reviews - a.reviews;
      return b.rating - a.rating;
    });
    return list;
  }, [query, cityFilter, stateFilter, svcFilter, minRating, sort]);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 620);
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 620);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const pg = paginate(filtered, page, isMobile ? 10 : PER_PAGE);



  return (
    <div className="hp-sacred-section" style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <SacredBackground />
      <div style={{ position: "relative", zIndex: 1 }}>

      {/* ======================== HERO ======================== */}
      <section className="sp-hero">
        <div className="shell">
          <div className="sp-hero__grid">
            <div className="sp-hero__content">
              <h1 className="sp-hero__title">
                {t("temples.heroTitle1")} <br />
                <span className="gold-text">{t("temples.heroTitleGold")}</span>
              </h1>
              <ul className="sp-hero__list">
                <li>
                  <div className="sp-hero__check"><Icon name="check" size={14} /></div>
                  {t("temples.heroCheck1")}
                </li>
                <li>
                  <div className="sp-hero__check"><Icon name="check" size={14} /></div>
                  {t("temples.heroCheck2")}
                </li>
                <li>
                  <div className="sp-hero__check"><Icon name="check" size={14} /></div>
                  {t("temples.heroCheck3", { count: temples.length })}
                </li>
              </ul>
              <div className="sp-hero__cta">
                <a href="#gridTop" className="btn btn-gold btn-lg btn-pill">
                  {t("temples.heroCta")} <Icon name="arrow-right" size={18} />
                </a>
              </div>
            </div>
            <div className="sp-hero__img-wrap">
              <img src="/assets/img/temples/temple-hero.jpg" alt="Sacred Temple" className="sp-hero__img" />
              <div className="sp-hero__glow" />
            </div>
          </div>
        </div>

        {/* Scrolling ticker */}
        <HeroTicker />
      </section>

      {/* ======================== CITY FILTER PILLS ======================== */}
      <div className="tp-filter-strip">
        <div className="shell">
          <div className="tp-filter-pills">
            <button
              className={`tp-filter-pill ${cityFilter.length === 0 ? "tp-filter-pill--active" : ""}`}
              onClick={() => { setCityFilter([]); setPage(1); }}
            >{t("temples.allCities")}</button>
            {usedCities.map((c) => (
              <button
                key={c}
                className={`tp-filter-pill ${cityFilter.includes(c) ? "tp-filter-pill--active" : ""}`}
                onClick={() => {
                  setCityFilter(cityFilter.includes(c) ? [] : [c]);
                  setPage(1);
                }}
              >{c}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ======================== RESULTS ======================== */}
      <section className="section" style={{ paddingTop: 30, paddingBottom: 50 }}>
        <div className="shell">
          <div id="gridTop" className="result-bar" style={{ marginBottom: 20 }}>
            <span><strong>{filtered.length}</strong> {filtered.length === 1 ? t("temples.temple") : t("temples.templesPlural")} {t("temples.found")}</span>
            <label className="row" style={{ gap: 8 }}>
              <span className="muted">{t("common.sortBy")}</span>
              <select className="select" style={{ width: "auto", padding: "9px 40px 9px 14px" }} value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
                <option value="rating">{t("temples.sortRating")}</option>
                <option value="reviews">{t("temples.sortReviews")}</option>
                <option value="pandits">{t("temples.sortPandits")}</option>
                <option value="name">{t("temples.sortName")}</option>
              </select>
            </label>
          </div>
          <div className="grid g-3 hp-cards-2up">
            {pg.slice.length
              ? pg.slice.map((tp, i) => <TempleCard t={tp} key={tp.id} index={i} />)
              : <EmptyState msg={t("temples.emptyState")} />}
          </div>
          <Pager page={pg.page} pages={pg.pages} onChange={(p) => { setPage(p); document.getElementById("gridTop")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
        </div>
      </section>


      </div>
    </div>
  );
}
