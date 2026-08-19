import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/Auth";
import { Modal } from "./Modal";
import { ReviewForm } from "./ReviewForm";
import { Icon } from "../../lib/icons";

export type ReviewTarget = "pandit" | "temple" | "platform";

/**
 * The single entry point for writing a review — pandit, temple or the
 * platform itself.
 *
 * Three gates, in the order a devotee meets them:
 *   guest          → send to login, remember where they were
 *   unverified     → send to mobile verification
 *   verified       → open the form
 *
 * Centralised for the same reason usePanditContact() is: the rule "only a
 * verified devotee may affect a public rating" has to hold everywhere, and a
 * second copy of this logic is how one surface quietly ends up ungated.
 * The server enforces it again regardless — this is UX, not security.
 */
export function WriteReview({
  targetType, targetSlug, targetName, services = [], onPosted,
}: {
  targetType: ReviewTarget;
  targetSlug?: string;
  targetName: string;
  services?: { id: string; name: string; slug: string }[];
  onPosted?: () => void;
}) {
  const { isAuthenticated, isContactVerified, isActive } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  function start() {
    if (!isAuthenticated) {
      // Same return-here mechanism the contact flow uses.
      sessionStorage.setItem("panditconnect_review_intent", location.pathname + location.search);
      navigate("/login");
      return;
    }
    if (!isActive) return;
    if (!isContactVerified) {
      navigate("/dashboard?verify=mobile");
      return;
    }
    setOpen(true);
  }

  const label = targetType === "platform" ? "Rate PanditSuggest" : "Write a review";

  if (done) {
    return (
      <p className="wr-thanks" role="status">
        <Icon name="check" size={16} /> Aapka review mil gaya. Dhanyawad 🙏
      </p>
    );
  }

  return (
    <>
      <button type="button" className="btn btn-outline wr-trigger" onClick={start}>
        <Icon name="star" size={16} /> {label}
      </button>

      {!isAuthenticated && (
        <p className="wr-hint">Review likhne ke liye login karein.</p>
      )}
      {isAuthenticated && !isContactVerified && (
        <p className="wr-hint">Review likhne ke liye pehle mobile verify karein.</p>
      )}

      <Modal open={open} onClose={() => setOpen(false)}>
        <ReviewForm
          targetType={targetType}
          targetSlug={targetSlug}
          targetName={targetName}
          services={services}
          onSuccess={() => { setOpen(false); setDone(true); onPosted?.(); }}
        />
      </Modal>
    </>
  );
}
