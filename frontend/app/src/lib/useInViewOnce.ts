import { useEffect, useRef, useState } from "react";

/**
 * CSS-transition replacement for the `initial={{opacity:0,y:18}}
 * whileInView={{opacity:1,y:0}} viewport={{once:true}}` framer-motion
 * pattern used identically across PanditCard/TempleCard (and originally
 * ServiceCard) — same one-time scroll-triggered entrance, no animation
 * library. These are the most widely-rendered components on the site, so
 * removing framer-motion here (not just from Home.tsx itself) is what
 * actually gets it out of every page's critical bundle, not only Home's
 * (Phase 12, docs/SEO_ARCHITECTURE.md).
 *
 * Returns a ref to attach to the card's root element and whether it should
 * be showing its "revealed" state — pair with a CSS class such as
 * `.card-reveal` / `.card-reveal.is-visible` (base.css).
 */
export function useInViewOnce<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "0px 0px -40px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, visible };
}
