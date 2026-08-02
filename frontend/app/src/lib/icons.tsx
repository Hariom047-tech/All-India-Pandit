/* Line-art SVG icon set (stroke = currentColor), ported 1:1 from the
   previous vanilla-JS site so gold theming/sizing stays identical. */
import type { SVGProps } from "react";

export const iconPaths: Record<string, string> = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  "map-pin": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  phone: '<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.2a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z"/>',
  whatsapp: '<path d="M12.01 2.014a9.982 9.982 0 00-9.98 9.98c0 1.76.46 3.47 1.33 4.98L2 22l5.17-1.35c1.47.8 3.14 1.22 4.84 1.22 5.51 0 9.98-4.47 9.98-9.98a9.98 9.98 0 00-9.98-9.98V2.014zm5.09 14.18c-.2.57-.96 1.05-1.46 1.15-.46.09-1.06.15-2.9-.6-2.2-.9-3.64-3.15-3.75-3.3-.11-.15-.89-1.19-.89-2.27 0-1.08.57-1.61.77-1.83.2-.23.43-.28.58-.28s.29 0 .42.01c.14 0 .31-.05.48.36.19.45.64 1.57.7 1.7.06.12.1.27.01.45-.09.18-.13.29-.26.44-.13.15-.28.32-.39.44-.13.14-.27.29-.11.57.15.28.68 1.14 1.46 1.83.99.88 1.83 1.15 2.11 1.29.28.14.44.11.6-.07.16-.18.68-.78.86-1.05.18-.27.35-.23.6-.14.25.09 1.58.74 1.85.88.27.14.45.2.52.32.07.12.07.71-.13 1.28z" fill="currentColor" stroke="none"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2.5 6l9.5 7 9.5-7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  users: '<circle cx="9" cy="8" r="3.6"/><path d="M2 21c0-4 3.2-6.4 7-6.4s7 2.4 7 6.4"/><path d="M17 4.4a3.6 3.6 0 010 7.2M18.4 14.8c2.2.8 3.6 2.8 3.6 5.4"/>',
  star: '<path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.5l1.1-6.5L2.6 9.4l6.5-.9z"/>',
  heart: '<path d="M12 20.5l-1.4-1.3C5.4 14.5 2 11.4 2 7.6A4.6 4.6 0 016.6 3c1.9 0 3.7 1 4.4 2.4h2C13.7 4 15.5 3 17.4 3A4.6 4.6 0 0122 7.6c0 3.8-3.4 6.9-8.6 11.6z"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.4l2.4 2.4 4.6-5.2"/>',
  verified:
    '<path d="M12 2.4l2.4 1.8 3-.2 1 2.8 2.4 1.7-1 2.9 1 2.9-2.4 1.7-1 2.8-3-.2L12 21.6l-2.4-1.8-3 .2-1-2.8L3.2 15.7l1-2.9-1-2.9 2.4-1.7 1-2.8 3 .2z" fill="currentColor" stroke="none"/><path d="M8.5 12.2l2.3 2.3 4.7-5" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',
  check: '<path d="M4.5 12.5l5 5L20 7"/>',
  "shield-check": '<path d="M12 2.5l8 3v6c0 5-3.4 8.8-8 10.2C7.4 20.3 4 16.5 4 11.5v-6z"/><path d="M9 12l2.2 2.2L15.4 10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  "chevron-down": '<path d="M6 9.5l6 6 6-6"/>',
  "chevron-right": '<path d="M9.5 6l6 6-6 6"/>',
  "chevron-left": '<path d="M14.5 6l-6 6 6 6"/>',
  "arrow-right": '<path d="M4 12h15M13 6l6 6-6 6"/>',
  home: '<path d="M3.5 10.5L12 3.5l8.5 7V20a1 1 0 01-1 1h-15a1 1 0 01-1-1z"/><path d="M9.5 21v-6h5v6"/>',
  temple: '<path d="M12 2.5l3 4.5H9zM6 7h12l1.5 4H4.5zM5 11h14v10H5z"/><path d="M10.5 21v-5a1.5 1.5 0 013 0v5"/>',
  diya: '<path d="M4 14h16c0 3.3-3.6 5.5-8 5.5S4 17.3 4 14z"/><path d="M12 13c1.8-1.4 1.8-3.6 0-5.5-1.8 1.9-1.8 4.1 0 5.5z"/>',
  kalash:
    '<path d="M7.5 11c-.9 2-.9 4.3 0 6.1A4.7 4.7 0 0016.5 17c.9-1.8.9-4.1 0-6.1z"/><path d="M5.8 11h12.4"/><circle cx="12" cy="6.9" r="2.2"/><path d="M9.8 9.1c-1.4-.4-2.3-1.3-2.6-2.6 1.4.1 2.4.7 3 1.8M14.2 9.1c1.4-.4 2.3-1.3 2.6-2.6-1.4.1-2.4.7-3 1.8"/>',
  om: '<path d="M8.6 9.4a3.2 3.2 0 100 6.4c2.6 0 3.6-2.4 3.6-4.6M12.2 11.2c2 0 3.4 1.6 3.4 3.4a3 3 0 01-3 3c-2 0-3-1.4-3-3M16 8.4c1.2 0 2 .8 2 2M14.6 4.6c1 .6 1.4 1.6 1.4 2.6"/>',
  trishul: '<path d="M12 3v18M12 3l-3 3M12 3l3 3M6 7v5a6 6 0 0012 0V7"/>',
  flame:
    '<path d="M12 21c3.9 0 6-2.4 6-5.5 0-4.5-6-6.5-4.5-11C10 5.5 6 8.5 6 15.5 6 18.6 8.1 21 12 21z"/><path d="M12 21c-1.8 0-2.8-1.2-2.8-2.8 0-2.2 2.8-3 2-5.4 1.6 1.2 3.6 2.6 3.6 5.4 0 1.6-1 2.8-2.8 2.8z"/>',
  sparkles:
    '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM5 14l.6 1.6L7.2 16l-1.6.6L5 18.2l-.6-1.6L2.8 16l1.6-.4z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 21 12 21 8.2 15.5 8.2 12 9.5 5.5 12 3z"/>',
  video: '<rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="M15.5 10.5L21.5 7v10l-6-3.5z"/>',
  play: '<path d="M7 4.5l12 7.5-12 7.5z"/>',
  "message-circle":
    '<path d="M21 11.5a8.4 8.4 0 01-9 8.4 9.3 9.3 0 01-3.7-.7L3 21l1.8-4.8A8.4 8.4 0 0112 3.1a8.4 8.4 0 019 8.4z"/>',
  "book-open": '<path d="M12 6.5C10.5 5 8.5 4.3 4 4.3V18c4.5 0 6.5.7 8 2.2 1.5-1.5 3.5-2.2 8-2.2V4.3c-4.5 0-6.5.7-8 2.2z"/><path d="M12 6.5v13.7"/>',
  newspaper: '<path d="M4 5h13v15H4z"/><path d="M17 9h3v9a2 2 0 01-3 1.7"/><path d="M7 9h7M7 12.5h7M7 16h4"/>',
  map: '<path d="M9 3.5L3 6v14.5l6-2.5 6 2.5 6-2.5V3.5L15 6z"/><path d="M9 3.5V18M15 6v14.5"/>',
  "layout-dashboard":
    '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
  "bar-chart": '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  "trending-up": '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  bell: '<path d="M18 15V10a6 6 0 10-12 0v5l-2 3h16z"/><path d="M10 21h4"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14.5L7 22l5-2.5 5 2.5-1.5-7.5"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2v.2a2 2 0 01-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 01-2.8-2.8l.1-.1A1.7 1.7 0 003.5 15a2 2 0 010-4h.2a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 012.8-2.8l.1.1A1.7 1.7 0 0011 4.1V4a2 2 0 014 0v.2a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 012.8 2.8l-.1.1a1.7 1.7 0 001.2 2.9h.1a2 2 0 010 4h-.2"/>',
  "credit-card": '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.6l6.8-4M8.6 13.4l6.8 4"/>',
  "qr-code":
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 19h2v2h-2zM14 19h2M19 14h2"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 4h13l3.5 8v6a2 2 0 01-2 2H4a2 2 0 01-2-2v-6z"/>',
  download: '<path d="M12 3v12M7 11l5 5 5-5M4 21h16"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 7.5L20 18M20 6L8.5 16.5"/>',
  rings: '<circle cx="9" cy="14" r="6"/><circle cx="16" cy="14" r="6"/><path d="M9 8V4M16 8V4"/>',
  baby: '<circle cx="12" cy="9" r="5"/><path d="M9.5 8.5h.01M14.5 8.5h.01M10 11.5c1.2 1 2.8 1 4 0"/><path d="M6 21c0-3.3 2.7-5 6-5s6 1.7 6 5"/>',
  facebook: '<path d="M15 3h-2.5A4.5 4.5 0 008 7.5V10H5.5v3.5H8V21h3.5v-7.5H14l.5-3.5h-3V7.8c0-.7.4-1.3 1.2-1.3H15z"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10.5 9.5l5 2.5-5 2.5z"/>',
  twitter:
    '<path d="M21 5.4c-.7.5-1.5.8-2.3 1a3.7 3.7 0 00-6.3 2.5v.8A10.5 10.5 0 014 5.8s-4 9 5 13c-2 1.3-4.4 1.8-6.8 1.3 9.4 3 15.8-2.9 15.8-10.6v-.6c.8-.8 1.5-1.7 2-2.5z"/>',
  linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 10v7M7 7.2h.01M11.5 17v-4a2.5 2.5 0 015 0v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  "alert-circle": '<circle cx="12" cy="12" r="9"/><path d="M12 8v4.5M12 16h.01"/>',
  briefcase: '<rect x="2.5" y="7" width="19" height="13" rx="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M2.5 12h19"/>',
  send: '<path d="M21 3L10.5 13.5M21 3l-7 18-3.5-7.5L3 10z"/>',
  "help-circle": '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.5M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  lotus:
    '<path d="M12 4c2 3 2 6 0 9-2-3-2-6 0-9z"/><path d="M12 13c-3-2-6-1.5-8 1 3 2 6 2 8-1zM12 13c3-2 6-1.5 8 1-3 2-6 2-8-1z"/><path d="M12 13c-1.5 3-5 5-8 5 2 2 6 2.5 8-5zM12 13c1.5 3 5 5 8 5-2 2-6 2.5-8-5z"/>',
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "fill"> {
  name: string;
  size?: number;
  fill?: boolean;
}

export function Icon({ name, size = 24, fill = false, ...rest }: IconProps) {
  const path = iconPaths[name] || iconPaths.info;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: path }}
      {...rest}
    />
  );
}
