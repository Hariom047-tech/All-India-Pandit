import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { Service } from "../../data/types";
import { Icon } from "../../lib/icons";
import { serviceEmoji } from "../../lib/serviceEmoji";

export function ServiceCard({ s, index = 0 }: { s: Service; index?: number }) {
  return (
    <motion.article
      className="card card--hover svc-card"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.45, delay: Math.min(index, 8) * 0.04, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
    >
      <div className="svc-ico--emoji" role="img" aria-label={s.name}>{serviceEmoji(s.icon)}</div>
      <h3>{s.name}</h3>
      <p>{s.tag}</p>
      <Link className="btn btn-gold btn-block btn-sm" to={`/services/${s.id}`}>Find Pandits</Link>
      <p className="muted row" style={{ marginTop: 10, fontSize: ".8rem", gap: 6, justifyContent: "center" }}>
        <Icon name="clock" size={13} /><span>{s.dur} · {s.pandits} pandits</span>
      </p>
    </motion.article>
  );
}
