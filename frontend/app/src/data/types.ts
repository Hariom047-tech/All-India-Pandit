export interface Service {
  id: string;
  name: string;
  icon: string;
  cat: "daily" | "life" | "festival" | "shanti";
  tag: string;
  dur: string;
  pandits: number;
  desc: string;
  samagri: string[];
  priority?: number;
  /** Admin "Mark as popular" — drives the homepage services grid. */
  popular?: boolean;
  /** Ritual can be performed remotely (video call / live stream). */
  onlineAvailable?: boolean;
  onlineNote?: string | null;
  img?: string;
}

export interface Temple {
  id: string;
  name: string;
  city: string;
  state: string;
  deity: string;
  rating: number;
  reviews: number;
  pandits: number;
  timings: string;
  est: string;
  lat: number;
  lng: number;
  services: string[];
  img: string;
  album?: boolean;
  about: string;
  history: string;
  /**
   * Religious significance — rendered under history on the temple page.
   * Optional: the bundled temples in content.ts predate this field, and it is
   * genuinely optional content an admin may leave blank.
   */
  significance?: string;
  gallery: string[];
  highlights: string[];
}

export type PanditTier = "Diamond" | "Gold" | "Silver";

export interface Pandit {
  id: string;
  name: string;
  /** Devanagari form of `name`, shown when the site is in Hindi mode. */
  nameHi?: string;
  city: string;
  state: string;
  exp: number;
  rating: number;
  reviews: number;
  verified: boolean;
  tier: PanditTier;
  langs: string[];
  services: string[];
  temples: string[];
  phone: string;
  edu: string;
  gotra: string;
  tradition?: string;
  respondsWithin?: string;
  acceptsOnline?: boolean;
  about: string;
  img: string;
}

export interface Review {
  name: string;
  city: string;
  rating: number;
  /** Headline the reviewer typed. Collected by the form since day one but
   *  never modelled here, so it was dropped before it reached the card. */
  title?: string;
  text: string;
  /** ISO timestamp — a review with no date reads as stale or fake. */
  date?: string;
  service?: string;
  variant?: "standard" | "with-photo" | "featured" | "short";
  avatar?: string;
  photos?: string[];
}

export interface BlogPost {
  id: string;
  cat: string;
  title: string;
  date: string;
  read: string;
  excerpt: string;
}

export interface Plan {
  name: string;
  price: string;
  per: string;
  feats: string[];
  cta: string;
  popular?: boolean;
}

export interface Faq {
  q: string;
  a: string;
}

export interface Stat {
  icon: string;
  num: string;
  label: string;
}

export interface RecommendRule {
  keys: string[];
  svc: string[];
  why: string;
}
