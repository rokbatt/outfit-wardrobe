import { useId } from "react";
import { BODY_SCALE } from "@/lib/mannequin";
import type { Body } from "@/lib/types";

/**
 * Showroom mannequin — front, neutral pose, faceless, matte white.
 * Drawn in a 400 × 1000 coordinate space; garment anchor zones (lib/mannequin.ts) use the same space.
 */
export function Mannequin({ body = "standard", className = "" }: { body?: Body; className?: string }) {
  const k = BODY_SCALE[body];
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (n: string) => `${n}-${u}`;
  const wide = `translate(200 0) scale(${k} 1) translate(-200 0)`;
  return (
    <svg viewBox="0 0 400 1000" className={className} aria-hidden preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={id("mq-skin")} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#e3e3e1" />
          <stop offset="0.38" stopColor="#f7f7f6" />
          <stop offset="0.62" stopColor="#f4f4f3" />
          <stop offset="1" stopColor="#dededc" />
        </linearGradient>
        <linearGradient id={id("mq-limb")} x1="0" x2="1">
          <stop offset="0" stopColor="#e0e0de" />
          <stop offset="0.5" stopColor="#f6f6f5" />
          <stop offset="1" stopColor="#dcdcda" />
        </linearGradient>
        <radialGradient id={id("mq-head")} cx="0.42" cy="0.38" r="0.7">
          <stop offset="0" stopColor="#fbfbfa" />
          <stop offset="0.7" stopColor="#ededec" />
          <stop offset="1" stopColor="#d9d9d7" />
        </radialGradient>
        <radialGradient id={id("mq-floor")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.16" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="200" cy="982" rx="118" ry="13" fill={`url(#${id("mq-floor")})`} />

      <g stroke="#d2d2cf" strokeWidth="0.9" strokeLinejoin="round">
        {/* arms (A-pose, slightly away from the body so sleeves read) */}
        <g transform={wide}>
          <path
            fill={`url(#${id("mq-limb")})`}
            d="M118 194 C100 200 92 226 90 268 C86 340 80 430 74 530 C73 546 74 556 78 562 L94 562 C96 552 97 540 99 526 C106 440 113 352 122 282 C126 250 128 214 118 194 Z"
          />
          <path fill={`url(#${id("mq-limb")})`} d="M78 560 C70 574 68 598 74 616 C78 626 88 628 93 618 C98 602 98 578 95 561 Z" />
          <g transform="translate(400 0) scale(-1 1)">
            <path
              fill={`url(#${id("mq-limb")})`}
              d="M118 194 C100 200 92 226 90 268 C86 340 80 430 74 530 C73 546 74 556 78 562 L94 562 C96 552 97 540 99 526 C106 440 113 352 122 282 C126 250 128 214 118 194 Z"
            />
            <path fill={`url(#${id("mq-limb")})`} d="M78 560 C70 574 68 598 74 616 C78 626 88 628 93 618 C98 602 98 578 95 561 Z" />
          </g>
        </g>

        {/* legs */}
        <g transform={wide}>
          <path
            fill={`url(#${id("mq-limb")})`}
            d="M128 508 C124 596 134 690 144 760 C150 822 156 884 160 936 L190 936 C192 884 194 822 196 760 C198 690 199 612 200 552 Z"
          />
          <path fill={`url(#${id("mq-limb")})`} d="M158 934 C152 948 148 964 151 976 L197 976 C199 962 196 946 191 934 Z" />
          <g transform="translate(400 0) scale(-1 1)">
            <path
              fill={`url(#${id("mq-limb")})`}
              d="M128 508 C124 596 134 690 144 760 C150 822 156 884 160 936 L190 936 C192 884 194 822 196 760 C198 690 199 612 200 552 Z"
            />
            <path fill={`url(#${id("mq-limb")})`} d="M158 934 C152 948 148 964 151 976 L197 976 C199 962 196 946 191 934 Z" />
          </g>
          {/* knee hint */}
          <path fill="none" stroke="#e1e1de" d="M150 768 q14 6 28 0 M222 768 q14 6 28 0" />
        </g>

        {/* torso */}
        <g transform={wide}>
          <path
            fill={`url(#${id("mq-skin")})`}
            d="M176 160 C150 166 126 173 115 194 C108 212 112 250 120 290 C128 340 134 390 136 430 C138 462 128 492 126 522 C150 540 176 552 200 556 C224 552 250 540 274 522 C272 492 262 462 264 430 C266 390 272 340 280 290 C288 250 292 212 285 194 C274 173 250 166 224 160 Z"
          />
          {/* subtle anatomy lines */}
          <path fill="none" stroke="#e4e4e1" d="M150 300 q50 22 100 0 M200 330 v110 M140 432 q60 16 120 0" />
        </g>

        {/* neck + head */}
        <path fill={`url(#${id("mq-limb")})`} d="M183 118 C184 134 183 150 178 164 C192 170 208 170 222 164 C217 150 216 134 217 118 Z" />
        <ellipse cx="200" cy="76" rx="39" ry="51" fill={`url(#${id("mq-head")})`} />
        <path fill="none" stroke="#e2e2df" d="M178 164 q22 8 44 0" />
      </g>
    </svg>
  );
}
