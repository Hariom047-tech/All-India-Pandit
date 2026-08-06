import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../lib/icons";
import { serviceEmoji } from "../lib/serviceEmoji";
import { recommendRules, service, panditsForService, panditDisplayName } from "../data/content";
import { onImgError } from "../lib/format";
import { useLang, type Lang } from "../lib/i18n";

interface Bubble {
  id: number;
  who: "ai" | "me";
  content: ReactNode;
  typing?: boolean;
}

const PROMPTS = [
  "Naya ghar liya hai", "Shaadi ki taiyari hai", "Ghar mein bimari chal rahi hai",
  "Business mein rukavat hai", "Bachche ka mundan karana hai", "Pitaji ka shradh karna hai",
  "Kundali mein Shani dosh hai", "Navratri ki puja karani hai",
];

function recommend(text: string, lang: Lang): ReactNode {
  const q = text.toLowerCase();
  const hits = recommendRules.filter((r) => r.keys.some((k) => q.includes(k)));

  if (!hits.length) {
    return (
      <>
        <h4>Let me narrow it down</h4>
        <p>I could not match that to a specific ritual yet. Tell me a little more — is it about a <strong>new home</strong>, a <strong>marriage</strong>, <strong>health</strong>, <strong>business</strong>, a <strong>child's ceremony</strong>, <strong>ancestors</strong>, or <strong>planetary trouble</strong>?</p>
        <p style={{ marginTop: 10 }}>Or browse the <Link to="/services" style={{ color: "var(--gold-deep)", fontWeight: 600 }}>full service list</Link>.</p>
      </>
    );
  }

  const svcIds: string[] = [];
  hits.forEach((h) => h.svc.forEach((s) => { if (!svcIds.includes(s)) svcIds.push(s); }));
  const top4 = svcIds.slice(0, 4);
  const topPandits = panditsForService(top4[0]).slice(0, 2);

  return (
    <>
      <h4>Suggested for your situation</h4>
      <p style={{ marginBottom: 12 }}>{hits[0].why}</p>
      <div className="stack" style={{ gap: 10 }}>
        {top4.map((id) => {
          const s = service(id)!;
          return (
            <Link key={id} to={`/services/${id}`} style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: "var(--ivory)" }}>
              <span className="svc-ico--emoji" style={{ width: 44, height: 44, borderRadius: 14, fontSize: "1.3rem", margin: 0, flex: "none" }} role="img" aria-label={s.name}>{serviceEmoji(s.icon)}</span>
              <span><strong style={{ fontFamily: "var(--font-head)", fontSize: ".95rem" }}>{s.name}</strong><span className="muted" style={{ display: "block", fontSize: ".82rem" }}>{s.tag} · {s.dur}</span></span>
              <span style={{ marginLeft: "auto", color: "var(--gold)" }}><Icon name="chevron-right" size={18} /></span>
            </Link>
          );
        })}
      </div>
      {topPandits.length > 0 && (
        <>
          <p style={{ margin: "14px 0 8px" }}><strong>Pandits who perform this:</strong></p>
          <div className="stack" style={{ gap: 8 }}>
            {topPandits.map((p) => (
              <span className="row" style={{ gap: 10 }} key={p.id}>
                <span className="avatar-ring" style={{ width: 38, height: 38, padding: 2 }}>
                  <img src={p.img} alt="" onError={onImgError("pandit")} />
                </span>
                <Link to={`/pandits/${p.id}`} style={{ fontWeight: 600, fontSize: ".92rem", color: "var(--gold-deep)" }}>{panditDisplayName(p, lang)}</Link>
                <span className="muted" style={{ fontSize: ".82rem" }}>{p.city} · {p.exp}y</span>
              </span>
            ))}
          </div>
        </>
      )}
      <p className="muted" style={{ marginTop: 14, fontSize: ".82rem" }}>
        <Icon name="info" size={13} /> A suggestion, not a verdict. A pandit ji will confirm what your situation actually calls for.
      </p>
    </>
  );
}

