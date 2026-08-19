import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { Service } from "../../data/types";
import { serviceEmoji } from "../../lib/serviceEmoji";

interface ServiceCardProps {
  s: Service;
  index?: number;
  /** "row" (default): compact horizontal list item — TempleDetail's service
   *  list, full-width, stacked. "grid": a bigger square-ish, rounded card
   *  for grid layouts (e.g. ServiceDetail's "Related services"), where the
   *  row layout squeezes into an unreadably small strip. */
  variant?: "row" | "grid";
}

export function ServiceCard({ s, index = 0, variant = "row" }: ServiceCardProps) {
  if (variant === "grid") {
    return (
      <motion.article
        className="svc-grid-card"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "0px 0px -30px 0px" }}
        transition={{ duration: 0.35, delay: Math.min(index, 6) * 0.05 }}
      >
        <span className="svc-grid-card__emoji">{serviceEmoji(s.icon)}</span>
        <span className="svc-grid-card__name">{s.name}</span>
        {s.tag && <span className="svc-grid-card__tag">{s.tag}</span>}
        <Link className="svc-grid-card__cta" to={`/services/${s.id}`}>
          View <span aria-hidden>›</span>
        </Link>
      </motion.article>
    );
  }

  return (
    <motion.article
      className="svc-row-card"
      initial={{ opacity: 0, x: -12 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "0px 0px -30px 0px" }}
      transition={{ duration: 0.35, delay: Math.min(index, 6) * 0.05 }}
    >
      <span className="svc-row-card__emoji">{serviceEmoji(s.icon)}</span>
      <div className="svc-row-card__body">
        <span className="svc-row-card__name">{s.name}</span>
        {s.tag && <span className="svc-row-card__tag">{s.tag}</span>}
      </div>
      <Link className="svc-row-card__cta" to={`/services/${s.id}`}>
        View <span aria-hidden>›</span>
      </Link>
    </motion.article>
  );
}
