import { useId } from "react";
import { colorDef } from "@/lib/taxonomy";
import type { Category } from "@/lib/types";

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

type Kind =
  | "tee" | "long" | "shirt" | "hood" | "tank"
  | "pants" | "wide" | "shorts" | "skirt"
  | "jacket" | "coat" | "puffer"
  | "sneaker" | "loafer" | "boot" | "sandal"
  | "cap" | "bag" | "belt" | "watch" | "misc";

function kindOf(category: Category, sub: string, fit?: string | null): Kind {
  const s = sub ?? "";
  if (category === "top") {
    if (/반팔|폴로/.test(s)) return "tee";
    if (/민소매/.test(s)) return "tank";
    if (/셔츠/.test(s) && !/스웨트/.test(s)) return "shirt";
    if (/후드/.test(s)) return "hood";
    return "long";
  }
  if (category === "bottom") {
    if (/쇼츠|반바지/.test(s)) return "shorts";
    if (/스커트/.test(s)) return "skirt";
    if (/와이드|카고/.test(s) || fit === "wide" || fit === "relaxed" || fit === "oversized") return "wide";
    return "pants";
  }
  if (category === "outer") {
    if (/코트/.test(s)) return "coat";
    if (/패딩/.test(s)) return "puffer";
    return "jacket";
  }
  if (category === "shoes") {
    if (/로퍼|더비/.test(s)) return "loafer";
    if (/부츠/.test(s)) return "boot";
    if (/샌들|슬리퍼/.test(s)) return "sandal";
    return "sneaker";
  }
  if (category === "acc") {
    if (/모자/.test(s)) return "cap";
    if (/가방/.test(s)) return "bag";
    if (/벨트/.test(s)) return "belt";
    if (/시계/.test(s)) return "watch";
    return "misc";
  }
  return "long";
}

/** Tight bounds per silhouette (after the +4 y offset) — used when the glyph is placed on the mannequin. */
const TIGHT: Record<Kind, string> = {
  tee: "11 25 78 83", long: "9 25 82 83", shirt: "9 25 82 83", hood: "9 9 82 99", tank: "29 23 42 84",
  jacket: "9 23 82 81", coat: "9 19 82 108", puffer: "7 21 86 89",
  pants: "28 17 44 104", wide: "19 17 62 104", shorts: "23 33 54 56", skirt: "19 29 62 74",
  sneaker: "13 43 78 44", loafer: "11 53 80 34", boot: "21 33 70 58", sandal: "13 51 78 34",
  cap: "23 37 74 44", bag: "17 23 66 90", belt: "7 54 86 20", watch: "34 23 32 86", misc: "25 39 50 58",
};

