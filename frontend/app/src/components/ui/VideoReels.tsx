import { useEffect, useRef, useState, useCallback } from "react";
import "../../styles/video-reels.css";

export interface ReelVideo {
  id: string;
  url: string;
  title?: string | null;
  caption?: string | null;
  poster?: string | null;
}

/**
 * Vertical (9:16) video reels, in the shape shoppers already know from
 * Flipkart / Amazon review videos.
 *
 * Layout by breakpoint, driven entirely by CSS scroll-snap rather than JS
 * measurement — resizing and zooming stay correct for free:
 *   mobile  — one reel per screen, swipe horizontally
 *   tablet  — two visible, third peeking to signal scrollability
 *   desktop — three visible, with arrow buttons
 *
 * Autoplay rules follow what browsers actually permit: muted + playsInline,
 * and only the reel currently centred plays. Everything else pauses, so a
 * profile with four videos never plays four soundtracks at once or burns the
 * visitor's mobile data.
 */
export function VideoReels({ videos, panditName }: { videos: ReelVideo[]; panditName: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mutedAll, setMutedAll] = useState(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const syncArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  // Which reel is centred? IntersectionObserver against the track, not the
  // viewport, so it works while the page itself is scrolled anywhere.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const idx = Number((entry.target as HTMLElement).dataset.index);
          if (!Number.isNaN(idx)) setActiveIndex(idx);
        });
      },
      { root: el, threshold: 0.6 },
    );

    Array.from(el.children).forEach((child) => observer.observe(child));
    syncArrows();
    el.addEventListener("scroll", syncArrows, { passive: true });
    window.addEventListener("resize", syncArrows);
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", syncArrows);
      window.removeEventListener("resize", syncArrows);
    };
  }, [videos.length, syncArrows]);

  // Only the active reel plays.
  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === activeIndex) {
        // play() rejects when the tab is backgrounded or autoplay is blocked;
        // that is expected, and the poster simply stays visible.
        v.play().catch(() => {});
      } else {
        v.pause();
        v.currentTime = 0;
      }
    });
  }, [activeIndex, videos.length]);

  // Pause everything once the section leaves the viewport — a video playing
  // silently three screens up is pure wasted bandwidth.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (!entry.isIntersecting) videoRefs.current.forEach((v) => v?.pause()); },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(".reel");
    const step = card ? card.offsetWidth + 14 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  if (!videos.length) return null;

  return (
    <section className="reels" aria-label={`Videos by ${panditName}`}>
      <header className="reels__head">
        <h2 className="reels__title">
          Video introduction
          <span className="reels__count">{videos.length}</span>
        </h2>
        <div className="reels__controls">
          <button
            type="button" className="reels__sound"
            onClick={() => setMutedAll((m) => !m)}
            aria-pressed={!mutedAll}
            aria-label={mutedAll ? "Awaaz on karein" : "Awaaz band karein"}
          >
            {mutedAll ? "🔇 Unmute" : "🔊 Mute"}
          </button>
          <div className="reels__arrows">
            <button
              type="button" className="reels__arrow" onClick={() => scrollBy(-1)}
              disabled={!canScrollLeft} aria-label="Pichla video"
            >‹</button>
            <button
              type="button" className="reels__arrow" onClick={() => scrollBy(1)}
              disabled={!canScrollRight} aria-label="Agla video"
            >›</button>
          </div>
        </div>
      </header>

      <div className="reels__track" ref={trackRef} tabIndex={0}>
        {videos.map((v, i) => (
          <article className="reel" key={v.id} data-index={i}>
            <video
              ref={(el) => { videoRefs.current[i] = el; }}
              src={v.url}
              poster={v.poster || undefined}
              muted={mutedAll}
              loop
              playsInline
              preload={i === 0 ? "auto" : "metadata"}
              controls={false}
              className="reel__video"
              onClick={(e) => {
                const el = e.currentTarget;
                if (el.paused) { setActiveIndex(i); el.play().catch(() => {}); }
                else el.pause();
              }}
            />
            <div className="reel__scrim" aria-hidden="true" />
            {(v.title || v.caption) && (
              <div className="reel__meta">
                {v.title && <strong>{v.title}</strong>}
                {v.caption && <span>{v.caption}</span>}
              </div>
            )}
            {i === activeIndex && <span className="reel__live" aria-hidden="true" />}
          </article>
        ))}
      </div>

      {videos.length > 1 && (
        <div className="reels__dots" role="tablist" aria-label="Video select karein">
          {videos.map((v, i) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={i === activeIndex}
              aria-label={`Video ${i + 1}`}
              className={`reels__dot${i === activeIndex ? " is-active" : ""}`}
              onClick={() => {
                const el = trackRef.current;
                const card = el?.children[i] as HTMLElement | undefined;
                card?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                setActiveIndex(i);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
