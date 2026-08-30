/* Service-specific rich content for the detail page redesign (Option C).
   This provides the hero images, benefits, puja process, and FAQ per service. */

export interface ServiceMeta {
  heroImg: string;
  tagline: string;
  benefits: { icon: string; title: string }[];
  process: { step: number; title: string; desc: string }[];
  faq: { q: string; a: string }[];
}

const DEFAULT_BENEFITS = [
  { icon: "🙏", title: "Peace & Harmony" },
  { icon: "🛡️", title: "Divine Protection" },
  { icon: "🌟", title: "Prosperity" },
  { icon: "👨‍👩‍👧‍👦", title: "Family Well-being" },
  { icon: "🕉️", title: "Spiritual Growth" },
  { icon: "✨", title: "Remove Negativity" },
];

const DEFAULT_PROCESS = [
  { step: 1, title: "Sankalp", desc: "Taking the sacred vow with intention" },
  { step: 2, title: "Ganesh Puja", desc: "Invoking Lord Ganesh to remove obstacles" },
  { step: 3, title: "Main Puja", desc: "Performing the core ritual with mantras" },
  { step: 4, title: "Havan", desc: "Sacred fire offering with ghee and samagri" },
  { step: 5, title: "Aarti & Prasad", desc: "Concluding with devotional aarti" },
];

const DEFAULT_FAQ = [
  { q: "How long does this puja take?", a: "Typically 2–4 hours depending on the specific vidhi and the pandit's tradition." },
  { q: "Do I need to arrange samagri myself?", a: "Most pandits bring a complete samagri kit. Confirm this when you connect with them." },
  { q: "Can this be done on any day?", a: "While it can be done on most days, performing it during an auspicious muhurat is highly recommended for best results." },
  { q: "What if I'm in a different city?", a: "You can book a pandit in your city through PanditSuggest. We have pandits across India." },
];

const META: Record<string, Partial<ServiceMeta>> = {
  "griha-pravesh": {
    heroImg: "https://media.panditsuggest.com/static/griha-pravesh-hero.webp",
    tagline: "Begin your new journey with divine blessings — invoke Lord Ganesh & Vastu Purush for peace and prosperity in your new home",
    benefits: [
      { icon: "🙏", title: "Peace & Harmony" },
      { icon: "🏠", title: "Vastu Correction" },
      { icon: "✨", title: "Remove Negativity" },
      { icon: "👨‍👩‍👧‍👦", title: "Family Well-being" },
      { icon: "🌟", title: "Prosperity" },
      { icon: "🛡️", title: "Divine Protection" },
    ],
    process: [
      { step: 1, title: "Ganesh Puja", desc: "Invoke Lord Ganesh to remove all obstacles" },
      { step: 2, title: "Vastu Shanti", desc: "Pacify the Vastu Devta for directional harmony" },
      { step: 3, title: "Navagraha Havan", desc: "Appease the nine planets for family well-being" },
      { step: 4, title: "Griha Pravesh", desc: "Enter your new home with sacred rituals" },
      { step: 5, title: "Aarti & Prasad", desc: "Conclude with devotional aarti and blessings" },
    ],
    faq: [
      { q: "When should Griha Pravesh be performed?", a: "Ideally during an auspicious muhurat. Avoid Rahu Kaal, and months of Ashwin and Bhadrapad are generally avoided." },
      { q: "Can it be done for a rented house?", a: "Yes! Griha Pravesh is recommended for any new home — owned or rented — to bring positive energy." },
      { q: "What should I carry when entering the new home?", a: "Typically a Kalash filled with water, coconut, mango leaves, and the household's first fire (diya)." },
      { q: "How long does the complete ceremony take?", a: "The full Griha Pravesh with Vastu Shanti and Havan takes approximately 3–4 hours." },
    ],
  },
  "havan-yagna": {
    tagline: "Sacred fire offerings to purify your surroundings and invoke divine blessings for health, wealth and spiritual growth",
    benefits: [
      { icon: "🔥", title: "Purification" },
      { icon: "🙏", title: "Spiritual Upliftment" },
      { icon: "🌿", title: "Environmental Cleansing" },
      { icon: "❤️", title: "Health & Healing" },
      { icon: "🌟", title: "Prosperity" },
      { icon: "🛡️", title: "Protection from Evil" },
    ],
  },
  "wedding": {
    tagline: "Sacred Vedic marriage ceremony uniting two souls with divine blessings for a lifetime of love, harmony and prosperity",
    benefits: [
      { icon: "💍", title: "Sacred Union" },
      { icon: "🙏", title: "Divine Blessings" },
      { icon: "👨‍👩‍👧‍👦", title: "Family Harmony" },
      { icon: "🌟", title: "Prosperity" },
      { icon: "❤️", title: "Eternal Love" },
      { icon: "🛡️", title: "Protection" },
    ],
  },
};

export function getServiceMeta(serviceId: string): ServiceMeta {
  const m = META[serviceId] || {};
  return {
    heroImg: m.heroImg || "https://media.panditsuggest.com/static/griha-pravesh-hero.webp",
    tagline: m.tagline || "Experience the divine power of this sacred ritual performed by verified Vedic pandits",
    benefits: m.benefits || DEFAULT_BENEFITS,
    process: m.process || DEFAULT_PROCESS,
    faq: m.faq || DEFAULT_FAQ,
  };
}
