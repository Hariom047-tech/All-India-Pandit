import { useEffect, useState } from "react";
import { Icon } from "../../lib/icons";

export interface LightboxImage {
  src: string;
  alt: string;
  caption?: string;
}

/** CSS-only fade (mount-then-flip-visible, same technique as Toast.tsx and
 *  Modal.tsx) instead of framer-motion's AnimatePresence — ReviewCard.tsx
 *  uses Lightbox and is rendered directly on Home, so this was pulling
 *  framer-motion into Home's eager bundle even though a photo lightbox is
 *  about as non-critical as a JS dependency gets (Phase 12,
 *  docs/SEO_ARCHITECTURE.md). The image-to-image crossfade when navigating
 *  is not reproduced — a plain swap now — everything else is unchanged. */
function LightboxDialog({
  images, index, onClose, onIndexChange,
}: {
  images: LightboxImage[]; index: number; onClose: () => void; onIndexChange: (i: number) => void;
}) {
  const total = images.length;
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndexChange((index + 1) % total);
      if (e.key === "ArrowLeft") onIndexChange((index - 1 + total) % total);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, total, onClose, onIndexChange]);

  return (
    <div
      className={`lightbox${visible ? " is-open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={images[index].caption || images[index].alt}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <button className="lightbox__close" aria-label="Close" onClick={onClose}><Icon name="x" size={22} /></button>

      {total > 1 && (
        <button
          className="lightbox__nav lightbox__nav--prev"
          aria-label="Previous image"
          onClick={() => onIndexChange((index - 1 + total) % total)}
        >
          <Icon name="chevron-left" size={26} />
        </button>
      )}

      <figure className="lightbox__figure" onClick={(e) => e.stopPropagation()}>
        <img src={images[index].src} alt={images[index].alt} />
        {images[index].caption && <figcaption>{images[index].caption}</figcaption>}
      </figure>

      {total > 1 && (
        <button
          className="lightbox__nav lightbox__nav--next"
          aria-label="Next image"
          onClick={() => onIndexChange((index + 1) % total)}
        >
          <Icon name="chevron-right" size={26} />
        </button>
      )}

      {total > 1 && (
        <div className="lightbox__counter">{index + 1} / {total}</div>
      )}
    </div>
  );
}

export function Lightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: {
  images: LightboxImage[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}) {
  if (index === null) return null;
  return <LightboxDialog images={images} index={index} onClose={onClose} onIndexChange={onIndexChange} />;
}