export default function AiRecommender() {
  const { lang } = useLang();
  const [bubbles, setBubbles] = useState<Bubble[]>([
    {
      id: 0,
      who: "ai",
      content: (
        <>
          <h4>Namaste 🙏</h4>
          <p>Tell me what is going on and I will suggest which pooja or havan is traditionally recommended — in your own words, Hindi or English.</p>
          <p className="muted" style={{ marginTop: 8, fontSize: ".84rem" }}>For example: <em>"naya flat liya hai, kya karna chahiye?"</em></p>
        </>
      ),
    },
  ]);
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [bubbles]);

  function ask(text: string) {
    if (!text.trim()) return;
    const meId = Date.now();
    const typingId = meId + 1;
    setBubbles((prev) => [...prev, { id: meId, who: "me", content: text }, { id: typingId, who: "ai", content: null, typing: true }]);
    setTimeout(() => {
      setBubbles((prev) => prev.map((b) => (b.id === typingId ? { ...b, content: recommend(text, lang), typing: false } : b)));
    }, 620);
  }

  return (
    <>
      <section className="page-hero">
        <img src="/assets/img/mandala.svg" className="watermark watermark--tl" alt="" />
        <img src="/assets/img/lotus.svg" className="watermark watermark--br" alt="" style={{ width: 220 }} />
        <div className="shell" style={{ position: "relative", zIndex: 1 }}>
          <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> <span>/</span> Pooja Guide</nav>
          <h1 className="section-title" style={{ marginTop: 10 }}>Which Pooja Do I Need?</h1>
          <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>
          <p className="section-sub">Apni baat apne shabdon mein likhiye — Hindi ya English. We suggest the ritual, you decide with a pandit ji.</p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="shell" style={{ maxWidth: 860 }}>
          <div className="chat">
            <div className="chat-head">
              <span style={{ color: "var(--gold)" }}><Icon name="sparkles" size={26} /></span>
              <div>
                <strong style={{ fontFamily: "var(--font-head)" }}>Pooja Guide</strong>
                <span className="muted" style={{ display: "block", fontSize: ".8rem" }}>Rule-based suggestions · runs entirely in your browser</span>
              </div>
            </div>

            <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-label="Conversation">
              {bubbles.map((b) => (
                <div className={`bubble bubble--${b.who}`} key={b.id}>
                  {b.typing ? (
                    <span className="typing"><i /><i /><i /></span>
                  ) : b.who === "me" ? String(b.content) : b.content}
                </div>
              ))}
            </div>

            <div className="chip-row">
              {PROMPTS.map((p) => <button key={p} className="chip" type="button" onClick={() => ask(p)}>{p}</button>)}
            </div>

            <form className="chat-form" onSubmit={(e) => { e.preventDefault(); ask(input); setInput(""); }}>
              <label className="sr-only" htmlFor="chatInput">Describe your situation</label>
              <input className="input" id="chatInput" placeholder="e.g. naya ghar liya hai, kya pooja karani chahiye?" autoComplete="off" value={input} onChange={(e) => setInput(e.target.value)} />
              <button className="btn btn-gold" type="submit" aria-label="Send"><Icon name="send" size={18} /> Ask</button>
            </form>
          </div>

          <div className="usp-band" style={{ marginTop: 26 }}>
            <p className="muted" style={{ margin: 0 }}>
              <strong style={{ fontFamily: "var(--font-head)", color: "var(--text)" }}>How this works, honestly:</strong>{" "}
              this guide matches keywords in what you type against a curated table of rituals maintained with our senior pandits.
              It is not a horoscope reading and it does not send your words anywhere — everything runs locally in your browser.
              Treat it as a starting point, then confirm with a pandit ji who can look at your kundali and family tradition.
            </p>
          </div>

          <div className="grid g-3" style={{ marginTop: 30 }}>
            <Link className="card card-pad card--hover text-c" to="/services">
              <span style={{ color: "var(--gold)" }}><Icon name="diya" size={34} /></span>
              <h3 style={{ fontSize: "1.05rem", marginTop: 10 }}>Browse all services</h3>
            </Link>
            <Link className="card card-pad card--hover text-c" to="/panchang">
              <span style={{ color: "var(--gold)" }}><Icon name="calendar" size={34} /></span>
              <h3 style={{ fontSize: "1.05rem", marginTop: 10 }}>Find the shubh muhurat</h3>
            </Link>
            <Link className="card card-pad card--hover text-c" to="/pandits">
              <span style={{ color: "var(--gold)" }}><Icon name="users" size={34} /></span>
              <h3 style={{ fontSize: "1.05rem", marginTop: 10 }}>Talk to a pandit ji</h3>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
