export interface TempleSlide {
  id: string;
  name: string;
  city: string;
  webp: string;
  webp960: string;
  jpg: string;
  alt: string;
}

/**
 * Paths are root-relative to the deployed site (frontend/public/…),
 * matching the convention used across the static HTML pages.
 */
const base = "assets/img/temples/hero";

export const temples: TempleSlide[] = [
  {
    id: "amritsar",
    name: "Golden Temple",
    city: "Amritsar, Punjab",
    webp: `${base}/1-golden-temple-amritsar.webp`,
    webp960: `${base}/1-golden-temple-amritsar-960.webp`,
    jpg: `${base}/1-golden-temple-amritsar.jpg`,
    alt: "Golden Temple (Harmandir Sahib) reflecting in the Sarovar at Amritsar",
  },
  {
    id: "madurai",
    name: "Meenakshi Amman Temple",
    city: "Madurai, Tamil Nadu",
    webp: `${base}/2-meenakshi-temple-madurai.webp`,
    webp960: `${base}/2-meenakshi-temple-madurai-960.webp`,
    jpg: `${base}/2-meenakshi-temple-madurai.jpg`,
    alt: "Painted gopuram tower of the Meenakshi Amman Temple in Madurai",
  },
  {
    id: "tirupati",
    name: "Tirumala Venkateswara Temple",
    city: "Tirupati, Andhra Pradesh",
    webp: `${base}/3-tirumala-venkateswara-tirupati.webp`,
    webp960: `${base}/3-tirumala-venkateswara-tirupati-960.webp`,
    jpg: `${base}/3-tirumala-venkateswara-tirupati.jpg`,
    alt: "Gopuram of the Tirumala Venkateswara Temple in the hills above Tirupati",
  },
  {
    id: "delhi",
    name: "Akshardham Temple",
    city: "New Delhi",
    webp: `${base}/4-akshardham-delhi.webp`,
    webp960: `${base}/4-akshardham-delhi-960.webp`,
    jpg: `${base}/4-akshardham-delhi.jpg`,
    alt: "Swaminarayan Akshardham Temple in New Delhi",
  },
  {
    id: "thanjavur",
    name: "Brihadeeswarar Temple",
    city: "Thanjavur, Tamil Nadu",
    webp: `${base}/5-brihadeeswarar-thanjavur.webp`,
    webp960: `${base}/5-brihadeeswarar-thanjavur-960.webp`,
    jpg: `${base}/5-brihadeeswarar-thanjavur.jpg`,
    alt: "Vimana tower of the Brihadeeswarar Temple in Thanjavur against a clear sky",
  },
  {
    id: "somnath",
    name: "Somnath Temple",
    city: "Prabhas Patan, Gujarat",
    webp: `${base}/6-somnath-temple-gujarat.webp`,
    webp960: `${base}/6-somnath-temple-gujarat-960.webp`,
    jpg: `${base}/6-somnath-temple-gujarat.jpg`,
    alt: "Somnath Temple shikhara against a clear blue sky in Gujarat",
  },
];
