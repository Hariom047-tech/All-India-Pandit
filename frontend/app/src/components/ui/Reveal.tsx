import { motion, type Variants } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

/* Scroll-triggered entrance, replacing the old IntersectionObserver .reveal
   class with a Framer Motion whileInView animation. */
export function Reveal({
  children,
  delay = 0,
  className,
  style,
  y = 22,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  y?: number;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: y > 0 ? Math.min(y, 10) : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -60px 0px" }}
      transition={{ duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export function RevealStagger({
  children,
  className,
  style,
  step = 0.08,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  step?: number;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -60px 0px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: step } } }}
    >
      {children}
    </motion.div>
  );
}

export const revealItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};
