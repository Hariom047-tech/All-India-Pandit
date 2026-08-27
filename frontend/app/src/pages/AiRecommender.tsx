/**
 * AI Pooja Guide — the conversational entry point.
 *
 * Replaces the previous hardcoded keyword matcher (`recommendRules`), which
 * had no model, no knowledge base and no real pandit data behind it. Every
 * card rendered here comes from the backend pipeline, which only ever returns
 * services and pandits that exist in the database.
 *
 * Temples are deliberately NOT recommended. The assistant answers "which ritual
 * and which pandit ji"; where that pandit serves is stated on their own card.
 *
 * Contact actions deliberately reuse usePanditContact — the SAME flow as every
 * other pandit card on the site. The AI does not get its own contact path,
 * because qualified-lead rules (logged in, phone verified, dedup, server-side
 * revalidation) live behind that call and must not be bypassed. The AI event
 * we fire alongside is analytics only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../lib/icons";
import { usePanditContact } from "../lib/usePanditContact";
import { onImgError } from "../lib/format";
import { StarRow } from "../components/ui/StarRating";
import { Seo } from "../lib/Seo";
import { useStructuredData, organizationSchema, websiteSchema, webPageSchema, faqPageSchema, faqPageId } from "../lib/structuredData";
import {
  sendMessage, trackEvent, sendFeedback, aiStatus, clearConversation,
  type AiChatResponse, type AiPanditCard,
} from "../lib/aiApi";
import "../styles/ai-guide.css";

interface Turn {
  id: string;
  role: "user" | "ai";
  text: string;
  response?: AiChatResponse;
  error?: boolean;
}

/**
 * Starter chips: a SHORT label, a full sentence sent.
 *
 * They were full sentences on the button too, which at 341px made every chip
 * span the whole row — eight stacked rows that pushed the input far below the
 * fold. A chip is a scannable label; the sentence it sends is what the pipeline
 * actually wants, and screen readers get it through aria-label.
 */
/** Sourced by both the visible FAQ block below and its FAQPage JSON-LD —
 *  kept as one array so the two can never drift apart (master SEO prompt
 *  §10, "structured data must accurately describe visible content"). */
const AI_FAQS: { q: string; a: string }[] = [
  { q: "Is this a chatbot booking a pandit for me?", a: "No — it only suggests relevant services and Pandits. You still contact and arrange everything directly." },
  { q: "How are suggestions chosen?", a: "From PanditSuggest's own catalogue of services and Pandit profiles — nothing is invented or sourced from outside the platform." },
  { q: "Does it guarantee results from a puja?", a: "No. Traditional significance is explained honestly; no outcome is ever promised." },
];

const QUICK_PROMPTS: { label: string; prompt: string }[] = [
  { label: "Business", prompt: "Business mein rukawat aa rahi hai" },
  { label: "Naukri", prompt: "Naukri nahi mil rahi" },
  { label: "Shaadi", prompt: "Shaadi mein deri ho rahi hai" },
  { label: "Ghar ka kalesh", prompt: "Ghar mein kalesh rehta hai" },
  { label: "Court case", prompt: "Court case chal raha hai" },
  { label: "Padhai", prompt: "Bachche ka padhai mein man nahi lagta" },
  { label: "Griha Pravesh", prompt: "Griha Pravesh karna hai" },
  { label: "Baglamukhi puja", prompt: "Maa Baglamukhi puja karani hai" },
];

/**
 * Staged progress text.
 *
 * These correspond to real pipeline stages, shown on a timer only because the
 * endpoint is not streamed. They are deliberately vague about timing rather
 * than pretending to track actual progress — a fake percentage would be worse
 * than none.
 */
const STAGES = [
  "Aapki baat samajh raha hoon…",
  "Paramparagat upay dhoondh raha hoon…",
  "Available Pandit ji dekh raha hoon…",
];

