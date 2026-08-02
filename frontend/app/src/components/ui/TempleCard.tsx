import { Link } from "react-router-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import type { Temple } from "../../data/types";
import { Icon } from "../../lib/icons";
import { RatingCompact } from "./StarRating";
import { onImgError } from "../../lib/format";

export function TempleCard({ t, index = 0 }: { t: Temple; index?: number }) {
  const [fav, setFav] = useState(false);
  return (
    <motion.article
      className="card card--hover"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.45, delay: Math.min(index, 6) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
    >
      <div className="thumb">
        <img src={t.img} alt={t.name} loading="lazy" onError={onImgError("temple")} />
        <span className="thumb-badge badge-gold">
          <Icon name="user" size={13} /> {t.pandits} Pandits Available
        </span>
        <button
          className={`thumb-fav${fav ? " is-on" : ""}`}
          aria-label={`Save ${t.name}`}
          onClick={() => setFav((v) => !v)}
        >
          <Icon name="heart" size={17} />
        </button>
      </div>
      <div className="card-body">
        <h3 className="card-title">
          <Link to={`/temples/${t.id}`}>{t.name}</Link>
        </h3>
        <p className="meta-line"><Icon name="map-pin" size={15} /> {t.city}, {t.state}</p>
        <p className="meta-line" style={{ marginTop: 4 }}><Icon name="clock" size={15} /> {t.timings}</p>
        <div className="card-foot">
          <RatingCompact rating={t.rating} />
          <Link className="btn btn-outline btn-sm" to={`/temples/${t.id}`}>View Pandits</Link>
        </div>
      </div>
    </motion.article>
  );
}
