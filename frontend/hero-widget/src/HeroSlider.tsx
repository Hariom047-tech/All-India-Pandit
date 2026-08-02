import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, EffectFade, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/effect-fade";
import "swiper/css/pagination";
import { temples } from "./temples";
import "./HeroSlider.css";

export default function HeroSlider() {
  return (
    <section className="hero-slider" aria-label="Featured temples across India">
      <Swiper
        modules={[Autoplay, EffectFade, Pagination]}
        effect="fade"
        fadeEffect={{ crossFade: true }}
        speed={1200}
        autoplay={{ delay: 4200, disableOnInteraction: false, pauseOnMouseEnter: true }}
        loop
        pagination={{ clickable: true }}
        className="hero-slider__swiper"
      >
        {temples.map((temple) => (
          <SwiperSlide key={temple.id}>
            {({ isActive }) => (
              <div className="hero-slide">
                <picture>
                  <source
                    media="(max-width: 760px)"
                    srcSet={temple.webp960}
                    type="image/webp"
                  />
                  <source srcSet={temple.webp} type="image/webp" />
                  <img
                    src={temple.jpg}
                    alt={temple.alt}
                    className={`hero-slide__img${isActive ? " hero-slide__img--active" : ""}`}
                    loading="eager"
                    decoding="async"
                  />
                </picture>
                <span className="hero-slide__caption">
                  {temple.name} <span className="hero-slide__dot" aria-hidden="true">•</span>{" "}
                  {temple.city}
                </span>
              </div>
            )}
          </SwiperSlide>
        ))}
      </Swiper>

      {/* Subtle bottom gradient for caption readability */}
      <div className="hero-slider__veil" aria-hidden="true" />
    </section>
  );
}
