import type { SyntheticEvent } from "react";
import type { Pandit } from "../data/types";

export function waLink(p: Pandit, ctx?: string): string {
  const msg =
    `Namaste ${p.name}, I found your profile on PanditSuggest.` +
    (ctx ? ` I would like to enquire about ${ctx}.` : " I would like to enquire about a puja.");
  return `https://wa.me/${p.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(msg)}`;
}

export function telLink(p: Pandit): string {
  return `tel:${p.phone}`;
}

export const PLACEHOLDER = {
  pandit: "/assets/img/pandit-placeholder.svg",
  temple: "/assets/img/temple-placeholder.svg",
  hero: "/assets/img/hero-temple.svg",
};

export function onImgError(kind: keyof typeof PLACEHOLDER) {
  return (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    img.onerror = null;
    img.src = PLACEHOLDER[kind];
  };
}
