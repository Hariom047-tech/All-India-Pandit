import { useCallback, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api, type ContactResult } from "./api";
import { useAuth, saveContactIntent } from "./Auth";
import { useToast } from "../components/ui/Toast";

export type ContactAction = "call" | "whatsapp";

/**
 * THE contact flow. Every Call / WhatsApp button in the app goes through
 * this one hook — pandit profile, directory cards, temple pandit cards,
 * search results, saved pandits.
 *
 * Having exactly one implementation is a security property, not just tidiness:
 * guest handling, verification gating and the "server decides what a lead is"
 * rule are enforced once. A second copy-pasted version is how a component
 * quietly ends up opening WhatsApp without ever telling the backend, or
 * worse, deciding locally that something counted as a lead.
 *
 * Order of operations is deliberate: tell the backend FIRST, open the dialer
 * or WhatsApp only after it answers. Opening the link first would mean losing
 * the lead whenever the browser backgrounds the tab mid-request.
 */
export function usePanditContact() {
  const { isAuthenticated, isContactVerified, isActive, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const contact = useCallback(async (opts: {
    panditSlug: string;
    action: ContactAction;
    phone?: string | null;
    whatsapp?: string | null;
    /** Prefilled WhatsApp text. Preserves the greeting the old waLink() sent. */
    waMessage?: string;
    source?: string;
    /** Called with the server's verdict, e.g. so a profile page can refresh. */
    onResult?: (result: ContactResult) => void;
  }) => {
    const { panditSlug, action, phone, whatsapp, waMessage, source, onResult } = opts;
    const key = `${panditSlug}:${action}`;

    // Guards a double tap on the same button before the first request lands.
    // Backend concurrency protection exists too (advisory lock) — this just
    // avoids a pointless second round trip and a flickering spinner.
    if (pendingKey) return;

    // --- Guest: never a lead. Park the intent and send them to login. ---
    if (!isAuthenticated) {
      saveContactIntent({
        panditSlug,
        action: action === "call" ? "phone_call" : "whatsapp",
        returnTo: location.pathname + location.search,
      });
      toast("Pandit Ji se contact karne ke liye login karein.");
      navigate("/login");
      return;
    }

    if (!isActive) {
      toast("Aapka account abhi active nahi hai. Support se sampark karein.");
      return;
    }

    // --- Logged in but mobile not verified: never a lead. ---
    if (!isContactVerified) {
      saveContactIntent({
        panditSlug,
        action: action === "call" ? "phone_call" : "whatsapp",
        returnTo: location.pathname + location.search,
      });
      toast("Pandit Ji se direct contact karne ke liye apna mobile verify karein.");
      navigate("/dashboard?verify=mobile");
      return;
    }

    setPendingKey(key);
    let result: ContactResult | null = null;
    try {
      result = await api.trackClick(panditSlug, action, source);
      onResult?.(result);
    } catch {
      // The contact itself must not be held hostage by our analytics. If the
      // backend is unreachable the devotee still gets to call — they simply
      // do not generate a lead, which is the correct failure direction:
      // never invent a lead we could not persist.
      toast("Contact record nahi ho paya, par aap call kar sakte hain.");
    } finally {
      setPendingKey(null);
    }

    if (result && !result.contactAllowed) {
      if (result.reason === "user_not_verified") {
        toast("Pandit Ji se direct contact karne ke liye apna mobile verify karein.");
        navigate("/dashboard?verify=mobile");
      } else {
        toast("Abhi contact nahi ho paya. Thodi der baad try karein.");
      }
      return;
    }

    // A pandit pressing their own button gets a clear, harmless message.
    if (result?.reason === "self_contact") {
      toast("Yeh aapki apni profile hai.");
      return;
    }

    const waNumber = (whatsapp || phone || "").replace(/[^\d]/g, "");
    const target = action === "call"
      ? (phone ? `tel:${phone}` : null)
      : (waNumber
          ? `https://wa.me/${waNumber}${waMessage ? `?text=${encodeURIComponent(waMessage)}` : ""}`
          : null);

    if (!target) {
      toast("Contact number abhi uplabdh nahi hai.");
      return;
    }

    if (action === "call") {
      window.location.href = target;
    } else {
      window.open(target, "_blank", "noopener,noreferrer");
    }
  }, [isAuthenticated, isActive, isContactVerified, navigate, location, toast, pendingKey, user?.id]);

  return {
    contact,
    /** True while THIS specific pandit+action is in flight, for button spinners. */
    isPending: (panditSlug: string, action: ContactAction) => pendingKey === `${panditSlug}:${action}`,
    isBusy: pendingKey !== null,
    /**
     * Shown next to the CTAs before contact. The devotee is told plainly that
     * pressing this shares their identity with the pandit — required by the
     * disclosure rule, and it is also simply how the product works.
     */
    disclosure: "Pandit Ji se contact karne par aapka naam aur verified mobile number unke saath share kiya ja sakta hai.",
  };
}
