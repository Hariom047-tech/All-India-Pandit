import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../lib/icons";

/** The actual dialog — only mounted while `open` (conditional mount
 *  preserved deliberately: Modal is shared by 7+ different callers with
 *  their own effects/side-effects in `children`, so always-mounting could
 *  change their behavior in ways this pass can't fully audit). `visible`
 *  flips true one tick after mount so the CSS transition below has an
 *  initial state to animate away from — same technique as Toast.tsx's
 *  entries. Framer-motion's AnimatePresence gave this a real fade-out on
 *  close too; this trades that for closing instantly, in exchange for
 *  removing framer-motion from EnquiryModalProvider's dependency graph,
 *  which (via App.tsx) wraps every route on the site (Phase 12,
 *  docs/SEO_ARCHITECTURE.md). */
function ModalDialog({
  onClose, children, size = "md",
}: { onClose: () => void; children: ReactNode; size?: "md" | "lg" | "full" }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={`modal${visible ? " is-open" : ""}`}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal-box${size !== "md" ? ` modal-box--${size}` : ""}`} style={{ display: "flex", flexDirection: "column" }}>
        <button className="modal-x" aria-label="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
        {/* The scrolling region. .modal-box is overflow:hidden with a
            max-height, so without this the tail of a long form (the
            Submit button) was simply clipped and unreachable. */}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** "md" (default, 500px) is unchanged for every existing caller. "lg" and
   *  "full" are wider variants for content-heavy admin forms (map picker,
   *  gallery manager, several list editors) that were cramped at 500px. */
  size?: "md" | "lg" | "full";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    // Lets fixed page furniture (mobile tab bar, sticky contact bar) step
    // aside while a dialog is open instead of competing with it.
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      document.body.classList.remove("modal-open");
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(<ModalDialog onClose={onClose} size={size}>{children}</ModalDialog>, document.body);
}
