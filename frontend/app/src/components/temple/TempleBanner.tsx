import { useEffect, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, EffectFade, Pagination } from "swiper/modules";
import { motion } from "framer-motion";
import "swiper/css";
import "swiper/css/effect-fade";
import "swiper/css/pagination";
import { Icon } from "../../lib/icons";
import { RatingRow } from "../ui/StarRating";
import { onImgError } from "../../lib/format";
import type { Temple } from "../../data/types";
import "./TempleBanner.css";

/** One slide in the hero. Admin decides membership and order (show_in_hero). */
export interface HeroSlide {
  id: string;
  url: string;
  type: "photo" | "video";
  title?: string | null;
  caption?: string | null;
}

/** Kept for the existing `videos` consumers; a hero video is just a slide now. */
export type BannerVideo = HeroSlide;

/** A photo dwells this long; a video gets room to actually be watched. */
const PHOTO_MS = 3600;
const VIDEO_MS = 9000;

/**
 * Temple hero.
 *
 * Previously this hardcoded `videos[0]` as the hero and hid the photo slider
 * entirely whenever any video existed — which is how a pandit's portrait video
 * became the banner for Maa Baglamukhi. Placement is now an explicit admin
 * decision (temple_media.show_in_hero) and photos and videos share one slider
 * in the admin's order.
 *
 * Videos are muted + playsInline + loop, the only combination browsers will
 * autoplay, and only the slide on screen is allowed to play.
 */
export function TempleBanner({
  temple,
  photos,
  slides,
  onOpenGallery,
}: {
  temple: Temple;
  /** Gallery photos — drives the lightbox and the "View all N photos" button. */
  photos: { src: string; alt: string }[];
  /** Hero slides chosen by the admin. Falls back to `photos` when empty. */
  slides?: HeroSlide[];
  onOpenGallery: (index: number) => void;
}) {
  const heroSlides: HeroSlide[] =
    slides && slides.length > 0
      ? slides
      : photos.map((p, i) => ({ id: `photo-${i}`, url: p.src, type: "photo" as const }));

  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());

  const hasVideo = heroSlides.some((s) => s.type === "video");
  const activeSlide = heroSlides[active];

  // Respect the OS "reduce motion" setting: no auto-advance, no autoplaying
  // video. Someone who asked the system to stop moving things meant it.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /* Only the visible video plays. Without this every video in the slider keeps
     decoding off-screen, which on a phone is battery and bandwidth spent on
     something nobody can see. */
  useEffect(() => {
    videoRefs.current.forEach((el, id) => {
      if (id === activeSlide?.id && !reduceMotion) {
        // A rejected play() promise is normal (autoplay policy) — not an error
        // worth surfacing, the poster frame stays visible.
        void el.play().catch(() => {});
      } else {
        el.pause();
      }
    });
  }, [active, activeSlide?.id, reduceMotion, heroSlides.length]);

  /** Slide index → index within `photos`, so the lightbox opens on the right
   *  image. Videos are not in the lightbox, hence the -1 guard. */
  function photoIndexOf(slide: HeroSlide) {
    if (slide.type !== "photo") return -1;
    const i = photos.findIndex((p) => p.src === slide.url);
    return i;
  }

  const advances = heroSlides.length > 1 && !reduceMotion;

  return (
    <section className="detail-banner detail-banner--slider">
      <Swiper
        modules={[Autoplay, EffectFade, Pagination]}
        effect="fade"
        fadeEffect={{ crossFade: true }}
        speed={reduceMotion ? 0 : 1100}
        autoplay={advances ? { delay: PHOTO_MS, disableOnInteraction: false, pauseOnMouseEnter: true } : false}
        /* Looping clones slides, which would duplicate every <video> element
           and leave a hidden copy playing. Only loop a photos-only hero. */
        loop={heroSlides.length > 1 && !hasVideo}
        pagination={heroSlides.length > 1 ? { clickable: true } : false}
        onSlideChange={(sw) => setActive(sw.realIndex)}
        className="detail-banner__swiper"
      >
        {heroSlides.map((slide, i) => (
          <SwiperSlide
            key={slide.id}
            /* Swiper reads this per slide, so a video is not cut off after the
               photo delay. */
            data-swiper-autoplay={slide.type === "video" ? VIDEO_MS : PHOTO_MS}
          >
            {({ isActive }) =>
              slide.type === "video" ? (
                <video
                  ref={(el) => {
                    if (el) videoRefs.current.set(slide.id, el);
                    else videoRefs.current.delete(slide.id);
                  }}
                  className="detail-banner__video"
                  src={slide.url}
                  poster={photos[0]?.src}
                  muted={muted}
                  loop
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img
                  src={slide.url}
                  alt={slide.title || temple.name}
                  onError={onImgError("hero")}
                  className={`detail-banner__img${isActive ? " detail-banner__img--active" : ""}`}
                  loading={i === 0 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : undefined}
                  onClick={() => {
                    const idx = photoIndexOf(slide);
                    if (idx >= 0) onOpenGallery(idx);
                  }}
                />
              )
            }
          </SwiperSlide>
        ))}
      </Swiper>

      {/* Sound belongs to the video on screen, so the control only exists while
          one is showing — a mute button over a still photo does nothing. */}
      {activeSlide?.type === "video" && (
        <button
          type="button"
          className="detail-banner__sound"
          onClick={() => setMuted((m) => !m)}
          aria-pressed={!muted}
          aria-label={muted ? "Awaaz on karein" : "Awaaz band karein"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      )}

      {/* golden shimmer overlay */}
      <div className="banner-golden-shimmer" />

      <div className="shell">
        <motion.div
          className="banner-card"
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] as const, delay: 0.2 }}
        >
          <h1>{temple.name}</h1>
          <div className="row">
            <span className="meta-line"><Icon name="map-pin" size={16} /> {temple.city}, {temple.state}</span>
            <span className="divider-v" />
            <RatingRow rating={temple.rating} reviews={temple.reviews} />
            <span className="divider-v" />
            <span className="badge-gold"><Icon name="user" size={13} /> {temple.pandits} Pandits</span>
          </div>
        </motion.div>
      </div>

      {photos.length > 0 && (
        <motion.button
          className="banner-view-gallery"
          onClick={() => onOpenGallery(0)}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
        >
          <Icon name="eye" size={16} /> {photos.length > 1 ? `View all ${photos.length} photos` : "View full photo"}
        </motion.button>
      )}
    </section>
  );
}
