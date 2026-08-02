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
  gallery: string[];
  highlights: string[];
}

export type PanditTier = "Diamond" | "Gold" | "Silver";

export interface Pandit {
  id: string;
  name: string;
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
  about: string;
  img: string;
}

export interface Festival {
  date: string;
  label: string;
  name: string;
  note: string;
  img?: string;
}

export interface Review {
  name: string;
  city: string;
  rating: number;
  text: string;
  service?: string;
}

export interface BlogPost {
  id: string;
  cat: string;
  title: string;
  date: string;
  read: string;
  excerpt: string;
}

export interface AuspiciousWindow {
  k: string;
  v: string;
}

export interface Panchang {
  tithi: string;
  nakshatra: string;
  yoga: string;
  karana: string;
  paksha: string;
  vaar: string;
  sunrise: string;
  sunset: string;
  moonrise: string;
  moonset: string;
  vikram: string;
  shaka: string;
  masa: string;
  ritu: string;
  auspicious: AuspiciousWindow[];
  inauspicious: AuspiciousWindow[];
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
