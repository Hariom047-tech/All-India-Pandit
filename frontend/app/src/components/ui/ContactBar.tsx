import { useEffect, useRef, useState } from "react";
import { Icon } from "../../lib/icons";

/**
 * Sticky contact bar for the pandit profile.
 *
 * The profile is roughly seven screens tall on a phone. Past the hero there
 * was no way to call without scrolling back to the top, which on a
 * lead-generation page is the whole product.
 *
 * Appears only once the hero CTA has scrolled out of view — showing it while
 * the real buttons are still on screen would be two competing calls to action
 * in the same viewport.
 */
export function ContactBar({
  anchorRef, name, onCall, onWhatsApp, busy, callLabel = "Call now",
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  name: string;
  onCall: () => void;
  onWhatsApp: () => void;
  busy?: boolean;
  callLabel?: string;
}) {
  const [shown, setShown] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setShown(!entry.isIntersecting),
      { rootMargin: "-80px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [anchorRef]);

  return (
    <div
      ref={barRef}
      className={`contact-bar${shown ? " is-shown" : ""}`}
      role="region"
      aria-label={`Contact ${name}`}
      aria-hidden={!shown}
    >
      <div className="contact-bar__inner">
        <span className="contact-bar__name">{name}</span>
        <button type="button" className="contact-bar__wa" onClick={onWhatsApp} disabled={busy}
          aria-label={`WhatsApp ${name}`}>
          <Icon name="whatsapp" size={18} />
        </button>
        <button type="button" className="contact-bar__call" onClick={onCall} disabled={busy}>
          <Icon name="phone" size={16} /> {callLabel}
        </button>
      </div>
    </div>
  );
}