export default function AiRecommender() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [voted, setVoted] = useState<Record<string, boolean>>({});
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useStructuredData([
    organizationSchema(),
    websiteSchema(),
    webPageSchema({ path: "/ai-recommender", name: "AI Pooja Guide — Which Puja Do I Need?", aboutId: faqPageId("/ai-recommender") }),
    faqPageSchema(AI_FAQS, "/ai-recommender"),
  ]);

  useEffect(() => { aiStatus().then((s) => setEnabled(s.enabled)); }, []);

  /* Advance the stage text while a turn is in flight. */
  useEffect(() => {
    if (!busy) { setStage(0); return; }
    const id = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 2600);
    return () => clearInterval(id);
  }, [busy]);

  /* Keep the newest turn visible without yanking the page on first paint. */
  useEffect(() => {
    if (!turns.length) return;
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [turns, busy]);

  const ask = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;

    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setTurns((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text: message }]);
    setBusy(true);

    try {
      const res = await sendMessage(message);
      setTurns((prev) => [...prev, {
        id: res.messageId || `a-${Date.now()}`, role: "ai", text: res.answer, response: res,
      }]);
    } catch {
      // Never a blank screen mid-conversation. The devotee still has a route
      // forward through ordinary search.
      setTurns((prev) => [...prev, {
        id: `e-${Date.now()}`,
        role: "ai",
        text: "Abhi jawab nahi aa paya. Thodi der baad try kijiye — ya seedhe Pandit ji aur puja search kar sakte hain.",
        error: true,
      }]);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  /** Grow the composer with its content, up to the CSS max-height. */
  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(input);
  }

  /* Enter sends, Shift+Enter makes a new line — the convention people expect. */
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(input);
    }
  }

  function vote(messageId: string, helpful: boolean) {
    setVoted((v) => ({ ...v, [messageId]: helpful }));
    void sendFeedback(messageId, helpful).catch(() => { /* non-blocking */ });
  }

  function reset() {
    clearConversation();
    setTurns([]);
    setVoted({});
    inputRef.current?.focus();
  }

  const started = turns.length > 0;

  return (
    <div className={`aig${started ? " aig--active" : ""}`}>
      <Seo
        title="AI Pooja Guide — Which Puja Do I Need?"
        description="Describe your situation in Hindi or English and get a traditional ritual recommendation, with the verified Pandits who perform it."
        path="/ai-recommender"
      />

      {/* aig-box is the "app" — it claims one viewport (minus header/bottom
          nav) in BOTH states, composer always the last flex child inside it,
          exactly the technique .aig--active already used successfully for
          the thread. Applying it here too means a first-time visitor sees
          the input box without scrolling past marketing copy to find it —
          the single biggest complaint about the old layout, where the
          composer sat below a full "How it works" + FAQ block. */}
      <div className="aig-box">
        {/* ── Intro, replaced by the thread once the conversation starts ── */}
        {!started && (
          <section className="aig-hero">
            <span className="aig-hero__badge"><Icon name="sparkles" size={14} /> AI Pooja Guide</span>
            <h1 className="aig-hero__title">Apni Samasya Batayein</h1>
            <p className="aig-hero__sub">
              PanditSuggest AI aapki zarurat samajhkar suitable Puja, Havan aur Pandit ji
              dhoondhne mein madad karega. Hindi, Hinglish ya English — jo aaram se aaye.
            </p>

            <ul className="aig-chips" aria-label="Common concerns">
              {QUICK_PROMPTS.map((p) => (
                <li key={p.label}>
                  <button
                    type="button" className="aig-chip" disabled={busy}
                    aria-label={p.prompt}
                    onClick={() => ask(p.prompt)}
                  >
                    {p.label}
                  </button>
                </li>
              ))}
            </ul>

            {enabled === false && (
              <p className="aig-offline">
                AI guide abhi available nahi hai. Aap{" "}
                <Link to="/pandits">Pandit ji</Link> aur <Link to="/services">puja</Link>{" "}
                seedhe search kar sakte hain.
              </p>
            )}

            <a href="#aig-explain" className="aig-learnmore">
              Yeh kaam kaise karta hai? <Icon name="arrow-right" size={12} />
            </a>
          </section>
        )}

        {/* ── Conversation ────────────────────────────────────────────── */}
        {started && (
          <div className="aig-thread" ref={threadRef} role="log" aria-live="polite" aria-label="Conversation">
            {turns.map((turn) => (
              <div key={turn.id} className={`aig-turn aig-turn--${turn.role}`}>
                {turn.role === "ai" && (
                  <span className="aig-turn__avatar" aria-hidden="true">
                    <Icon name="sparkles" size={15} />
                  </span>
                )}

                <div className="aig-turn__body">
                  <p className={`aig-bubble${turn.error ? " aig-bubble--error" : ""}`}>{turn.text}</p>

                  {turn.response && <Recommendations res={turn.response} />}

                  {turn.role === "ai" && turn.response && !turn.response.isCrisis && !turn.error && (
                    <div className="aig-vote">
                      {voted[turn.id] === undefined ? (
                        <>
                          <span>Kya yeh madadgar tha?</span>
                          <button type="button" onClick={() => vote(turn.id, true)} aria-label="Helpful">👍</button>
                          <button type="button" onClick={() => vote(turn.id, false)} aria-label="Not helpful">👎</button>
                        </>
                      ) : (
                        <span className="aig-vote__done">Dhanyavaad 🙏</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <div className="aig-turn aig-turn--ai">
                <span className="aig-turn__avatar" aria-hidden="true"><Icon name="sparkles" size={15} /></span>
                <div className="aig-turn__body">
                  <p className="aig-bubble aig-bubble--thinking">
                    <span className="aig-dots"><i /><i /><i /></span>
                    {STAGES[stage]}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Composer ────────────────────────────────────────────────── */}
        <form className="aig-composer" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="aig-input">Apni samasya likhiye</label>
          <textarea
            id="aig-input"
            ref={inputRef}
            className="aig-composer__input"
            value={input}
            rows={1}
            maxLength={1000}
            disabled={busy || enabled === false}
            placeholder="Apni samasya likhiye…"
            onChange={(e) => { setInput(e.target.value); autoGrow(e.currentTarget); }}
            onKeyDown={onKeyDown}
          />
          <button
            type="submit"
            className="aig-composer__send"
            disabled={busy || !input.trim() || enabled === false}
            aria-label="Bhejein"
          >
            <Icon name="send" size={18} />
          </button>
        </form>

        {started && (
          <button type="button" className="aig-reset" onClick={reset} disabled={busy}>
            Nayi baat shuru karein
          </button>
        )}

        <p className="aig-disclaimer">
          Yeh aadhyatmik margdarshan hai. Kisi bhi medical, kanooni ya vittiya samasya ke liye
          yogya professional ki salah zaroor lein.
        </p>
      </div>

      {/* ── Below the fold: visible explanation + FAQ, not just a bare chat
          box (master SEO prompt Parts 32-33, 125, docs/SEO_ARCHITECTURE.md
          §16) — still in the page's initial DOM for a crawler and reachable
          by scrolling, but no longer standing between a first-time visitor
          and the input box above. Gone once a conversation starts, same as
          before. */}
      {!started && (
        <section className="aig-explain" id="aig-explain">
          <div className="aig-explain__inner">
            <h2>How the AI Recommender works</h2>
            <p className="muted">
              Describe what you're looking for — a life event, a concern, or a specific ritual
              you've heard of — in your own words. The recommender matches your description
              against PanditSuggest's actual catalogue of pujas, havans and anushthans, and
              suggests the ones that are relevant, along with real Pandits and temples on the
              platform who offer them. It's a starting point for your own research and
              conversation with a pandit ji, not a substitute for either — and it never
              promises a specific outcome from any ritual.
            </p>

            <h3>Example questions people ask</h3>
            <ul className="dot-list">
              <li>"Business mein rukawat aa rahi hai" — business facing obstacles</li>
              <li>"Shaadi mein deri ho rahi hai" — marriage getting delayed</li>
              <li>"Griha Pravesh karna hai" — planning a house-warming ceremony</li>
              <li>"Maa Baglamukhi puja karani hai" — wanting a Baglamukhi puja specifically</li>
            </ul>

            <h3>Frequently asked questions</h3>
            {/* Plain, always-visible text — not a collapsible accordion — so
                what a crawler indexes via faqPageSchema() above always
                matches what a visitor actually sees on first paint, no
                interaction required (master SEO prompt Parts 32-33). */}
            <div className="aig-faqlist">
              {AI_FAQS.map((f) => (
                <div key={f.q} className="aig-faq">
                  <strong>{f.q}</strong>
                  <p>{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/* ══ Recommendation cards ═══════════════════════════════════════════════ */

function Recommendations({ res }: { res: AiChatResponse }) {
  // Temples are deliberately not rendered. The assistant suggests a ritual and
  // a pandit; where that pandit serves is already on their card. Suggesting a
  // temple the devotee never asked about read as an unrelated advert.
  const { services, pandits } = res.recommendations || { services: [], pandits: [] };
  if (!services.length && !pandits.length) return null;

  return (
    <div className="aig-recs">
      {res.locationNote && <p className="aig-note">{res.locationNote}</p>}

      {services.length > 0 && (
        <section className="aig-rec-group">
          <h3 className="aig-rec-head">Sujhai gayi seva</h3>
          <div className="aig-rec-scroll">
            {services.map((s) => (
              <Link
                key={s.id}
                to={`/services/${s.slug}`}
                className="aig-card aig-card--service"
                onClick={() => trackEvent("booking_started", { serviceId: s.id, messageId: res.messageId })}
              >
                <span className="aig-card__title">{s.name}</span>
                {s.shortDescription && <span className="aig-card__sub">{s.shortDescription}</span>}
                {s.reason && <span className="aig-card__why">{s.reason}</span>}
                <span className="aig-card__cta">Vistaar se dekhein <Icon name="arrow-right" size={13} /></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {pandits.length > 0 && (
        <section className="aig-rec-group">
          <h3 className="aig-rec-head">Recommended Pandit ji</h3>
          <div className="aig-pandits">
            {pandits.map((p, i) => (
              <AiPandit key={p.panditId} p={p} index={i} messageId={res.messageId} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AiPandit({ p, index, messageId }: { p: AiPanditCard; index: number; messageId?: string }) {
  // The shared contact hook. Everything about qualified leads — auth, phone
  // verification, dedup, server-side revalidation — happens behind this call,
  // exactly as it does on the pandits listing. The AI does not get a shortcut.
  const { contact, isPending } = usePanditContact();

  function reach(action: "whatsapp" | "call") {
    trackEvent(action === "call" ? "call_clicked" : "whatsapp_clicked",
      { panditId: p.panditId, messageId, position: index });
    contact({
      panditSlug: p.slug,
      action,
      phone: undefined,          // resolved server-side; never rendered client-side
      whatsapp: undefined,
      waMessage: `Namaste ${p.name}, maine PanditSuggest AI par aapka profile dekha. Puja ke baare mein baat karni thi.`,
      source: "ai_guide",
    });
  }

  return (
    <article className="aig-pandit">
      <Link
        to={`/pandits/${p.slug}`}
        className="aig-pandit__main"
        onClick={() => trackEvent("pandit_profile_opened", { panditId: p.panditId, messageId, position: index })}
      >
        <img
          src={p.photoUrl || "/assets/img/pandit-placeholder.svg"}
          alt=""
          className="aig-pandit__photo"
          loading="lazy"
          onError={onImgError("pandit")}
        />
        <div className="aig-pandit__info">
          <div className="aig-pandit__namerow">
            <strong>{p.name}</strong>
            {p.verified && <span className="aig-verified" title="Verified"><Icon name="check" size={11} /></span>}
          </div>

          <span className="aig-match">{p.matchLabel}</span>

          {/* Only shown when there is something real to show — a "0.0 (0)" row
              on a new pandit reads as a bad rating rather than no data. */}
          {p.reviewCount > 0 && (
            <span className="aig-pandit__rating">
              <StarRow rating={p.rating} size={13} />
              <span className="muted">{p.rating.toFixed(1)} ({p.reviewCount})</span>
            </span>
          )}

          <span className="aig-pandit__meta">
            {[p.city, p.experienceYears ? `${p.experienceYears} saal anubhav` : null]
              .filter(Boolean).join(" · ")}
          </span>

          <span className="aig-pandit__why">{p.reason}</span>
        </div>
      </Link>

      {/* isPending is a PREDICATE, not a boolean — `disabled={isPending}` would
          be permanently truthy and both buttons would never be clickable. It
          takes the slug and action so only the button actually in flight
          disables, which is also what the rest of the site does. */}
      <div className="aig-pandit__actions">
        <button
          type="button" className="btn btn-gold btn-sm"
          disabled={isPending(p.slug, "whatsapp")}
          onClick={() => reach("whatsapp")}
        >
          <Icon name="whatsapp" size={15} /> WhatsApp
        </button>
        <button
          type="button" className="btn btn-outline btn-sm"
          disabled={isPending(p.slug, "call")}
          onClick={() => reach("call")}
        >
          <Icon name="phone" size={15} /> Call
        </button>
      </div>
    </article>
  );
}
