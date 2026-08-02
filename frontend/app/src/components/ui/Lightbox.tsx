import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { Icon } from "../../lib/icons";

export interface LightboxImage {
  src: string;
  alt: string;
  caption?: string;
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
  const open = index !== null;
  const total = images.length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndexChange(((index as number) + 1) % total);
      if (e.key === "ArrowLeft") onIndexChange(((index as number) - 1 + total) % total);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, index, total, onClose, onIndexChange]);

  return (
    <AnimatePresence>
      {open && index !== null && (
        <motion.div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={images[index].caption || images[index].alt}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
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

          <AnimatePresence mode="wait">
            <motion.figure
              key={index}
              className="lightbox__figure"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              onClick={(e) => e.stopPropagation()}
            >
              <img src={images[index].src} alt={images[index].alt} />
              {images[index].caption && <figcaption>{images[index].caption}</figcaption>}
            </motion.figure>
          </AnimatePresence>

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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
