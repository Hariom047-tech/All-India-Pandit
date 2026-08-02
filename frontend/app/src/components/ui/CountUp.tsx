import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

export function CountUp({ raw }: { raw: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -40px 0px" });
  const [display, setDisplay] = useState(raw.replace(/[0-9,]/g, (c) => (c === "," ? "," : "0")));

  useEffect(() => {
    if (!inView) return;
    const target = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    const suffix = raw.replace(/[0-9,]/g, "");
    if (!target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(raw);
      return;
    }
    const start = performance.now();
    const dur = 1100;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const v = Math.floor(target * (1 - Math.pow(1 - t, 3)));
      setDisplay(v.toLocaleString("en-IN") + suffix);
      if (t < 1) raf = requestAnimationFrame(step);
      else setDisplay(raw);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, raw]);

  return (
    <motion.span
      ref={ref}
      className="stat-num"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.4 }}
    >
      {display}
    </motion.span>
  );
}
