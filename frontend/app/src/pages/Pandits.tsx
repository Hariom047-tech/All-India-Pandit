import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../lib/icons";
import { pandits, cities, languages, services, panditsForService, serviceName } from "../data/content";
import { PanditCard } from "../components/ui/PanditCard";
import { EmptyState } from "../components/ui/ReviewCard";
import { Pager, paginate, countBy } from "../components/ui/Pager";
import { CheckboxGroup, RadioGroup } from "../components/ui/CheckboxGroup";
import { StarRow } from "../components/ui/StarRating";
import { SacredBackground } from "../components/ui/SacredBackground";
import { HeroTicker } from "../components/ui/HeroTicker";

const PER_PAGE = 8;

export default function Pandits() {
  const [params] = useSearchParams();
  const preSvc = params.get("service") || "";
  const [query, setQuery] = useState(params.get("q") || "");
  const [cityFilter, setCityFilter] = useState<string[]>([]);
  const [svcFilter, setSvcFilter] = useState<string[]>(preSvc ? [preSvc] : []);
  const [langFilter, setLangFilter] = useState<string[]>([]);
  const [minExp, setMinExp] = useState("");
  const [minRating, setMinRating] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [sort, setSort] = useState("rating");
  const [page, setPage] = useState(1);

  const cityCounts = useMemo(() => countBy(pandits, "city"), []);
  const usedCities = cities.filter((c) => cityCounts[c]);
  const svcUsed = useMemo(() => services.filter((s) => panditsForService(s.id).length), []);
  const usedLangs = languages.filter((l) => pandits.some((p) => p.langs.includes(l)));

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    let list = pandits.filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.city} ${p.state} ${p.langs.join(" ")} ${p.services.map(serviceName).join(" ")}`.toLowerCase();
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
      return b.rating - a.rating;
    });
    return list;
  }, [query, cityFilter, svcFilter, langFilter, minExp, minRating, verifiedOnly, sort]);

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

  return (
    <div className="hp-sacred-section" style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <SacredBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
      <section className="sp-hero">
        <div className="shell">
          <div className="sp-hero__grid">
            <div className="sp-hero__content">
              <h1 className="sp-hero__title">
                Your trusted <br />
                <span className="gold-text">pandit connection</span>
              </h1>
              <ul className="sp-hero__list">
                <li>
                  <div className="sp-hero__check"><Icon name="check" size={14} /></div>
                  Talk directly — No middlemen, 100% Dakshina goes to Pandit ji
                </li>
                <li>
                  <div className="sp-hero__check"><Icon name="check" size={14} /></div>
                  Every pandit is verified — Video KYC & Vedic qualification audits
                </li>
                <li>
                  <div className="sp-hero__check"><Icon name="check" size={14} /></div>
                  500+ experienced pandits across 60+ cities, available for all rituals
                </li>
              </ul>
              <div className="sp-hero__cta">
                <a href="#panditGrid" className="btn btn-gold btn-lg btn-pill">
                  Find a Pandit <Icon name="arrow-right" size={18} />
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
          <aside className="filters" aria-label="Filters">
            <div className="row-between">
              <h3 style={{ fontSize: "1.16rem" }}><Icon name="sliders" size={19} /> Filters</h3>
              <button className="filter-clear" onClick={clearAll}>Clear all</button>
            </div>
            <div className="filter-group" style={{ marginTop: 18 }}>
              <h4>City</h4>
              <CheckboxGroup values={usedCities} counts={cityCounts} selected={cityFilter} onToggle={(v) => toggle(cityFilter, setCityFilter, v)} />
            </div>
            <div className="filter-group">
              <h4>Service</h4>
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
              <h4>Language</h4>
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                <CheckboxGroup values={usedLangs} selected={langFilter} onToggle={(v) => toggle(langFilter, setLangFilter, v)} />
              </div>
            </div>
            <div className="filter-group">
              <h4>Experience</h4>
              <RadioGroup
                name="exp"
                value={minExp}
                onChange={(v) => { setMinExp(v); setPage(1); }}
                options={[20, 15, 10, 5].map((y) => ({ value: String(y), count: pandits.filter((p) => p.exp >= y).length }))}
                render={(v) => <span>{v}+ years</span>}
              />
            </div>
            <div className="filter-group">
              <h4>Rating</h4>
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
                <span>Verified only</span>
              </label>
            </div>
          </aside>

          <div id="gridTop">
            <div className="result-bar">
              <span><strong>{filtered.length}</strong> pandit{filtered.length === 1 ? "" : "s"} available</span>
              <label className="row" style={{ gap: 8 }}>
                <span className="muted">Sort by</span>
                <select className="select" style={{ width: "auto", padding: "9px 40px 9px 14px" }} value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
                  <option value="rating">Highest rated</option>
                  <option value="exp">Most experienced</option>
                  <option value="reviews">Most reviewed</option>
                  <option value="name">Name (A–Z)</option>
                </select>
              </label>
            </div>
            <div className="grid g-3">
              {pg.slice.length
                ? pg.slice.map((p, i) => <PanditCard p={p} key={p.id} index={i} />)
                : <EmptyState msg="No pandit matched all filters. Try widening the language or service filter." />}
            </div>
            <Pager page={pg.page} pages={pg.pages} onChange={(p) => { setPage(p); document.getElementById("gridTop")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
          </div>
        </div>
      </section>

      <section className="section section--cream section--tight">
        <div className="shell">
          <div className="cta-band">
            <img src="/assets/img/mandala.svg" className="watermark watermark--br" alt="" />
            <div>
              <h2>Aap Pandit ji hain?</h2>
              <p>List your profile free — forever. Keep 100% of your dakshina. We only charge for optional extra visibility.</p>
            </div>
            <Link className="btn btn-outline btn-lg" to="/dashboard">Create your profile</Link>
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}
