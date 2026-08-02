/* Glossy, full-color 3D-style emoji (rendered natively by the OS font —
   Segoe UI Emoji / Apple Color Emoji / Noto Emoji all draw these with real
   shading and depth) standing in for the flat line-icon per service category. */
const SERVICE_EMOJI: Record<string, string> = {
  home: "🏠",
  "book-open": "📖",
  flame: "🔥",
  rings: "💍",
  scissors: "✂️",
  trishul: "🔱",
  sparkles: "✨",
  om: "🕉️",
  baby: "👶",
  kalash: "🏺",
  "shield-check": "🛡️",
  "alert-circle": "⚠️",
  moon: "🌙",
  temple: "🛕",
  diya: "🪔",
  sun: "☀️",
  globe: "🌐",
  briefcase: "💼",
  award: "🏅",
};

export function serviceEmoji(icon: string): string {
  return SERVICE_EMOJI[icon] || "🪔";
}
