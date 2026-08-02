import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../lib/icons";
import { posts } from "../data/content";
import { EmptyState } from "../components/ui/ReviewCard";
import { motion } from "framer-motion";

function PostCard({ p, featured = false, index = 0 }: { p: (typeof posts)[number]; featured?: boolean; index?: number }) {
  return (
    <motion.article
      className="card card--hover"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.45, delay: Math.min(index, 6) * 0.05 }}
    >
      <div className="post-thumb">
        <img src="/assets/img/lotus.svg" className="watermark" alt="" />
        <span className="post-cat">{p.cat}</span>
      </div>
      <div className="card-body">
        <h3 className="card-title" style={{ fontSize: featured ? "1.3rem" : "1.08rem" }}><a href="#top">{p.title}</a></h3>
        <p className="muted" style={{ marginTop: 8 }}>{p.excerpt}</p>
        <div className="card-foot">
          <span className="muted">{p.date} · {p.read} read</span>
          <a href="#top" className="row" style={{ color: "var(--gold-deep)", fontWeight: 600, fontSize: ".88rem" }}>Read <Icon name="arrow-right" size={16} /></a>
        </div>
      </div>
    </motion.article>
  );
}

export default function Blog() {
  const cats = useMemo(() => ["All", ...Array.from(new Set(posts.map((p) => p.cat)))], []);
  const [active, setActive] = useState("All");
  const [query, setQuery] = useState("");

  const list = posts.filter((p) => {
    if (active !== "All" && p.cat !== active) return false;
    if (query && !`${p.title} ${p.excerpt}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <section className="page-hero">
        <img src="/assets/img/mandala.svg" className="watermark watermark--tl" alt="" />
        <img src="/assets/img/lotus.svg" className="watermark watermark--tr" alt="" style={{ width: 220 }} />
        <div className="shell" style={{ position: "relative", zIndex: 1 }}>
          <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> <span>/</span> Blog</nav>
          <h1 className="section-title" style={{ marginTop: 10 }}>Spiritual Blog</h1>
          <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>
          <p className="section-sub">Rituals explained without mystique, festival guides you can act on, and honest notes on how this platform works.</p>

          <form className="search-row" role="search" style={{ maxWidth: 520 }} onSubmit={(e) => e.preventDefault()}>
            <label className="sr-only" htmlFor="blogSearch">Search articles</label>
            <input className="input" id="blogSearch" placeholder="Search articles" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="btn btn-gold" type="submit">Search</button>
          </form>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 38 }} id="top">
        <div className="shell">
          <div className="pill-nav" style={{ justifyContent: "center", marginBottom: 34 }}>
            {cats.map((c) => <button key={c} className={`pill${active === c ? " is-active" : ""}`} onClick={() => setActive(c)}>{c}</button>)}
          </div>
          {list.length ? (
            <>
              <PostCard p={list[0]} featured />
              <div className="grid g-3" style={{ marginTop: 28 }}>
                {list.slice(1).map((p, i) => <PostCard p={p} key={p.id} index={i} />)}
              </div>
            </>
          ) : (
            <EmptyState msg="No article matched that search." />
          )}
        </div>
      </section>

      <section className="section section--cream section--tight">
        <div className="shell">
          <div className="cta-band">
            <img src="/assets/img/mandala.svg" className="watermark watermark--br" alt="" />
            <div>
              <h2>Weekly panchang in your inbox</h2>
              <p>Festival dates, shubh muhurat and one ritual explained — every Monday morning.</p>
            </div>
            <Link className="btn btn-outline btn-lg" to="/contact">Subscribe</Link>
          </div>
        </div>
      </section>
    </>
  );
}
