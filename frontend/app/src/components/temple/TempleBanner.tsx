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

export function TempleBanner({
  temple,
  photos,
  onOpenGallery,
}: {
  temple: Temple;
  photos: { src: string; alt: string }[];
  onOpenGallery: (index: number) => void;
}) {
  return (
    <section className="detail-banner detail-banner--slider">
      <Swiper
        modules={[Autoplay, EffectFade, Pagination]}
        effect="fade"
        fadeEffect={{ crossFade: true }}
        speed={1100}
        autoplay={photos.length > 1 ? { delay: 3600, disableOnInteraction: false, pauseOnMouseEnter: true } : false}
        loop={photos.length > 1}
        pagination={photos.length > 1 ? { clickable: true } : false}
        className="detail-banner__swiper"
      >
        {photos.map((photo, i) => (
          <SwiperSlide key={photo.src}>
            {({ isActive }) => (
              <img
                src={photo.src}
                alt={photo.alt}
                onError={onImgError("hero")}
                className={`detail-banner__img${isActive ? " detail-banner__img--active" : ""}`}
                loading={i === 0 ? "eager" : "lazy"}
                onClick={() => onOpenGallery(i)}
              />
            )}
          </SwiperSlide>
        ))}
      </Swiper>

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

      <motion.button
        className="banner-view-gallery"
        onClick={() => onOpenGallery(0)}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.4 }}
      >
        <Icon name="eye" size={16} /> {photos.length > 1 ? `View all ${photos.length} photos` : "View full photo"}
      </motion.button>
    </section>
  );
}