/** Flat-lay silhouette — only for items without any photo (demo data). */
export function GarmentGlyph({
  category,
  subcategory,
  color,
  pattern,
  fit,
  className,
  tight = false,
  align = "center",
}: {
  category: Category;
  subcategory: string;
  color: string;
  pattern?: string;
  fit?: string | null;
  className?: string;
  tight?: boolean;
  align?: "top" | "bottom" | "center";
}) {
  const pid = useId().replace(/:/g, "");
  const c = colorDef(color);
  const light = ["white", "ivory", "beige", "lightblue", "skyblue", "yellow", "pink"].includes(c.key);
  const stroke = shade(c.hex, light ? -60 : -35);
  const detail = shade(c.hex, light ? -38 : 32);
  const k = kindOf(category, subcategory, fit);
  const fill = pattern === "stripe" ? `url(#s${pid})` : pattern === "check" ? `url(#c${pid})` : c.hex;
  const P = { fill, stroke, strokeWidth: 1.2, strokeLinejoin: "round" as const };
  const D = { fill: "none", stroke: detail, strokeWidth: 1, strokeLinecap: "round" as const };

  return (
    <svg
      viewBox={tight ? TIGHT[k] : "0 0 100 125"}
      preserveAspectRatio={`xMidY${align === "top" ? "Min" : align === "bottom" ? "Max" : "Mid"} meet`}
      className={className}
      aria-hidden
    >
      <defs>
        <pattern id={`s${pid}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill={c.hex} />
          <rect width="6" height="2.2" fill={shade(c.hex, 70)} />
        </pattern>
        <pattern id={`c${pid}`} width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill={c.hex} />
          <rect width="10" height="3" fill={shade(c.hex, -30)} opacity="0.6" />
          <rect width="3" height="10" fill={shade(c.hex, -30)} opacity="0.6" />
        </pattern>
      </defs>
      <g transform="translate(0,4)">
        {k === "tee" && (
          <>
            <path {...P} d="M36 22 L22 28 L12 46 L25 52 L31 42 L31 102 L69 102 L69 42 L75 52 L88 46 L78 28 L64 22 Q50 32 36 22Z" />
            <path {...D} d="M40 23.5 Q50 30 60 23.5" />
          </>
        )}
        {k === "tank" && <path {...P} d="M37 20 Q35 36 30 44 L30 102 L70 102 L70 44 Q65 36 63 20 Q50 34 37 20Z" />}
        {(k === "long" || k === "shirt" || k === "hood") && (
          <>
            <path {...P} d="M36 22 L22 27 L14 60 L10 98 L20 100 L27 64 L31 48 L31 102 L69 102 L69 48 L73 64 L80 100 L90 98 L86 60 L78 27 L64 22 Q50 30 36 22Z" />
            {k === "shirt" && (
              <>
                <path {...P} d="M36 22 L50 34 L44 40 L39 26Z M64 22 L50 34 L56 40 L61 26Z" />
                <path {...D} d="M50 34 L50 100" />
                {[46, 58, 70, 82, 94].map((y) => (
                  <circle key={y} cx="53" cy={y} r="0.9" fill={detail} />
                ))}
              </>
            )}
            {k === "hood" && (
              <>
                <path {...P} d="M38 23 Q36 8 50 6 Q64 8 62 23 Q50 30 38 23Z" />
                <path {...D} d="M38 80 L62 80 L60 92 L40 92Z" />
              </>
            )}
            {k === "long" && <path {...D} d="M40 23.5 Q50 30 60 23.5 M31 98 L69 98 M14 96 L21 97 M86 96 L79 97" />}
          </>
        )}
        {k === "jacket" && (
          <>
            <path {...P} d="M35 20 L20 26 L13 60 L10 96 L20 98 L27 62 L31 46 L30 100 L70 100 L69 46 L73 62 L80 98 L90 96 L87 60 L80 26 L65 20 Q50 26 35 20Z" />
            <path {...D} d="M50 25 L50 100 M35 20 L45 34 M65 20 L55 34 M31 94 L69 94" />
            <path {...D} d="M36 70 L44 70 M56 70 L64 70" />
          </>
        )}
        {k === "coat" && (
          <>
            <path {...P} d="M35 16 L20 22 L13 58 L10 100 L20 102 L27 60 L31 44 L29 118 L71 118 L69 44 L73 60 L80 102 L90 100 L87 58 L80 22 L65 16 Q50 22 35 16Z" />
            <path {...D} d="M50 22 L50 118 M35 16 L46 44 L50 40 M65 16 L54 44 L50 40" />
            <circle cx="46" cy="64" r="1.3" fill={detail} />
            <circle cx="46" cy="80" r="1.3" fill={detail} />
          </>
        )}
        {k === "puffer" && (
          <>
            <path {...P} d="M34 18 L18 26 L10 62 L8 96 L22 98 L28 64 L30 48 L28 104 L72 104 L70 48 L72 64 L78 98 L92 96 L90 62 L82 26 L66 18 Q50 24 34 18Z" />
            <path {...D} d="M50 22 L50 104 M29 40 L71 40 M29 56 L71 56 M29 72 L71 72 M29 88 L71 88" />
          </>
        )}
        {(k === "pants" || k === "wide") && (
          <>
            <path
              {...P}
              d={
                k === "wide"
                  ? "M30 14 L70 14 L74 44 L80 116 L56 116 L50 48 L44 116 L20 116 L26 44Z"
                  : "M32 14 L68 14 L71 44 L69 116 L54 116 L50 50 L46 116 L31 116 L29 44Z"
              }
            />
            <path {...D} d="M30 21 L70 21 M50 21 L50 40" />
            <path {...D} d="M36 21 Q36 30 30 32 M64 21 Q64 30 70 32" />
          </>
        )}
        {k === "shorts" && (
          <>
            <path {...P} d="M30 30 L70 30 L76 80 L54 84 L50 58 L46 84 L24 80Z" />
            <path {...D} d="M30 37 L70 37 M50 37 L50 52" />
          </>
        )}
        {k === "skirt" && (
          <>
            <path {...P} d="M34 26 L66 26 L80 98 L20 98Z" />
            <path {...D} d="M34 33 L66 33" />
          </>
        )}
        {k === "sneaker" && (
          <>
            <path {...P} d="M14 68 L16 50 Q24 50 30 44 L42 40 Q52 48 64 54 L84 60 Q90 64 88 72 L88 76 L14 76Z" />
            <path fill={light ? shade(c.hex, -25) : "#f2f0ea"} stroke={stroke} strokeWidth={1.2} d="M14 72 L88 72 L88 80 Q86 82 80 82 L18 82 Q14 82 14 78Z" />
            <path {...D} d="M40 46 L48 54 M44 44 L52 52 M48 42 L56 50 M24 58 Q34 60 40 66" />
          </>
        )}
        {k === "loafer" && (
          <>
            <path {...P} d="M12 72 Q12 58 22 56 L44 54 Q58 50 72 56 Q88 60 90 70 L90 78 L12 78Z" />
            <path fill={shade(c.hex, -20)} stroke={stroke} strokeWidth={1} d="M12 78 L90 78 L90 82 L12 82Z" />
            <path {...D} d="M46 57 Q60 54 70 60 M50 62 L64 62" />
          </>
        )}
        {k === "boot" && (
          <>
            <path {...P} d="M26 30 L50 30 L52 58 Q64 60 80 64 Q90 68 90 76 L90 82 L22 82 L22 60Z" />
            <path fill={shade(c.hex, -25)} stroke={stroke} strokeWidth={1} d="M22 82 L90 82 L90 86 L22 86Z" />
            <path {...D} d="M40 36 L46 36 M40 44 L46 44 M40 52 L46 52" />
          </>
        )}
        {k === "sandal" && (
          <>
            <path {...P} d="M14 74 Q14 66 26 66 L80 66 Q90 66 90 74 L90 80 L14 80Z" />
            <path {...D} strokeWidth={3} stroke={shade(c.hex, -30)} d="M30 66 Q40 48 56 66 M58 66 Q66 52 76 66" />
          </>
        )}
        {k === "cap" && (
          <>
            <path {...P} d="M24 70 Q24 36 52 34 Q78 36 78 66 L78 70Z" />
            <path {...P} d="M70 66 Q92 64 96 72 Q84 76 70 72Z" />
            <path {...D} d="M52 34 L52 70 M38 40 Q34 54 36 70" />
            <circle cx="52" cy="34" r="2" fill={detail} />
          </>
        )}
        {k === "bag" && (
          <>
            <path {...P} d="M22 50 L78 50 L82 108 L18 108Z" />
            <path fill="none" stroke={stroke} strokeWidth={3} d="M36 50 Q36 20 50 20 Q64 20 64 50" />
          </>
        )}
        {k === "belt" && (
          <>
            <rect {...P} x="8" y="54" width="84" height="12" rx="2" />
            <rect fill="none" stroke={detail} strokeWidth={2} x="62" y="51" width="12" height="18" rx="2" />
          </>
        )}
        {k === "watch" && (
          <>
            <rect {...P} x="42" y="20" width="16" height="84" rx="4" />
            <circle fill="#f4f2ec" stroke={stroke} strokeWidth={2} cx="50" cy="62" r="15" />
            <path stroke={stroke} strokeWidth={1.2} d="M50 62 L50 53 M50 62 L56 65" />
          </>
        )}
        {k === "misc" && <rect {...P} x="26" y="36" width="48" height="56" rx="10" />}
      </g>
    </svg>
  );
}
