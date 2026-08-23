/**
 * Loads Razorpay's Checkout script on demand, once. Not loaded globally (no
 * <script> tag in index.html) — the only page that ever needs it is My Plan,
 * so every other page on the site stays free of a third-party script.
 */
type RazorpayInstance = { open: () => void };
type RazorpayOptions = {
  key: string; order_id: string; amount: number; currency: string;
  name: string; description?: string;
  handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
};
type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let loadPromise: Promise<RazorpayConstructor> | null = null;

export function loadRazorpay(): Promise<RazorpayConstructor> {
  const existing = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
  if (existing) return Promise.resolve(existing);

  if (!loadPromise) {
    loadPromise = new Promise<RazorpayConstructor>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => {
        const rz = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
        if (rz) resolve(rz);
        else reject(new Error("Razorpay script loaded but window.Razorpay is missing."));
      };
      script.onerror = () => reject(new Error("Razorpay script load nahi ho paya — internet connection check karein."));
      document.head.appendChild(script);
    });
    loadPromise.catch(() => { loadPromise = null; });
  }
  return loadPromise;
}

export type { RazorpayOptions, RazorpayInstance, RazorpayConstructor };
