import { useId } from "react";

/**
 * PARALL / 01 wordmark — original vector letterforms (no font file).
 * Geometric, extended, monoline: open-bowl P/R, crossbar-less Λ, long-based L,
 * coral slash, stadium "0". Every glyph is its own path (pathLength = 1) so the
 * prologue can draw it stroke by stroke.
 *
 * Coordinates: cap height 40 units, stroke 3.2 units, baseline y = 40.
 */
const SW = 3.2;
const H = SW / 2;

const GLYPHS: { d: string; kind: "letter" | "slash" | "num" }[] = [
  // P
  { d: `M${H} 40 V${H} H20 A9.2 9.2 0 0 1 29.2 10.8 V12.4 A9.2 9.2 0 0 1 20 21.6 H${H}`, kind: "letter" },
  // Λ (A)
  { d: `M41 40 L60.2 ${H} L79.4 40`, kind: "letter" },
  // R
  { d: `M${90 + H} 40 V${H} H110 A9.2 9.2 0 0 1 119.2 10.8 V12.4 A9.2 9.2 0 0 1 110 21.6 H${90 + H} M106.5 21.6 L121.2 40`, kind: "letter" },
  // Λ (A)
  { d: `M131 40 L150.2 ${H} L169.4 40`, kind: "letter" },
  // L
  { d: `M${181 + H} 0 V${40 - H} H212`, kind: "letter" },
  // L
  { d: `M${221 + H} 0 V${40 - H} H252`, kind: "letter" },
  // slash
  { d: "M272 44 L287.5 -4", kind: "slash" },
  // 0 (stadium)
  { d: `M317 ${H} H318.4 A10.4 10.4 0 0 1 328.8 12 V28 A10.4 10.4 0 0 1 318.4 ${40 - H} H317 A10.4 10.4 0 0 1 306.6 28 V12 A10.4 10.4 0 0 1 317 ${H} Z`, kind: "num" },
  // 1
  { d: `M339.5 7.5 L347 ${H} V40`, kind: "num" },
];

export const WORDMARK_VIEWBOX = "-3 -7 356 54";

export function Wordmark({
  className = "",
  subtitle,
  variant = "plain",
  title = "PARALL / 01",
}: {
  className?: string;
  /** e.g. "AI SMART EYEWEAR" — shown under the mark in full lockups */
  subtitle?: string;
  /** "plain" uses currentColor; "titanium" uses a brushed-metal gradient (prologue) */
  variant?: "plain" | "titanium";
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const grad = `wm-ti-${uid}`;
  const mask = `wm-mask-${uid}`;
  const sweep = `wm-sweep-${uid}`;
  const stroke = variant === "titanium" ? `url(#${grad})` : "currentColor";
  return (
    <span className={`wm wm--${variant} ${className}`} translate="no">
      <svg className="wm__svg" viewBox={WORDMARK_VIEWBOX} role="img" aria-label={title} focusable="false">
        {variant === "titanium" && (
          <defs>
            <linearGradient id={grad} x1="0" y1="-6" x2="0" y2="46" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#F3F1EB" />
              <stop offset="0.45" stopColor="#BFC7D1" />
              <stop offset="0.55" stopColor="#8E97A3" />
              <stop offset="1" stopColor="#E4E8EE" />
            </linearGradient>
            <linearGradient id={sweep} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#8FE7FF" stopOpacity="0" />
              <stop offset="0.45" stopColor="#8FE7FF" stopOpacity="0.85" />
              <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="1" />
              <stop offset="0.55" stopColor="#8FE7FF" stopOpacity="0.85" />
              <stop offset="1" stopColor="#8FE7FF" stopOpacity="0" />
            </linearGradient>
            <mask id={mask} maskUnits="userSpaceOnUse" x="-10" y="-10" width="380" height="70">
              {GLYPHS.filter((g) => g.kind !== "slash").map((g, i) => (
                <path key={i} d={g.d} fill="none" stroke="#fff" strokeWidth={SW + 0.6} />
              ))}
            </mask>
          </defs>
        )}
        <g fill="none" strokeWidth={SW} strokeLinejoin="miter" strokeMiterlimit={10}>
          {GLYPHS.map((g, i) => (
            <path
              key={i}
              d={g.d}
              pathLength={1}
              className={`wm__glyph wm__glyph--${g.kind}`}
              stroke={g.kind === "slash" ? "#FF5B43" : stroke}
              style={{ "--i": i } as React.CSSProperties}
            />
          ))}
        </g>
        {variant === "titanium" && (
          <g mask={`url(#${mask})`} className="wm__sweep" aria-hidden>
            <rect x="-120" y="-8" width="110" height="60" fill={`url(#${sweep})`} />
          </g>
        )}
      </svg>
      {subtitle && (
        <span className="wm__sub" aria-hidden>
          {subtitle}
        </span>
      )}
    </span>
  );
}
