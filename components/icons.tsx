import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...p,
});

export const IconHome = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 10.5 12 4l8 6.5V20H4z" /><path d="M10 20v-5h4v5" /></svg>
);
export const IconHanger = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 8.5a2 2 0 1 1 2-2" /><path d="M12 8.5 3 15.5h18z" /></svg>
);
export const IconLayers = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="5" y="3.5" width="14" height="7" rx="1" /><rect x="5" y="13.5" width="14" height="7" rx="1" /></svg>
);
/** Stylist — a simple needle & thread, deliberately not a sparkle */
export const IconStylist = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 19 18 6" /><ellipse cx="18.6" cy="5.4" rx="1.2" ry="1.8" transform="rotate(45 18.6 5.4)" /><path d="M5 19c2-3 6-2 7 0s5 2 7-1" /></svg>
);
export const IconUser = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5" /></svg>
);
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconChevronL = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m14.5 6-6 6 6 6" /></svg>
);
export const IconChevronR = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m9.5 6 6 6-6 6" /></svg>
);
export const IconShuffle = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 7h3c4 0 6 10 10 10h3" /><path d="M4 17h3c1.6 0 2.8-1.6 3.9-3.6M13.1 9.6C14.2 7.6 15.4 7 17 7h3" /><path d="m18 4.5 2.5 2.5L18 9.5M18 14.5l2.5 2.5-2.5 2.5" /></svg>
);
export const IconCamera = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
export const IconImage = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="4" y="4.5" width="16" height="15" rx="1.5" /><circle cx="9" cy="9.5" r="1.5" /><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" /></svg>
);
export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconLock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="5.5" y="10.5" width="13" height="9" rx="1.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>
);
export const IconUnlock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="5.5" y="10.5" width="13" height="9" rx="1.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.8-1.2" /></svg>
);
export const IconFilter = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
);
export const IconArrowR = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconBack = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
);
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" /></svg>
);
export const IconEmpty = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="7" strokeDasharray="2 3" /></svg>
);
export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
);
export const IconMore = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="6" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="18" cy="12" r="1" fill="currentColor" /></svg>
);
export const IconMoreV = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="6" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="18" r="1" fill="currentColor" /></svg>
);
export const IconMove = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" /></svg>
);
export const IconChevronD = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m6 9.5 6 6 6-6" /></svg>
);
export const IconSliders = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>
);
export const IconBookmark = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M7 4h10v16l-5-3.5L7 20z" /></svg>
);
export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></svg>
);
/* category line icons (home tiles) */
export const IconTee = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 4 4 6.5 2.5 11l3 1.2L7 10v10h10V10l1.5 2.2 3-1.2L20 6.5 15 4c-.6 1.4-1.7 2.2-3 2.2S9.6 5.4 9 4z" /></svg>
);
export const IconPants = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M7 3h10l1 18h-4.5L12 10l-1.5 11H6z" /><path d="M7 6h10" /></svg>
);
export const IconJacket = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 3.5 4.5 6 3 20h4l.5-9V21h9v-10l.5 9h4L19.5 6 15 3.5 12 7z" /><path d="M12 7v14" /></svg>
);
export const IconShoe = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 16.5V9.5l3 .5 2-2 3 3.5c2 1.5 5.5 1.6 8 2.2 1.4.4 2 1.3 2 2.8v.5H3z" /><path d="M3 18.5h18" /></svg>
);
export const IconBag = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></svg>
);
