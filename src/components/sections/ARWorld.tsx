/**
 * Original, authored architectural plaza for the AR concept view (pure SVG:
 * no photos, no external assets). Two instances are rendered on top of each
 * other: the clean "normal" view and the "PARALL" view, which adds the spatial
 * layer (surface mesh, scan, route, tracking brackets, translated sign, cards).
 *
 * Geometry is a one-point perspective around VP. Every receding element is a
 * plane at a lateral offset L with heights (up, down) scaled by depth d:
 *   x = VP.x − L·d,  y_top = VP.y − up·d,  y_bottom = VP.y + down·d
 * Layers carry `data-depth` (px of parallax at full pointer deflection); the
 * parent drives them imperatively, so nothing here re-renders on pointer move.
 */
import { memo } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

const VP = { x: 760, y: 455 };
const UP = 415;
const DOWN = 475;
const px = (L: number, d: number) => VP.x - L * d;
const top = (d: number) => VP.y - UP * d;
const bot = (d: number) => VP.y + DOWN * d;
const f = (n: number) => n.toFixed(1);

/** colonnade depths (near → far) */
const DEPTHS = Array.from({ length: 9 }, (_, k) => 1 / (1 + k * 0.55));
const COL_L = 800; // column line
const WALL_L = 1150; // arcade back wall

function colonnade(fill: string) {
  const cols: React.ReactElement[] = [];
  const shadows: string[] = [];
  const arches: string[] = [];
  DEPTHS.forEach((d, k) => {
    const x = px(COL_L, d);
    const t = top(d);
    const b = bot(d);
    const w = 66 * d;
    const cap = 14 * d;
    cols.push(
      <g key={k}>
        {/* shaft with cylindrical shading */}
        <rect x={f(x - w / 2)} y={f(t + cap)} width={f(w)} height={f(b - t - cap * 2)} fill={fill} />
        {/* capital + base */}
        <rect x={f(x - w * 0.68)} y={f(t)} width={f(w * 1.36)} height={f(cap)} fill="#e9e7e0" />
        <rect x={f(x - w * 0.68)} y={f(b - cap)} width={f(w * 1.36)} height={f(cap)} fill="#d6d5cd" />
        <rect x={f(x - w * 0.68)} y={f(t + cap - 2 * d)} width={f(w * 1.36)} height={f(2 * d)} fill="#b9bbb4" opacity="0.6" />
      </g>,
    );
    // soft cast shadow on the paving (sun high on the right)
    shadows.push(
      `M${f(x - w / 2)} ${f(b)} L${f(x + w / 2)} ${f(b)} L${f(x + w / 2 - 150 * d)} ${f(b + 46 * d)} L${f(x - w / 2 - 210 * d)} ${f(b + 46 * d)} z`,
    );
    const next = DEPTHS[k + 1];
    if (next) {
      const nx = px(COL_L, next);
      const sy = t + (b - t) * 0.3;
      const nsy = top(next) + (bot(next) - top(next)) * 0.3;
      arches.push(`M${f(x + w * 0.5)} ${f(sy)} Q ${f((x + nx) / 2)} ${f((t + top(next)) / 2 + 4 * d)} ${f(nx - 33 * next)} ${f(nsy)}`);
    }
  });
  return { cols, shadows: shadows.join(" "), arches: arches.join(" ") };
}

/** arched doorways receding along the back wall */
function wallOpenings(fill: string) {
  return [0.92, 0.66, 0.5, 0.4, 0.33, 0.28, 0.245].map((d, i) => {
    const x = px(WALL_L, d);
    const w = 120 * d;
    const b = bot(d);
    const h = (bot(d) - top(d)) * 0.56;
    const yTop = b - h;
    const arch = `M${f(x - w / 2)} ${f(b)} V${f(yTop + w * 0.5)} Q${f(x - w / 2)} ${f(yTop)} ${f(x)} ${f(yTop)} Q${f(x + w / 2)} ${f(yTop)} ${f(x + w / 2)} ${f(yTop + w * 0.5)} V${f(b)}`;
    return (
      <g key={i}>
        {/* shaded opening into the arcade interior, with a lit stone reveal */}
        <path d={`${arch} z`} fill={fill} />
        <path d={arch} fill="none" stroke="#f1f0ea" strokeWidth={f(5 * d)} opacity="0.9" />
        <path d={`M${f(x - w / 2)} ${f(b)} H${f(x + w / 2)}`} stroke="#9aa39d" strokeWidth={f(3 * d)} />
      </g>
    );
  });
}

function paving() {
  const lines: string[] = [];
  for (let i = -10; i <= 14; i++) lines.push(`M${VP.x} ${VP.y} L${VP.x + i * 140} 905`);
  for (let j = 1; j < 10; j++) {
    const y = VP.y + (905 - VP.y) * Math.pow(j / 10, 1.85);
    lines.push(`M-60 ${f(y)} L1660 ${f(y)}`);
  }
  return lines.join(" ");
}

/** distant skyline with window rhythm (no flat blocks) */
const TOWERS = [
  { x: 640, w: 54, h: 150 },
  { x: 700, w: 40, h: 210 },
  { x: 745, w: 62, h: 120 },
  { x: 812, w: 46, h: 250 },
  { x: 862, w: 70, h: 170 },
  { x: 936, w: 38, h: 230 },
  { x: 978, w: 60, h: 140 },
];

/* ---- PARALL route (cubic Bézier on the paving) ---- */
const R = [
  [700, 905],
  [770, 728],
  [920, 650],
  [1205, 560],
] as const;
const ROUTE = `M${R[0][0]} ${R[0][1]} C ${R[1][0]} ${R[1][1]}, ${R[2][0]} ${R[2][1]}, ${R[3][0]} ${R[3][1]}`;
function bez(t: number): { x: number; y: number; a: number } {
  const m = 1 - t;
  const x = m * m * m * R[0][0] + 3 * m * m * t * R[1][0] + 3 * m * t * t * R[2][0] + t * t * t * R[3][0];
  const y = m * m * m * R[0][1] + 3 * m * m * t * R[1][1] + 3 * m * t * t * R[2][1] + t * t * t * R[3][1];
  const dx = 3 * m * m * (R[1][0] - R[0][0]) + 6 * m * t * (R[2][0] - R[1][0]) + 3 * t * t * (R[3][0] - R[2][0]);
  const dy = 3 * m * m * (R[1][1] - R[0][1]) + 6 * m * t * (R[2][1] - R[1][1]) + 3 * t * t * (R[3][1] - R[2][1]);
  return { x, y, a: (Math.atan2(dy, dx) * 180) / Math.PI };
}
const CHEVRONS = [0.2, 0.36, 0.5, 0.63, 0.75, 0.86].map((t) => {
  const p = bez(t);
  return { ...p, s: 0.45 + ((p.y - VP.y) / 450) * 0.9 };
});
const ROUTE_ANCHOR = bez(0.58);

/* ---- pavilion entrance, drawn in the glass facade's own perspective ----
 * The facade quad runs from x 1040 to 1610: top edge y = 268 → 104, base y = 546 → 838.
 * A point on the facade is (x, f): f = 0 at the top edge, 1 at the base. Lines of constant
 * f follow the facade's perspective, so the doorway sits IN the wall, not on top of it.
 * The door threshold is at f 0.75 (where the route and destination ring already end);
 * a short flight of steps takes it down to the base line. */
const FAC = { x0: 1040, top0: 268, topK: -0.2877, base0: 546, baseK: 0.5123 };
const fy = (x: number, k: number) => {
  const top = FAC.top0 + (x - FAC.x0) * FAC.topK;
  const base = FAC.base0 + (x - FAC.x0) * FAC.baseK;
  return top + k * (base - top);
};
/** quad on the facade between x0..x1 and heights f0..f1 (optionally sheared toward the plaza) */
const fq = (x0: number, x1: number, f0: number, f1: number, dx0 = 0, dx1 = 0) =>
  `M${f(x0 + dx0)} ${f(fy(x0, f0))} L${f(x1 + dx0)} ${f(fy(x1, f0))} L${f(x1 + dx1)} ${f(fy(x1, f1))} L${f(x0 + dx1)} ${f(fy(x0, f1))} z`;
const DOOR = { l: 1180, r: 1292, top: 0.43, sill: 0.75 };
/** screen bounds of the whole entrance (portal + steps), for the tracking frame */
const ENTRANCE_BOX = { x0: 1158, y0: Math.floor(fy(1166, 0.4)) - 10, x1: 1314, y1: Math.ceil(fy(1306, 0.96)) + 6 };

function Entrance({ id }: { id: (s: string) => string }) {
  const { l, r, top, sill } = DOOR;
  const mid = (l + r) / 2;
  return (
    <g className="ar-entrance">
      {/* soft shadow the portal casts on the glass */}
      <path d={fq(l - 14, r + 18, 0.405, sill + 0.02)} fill="#5d7277" opacity="0.18" />
      {/* stone portal + canopy */}
      <path d={fq(l - 10, r + 10, 0.415, sill)} fill={`url(#${id("portal")})`} />
      <path d={fq(l - 16, r + 16, 0.398, 0.418, -2, -2)} fill="#f2f1ec" />
      <path d={fq(l - 16, r + 16, 0.418, 0.424, -2, -2)} fill="#a9b0ac" opacity="0.8" />
      {/* recess: deep interior, warm light from inside */}
      <path d={fq(l, r, top, sill)} fill={`url(#${id("doorIn")})`} />
      <path d={fq(l + 14, r - 6, top + 0.12, sill)} fill={`url(#${id("doorGlow")})`} />
      {/* visible jamb (the reveal on the vanishing-point side) and the lit soffit */}
      <path d={`M${l} ${f(fy(l, top))} L${l + 12} ${f(fy(l + 12, top) + 4)} L${l + 12} ${f(fy(l + 12, sill) - 3)} L${l} ${f(fy(l, sill))} z`} fill="#c9cecb" />
      <path d={`M${l} ${f(fy(l, top))} L${r} ${f(fy(r, top))} L${r - 2} ${f(fy(r - 2, top) + 6)} L${l + 12} ${f(fy(l + 12, top) + 4)} z`} fill="#9ea8a6" />
      {/* glass double doors with slim dark frames */}
      {[
        [l + 14, mid - 1],
        [mid + 1, r - 5],
      ].map(([a, b], i) => (
        <g key={i}>
          <path d={fq(a, b, top + 0.025, sill - 0.004)} fill={`url(#${id("doorGlass")})`} stroke="#26343a" strokeWidth="2.2" strokeLinejoin="round" />
          <path d={fq(a + 4, b - 4, top + 0.045, sill - 0.02)} fill="none" stroke="#e8eeee" strokeWidth="0.8" opacity="0.35" />
        </g>
      ))}
      {/* pull handles */}
      <path d={`M${mid - 6} ${f(fy(mid - 6, 0.57))} L${mid - 6} ${f(fy(mid - 6, 0.65))} M${mid + 6} ${f(fy(mid + 6, 0.57))} L${mid + 6} ${f(fy(mid + 6, 0.65))}`} stroke="#e4e7e2" strokeWidth="2.4" strokeLinecap="round" />
      {/* one diagonal reflection across both leaves */}
      <path d={`M${l + 22} ${f(fy(l + 22, top + 0.05))} L${l + 44} ${f(fy(l + 44, top + 0.05))} L${r - 30} ${f(fy(r - 30, sill - 0.05))} L${r - 52} ${f(fy(r - 52, sill - 0.05))} z`} fill="#ffffff" opacity="0.13" />
      {/* threshold + three steps down to the base line (each tread steps out toward the plaza) */}
      <path d={fq(l - 10, r + 10, sill, sill + 0.012)} fill="#eceae3" />
      {[0, 1, 2].map((k) => {
        const f0 = sill + 0.012 + k * 0.075;
        const f1 = f0 + 0.075;
        const out = (k + 1) * 7;
        return (
          <g key={k}>
            {/* tread */}
            <path d={fq(l - 14 - k * 6, r + 14 + k * 6, f0, f0 + 0.022, -out + 7, -out)} fill="#f0eee8" />
            {/* riser */}
            <path d={fq(l - 14 - k * 6, r + 14 + k * 6, f0 + 0.022, f1, -out, -out)} fill="#cfd1ca" />
          </g>
        );
      })}
    </g>
  );
}

/** corner brackets around a box */
function brackets(x0: number, y0: number, x1: number, y1: number, c = 16): string {
  return `M${x0} ${y0 + c} V${y0} H${x0 + c} M${x1 - c} ${y0} H${x1} V${y0 + c} M${x1} ${y1 - c} V${y1} H${x1 - c} M${x0 + c} ${y1} H${x0} V${y1 - c}`;
}

function Kicker({ icon, label }: { icon: "pin" | "route"; label: string }) {
  return (
    <span className="ar-card__k">
      <svg viewBox="0 0 16 16" aria-hidden width="14" height="14">
        {icon === "pin" ? (
          <path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 3.4-4.5 8.5-4.5 8.5S3.5 9.4 3.5 6A4.5 4.5 0 0 1 8 1.5Zm0 2.7a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z" fill="currentColor" />
        ) : (
          <path d="M3 13c3-1 4-4 6-6l2-2M8.5 4.5H11.5V7.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      {label}
    </span>
  );
}

function ARWorldBase({ mode, t, rtl = false }: { mode: "normal" | "parall"; t: Dictionary["ar"]; rtl?: boolean }) {
  const id = (s: string) => `${s}-${mode}`;
  const parall = mode === "parall";
  const { cols, shadows, arches } = colonnade(`url(#${id("col")})`);
  const flip = rtl ? "matrix(-1 0 0 1 1600 0)" : undefined;

  return (
    <svg className="ar-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      <defs>
        <linearGradient id={id("sky")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dcebe8" />
          <stop offset="0.5" stopColor="#f1f1ec" />
          <stop offset="1" stopColor="#e4ebe7" />
        </linearGradient>
        <radialGradient id={id("sun")} cx="0.66" cy="0.28" r="0.55">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("col")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c9cbc4" />
          <stop offset="0.28" stopColor="#f7f5f0" />
          <stop offset="0.7" stopColor="#dedcd5" />
          <stop offset="1" stopColor="#b3b7b1" />
        </linearGradient>
        <linearGradient id={id("wall")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#cfcfc6" />
          <stop offset="1" stopColor="#e2e2da" />
        </linearGradient>
        <linearGradient id={id("door")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8d9894" />
          <stop offset="0.6" stopColor="#a7b0ab" />
          <stop offset="1" stopColor="#c2c8c3" />
        </linearGradient>
        <linearGradient id={id("ceil")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#cfd0c9" />
          <stop offset="1" stopColor="#e7e6df" />
        </linearGradient>
        <linearGradient id={id("portal")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e4e3dc" />
          <stop offset="1" stopColor="#d2d3cc" />
        </linearGradient>
        <linearGradient id={id("doorIn")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d2b30" />
          <stop offset="0.7" stopColor="#33464a" />
          <stop offset="1" stopColor="#4a5c5d" />
        </linearGradient>
        <radialGradient id={id("doorGlow")} cx="0.45" cy="0.85" r="0.75">
          <stop offset="0" stopColor="#f4dfb4" stopOpacity="0.7" />
          <stop offset="1" stopColor="#f4dfb4" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("doorGlass")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8aa4a8" stopOpacity="0.38" />
          <stop offset="0.6" stopColor="#56707a" stopOpacity="0.2" />
          <stop offset="1" stopColor="#3a5058" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id={id("glass")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c6dbdc" />
          <stop offset="0.5" stopColor="#99b5b9" />
          <stop offset="1" stopColor="#7a9398" />
        </linearGradient>
        <linearGradient id={id("ground")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e7e9e3" />
          <stop offset="1" stopColor="#c4c9c1" />
        </linearGradient>
        <linearGradient id={id("haze")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.3" stopColor="#f4f3ee" stopOpacity="0" />
          <stop offset="0.5" stopColor="#f4f3ee" stopOpacity="0.55" />
          <stop offset="0.68" stopColor="#f4f3ee" stopOpacity="0" />
        </linearGradient>
        {parall && (
          <>
            <radialGradient id={id("meshMask")} gradientUnits="userSpaceOnUse" cx="960" cy="700" r="460">
              <stop offset="0" stopColor="#fff" stopOpacity="1" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <mask id={id("mesh")} maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="900">
              <rect width="1600" height="900" fill={`url(#${id("meshMask")})`} />
            </mask>
            <linearGradient id={id("scan")} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#8FE7FF" stopOpacity="0" />
              <stop offset="0.85" stopColor="#8FE7FF" stopOpacity="0.22" />
              <stop offset="1" stopColor="#8FE7FF" stopOpacity="0.55" />
            </linearGradient>
          </>
        )}
      </defs>

      {/* the scroll-linked camera push is a CSS transform on the <svg> itself (compositor) */}
      <g>
        {/* RTL: the plaza is mirrored so the overlay stays clear of the inline-start (right) title column */}
        <g transform={flip}>
          {/* sky */}
          <g className="ar-layer" data-depth="4">
            <rect x="-80" y="-80" width="1760" height="1060" fill={`url(#${id("sky")})`} />
            <rect x="-80" y="-80" width="1760" height="1060" fill={`url(#${id("sun")})`} />
          </g>

          {/* skyline on the horizon, framed between the arcade and the pavilion */}
          <g className="ar-layer" data-depth="9">
            {TOWERS.map((b, i) => (
              <g key={i} opacity={0.5 + (i % 3) * 0.12}>
                <rect x={b.x} y={VP.y - b.h} width={b.w} height={b.h} fill="#c6d4d1" />
                {Array.from({ length: Math.floor(b.h / 18) }, (_, r) => (
                  <rect key={r} x={b.x + 6} y={VP.y - b.h + 8 + r * 18} width={b.w - 12} height="3" fill="#e5edeb" opacity="0.7" />
                ))}
              </g>
            ))}
          </g>

          {/* plaza: floor, arcade, pavilion */}
          <g className="ar-layer" data-depth="18">
            <path d={`M-80 ${VP.y} H1680 V980 H-80 z`} fill={`url(#${id("ground")})`} />
            <path d={paving()} stroke="#b1b8b0" strokeWidth="1.1" fill="none" opacity="0.55" />
            <path d={shadows} fill="#7d857d" opacity="0.13" />

            {/* arcade: back wall with doorways, ceiling, entablature, columns */}
            <path d={`M${VP.x} ${VP.y} L${f(px(WALL_L, 1.3))} ${f(top(1.3))} L${f(px(WALL_L, 1.3))} ${f(bot(1.3))} z`} fill={`url(#${id("wall")})`} />
            {wallOpenings(`url(#${id("door")})`)}
            <path
              d={`M${VP.x} ${VP.y} L${f(px(COL_L, 1.3))} ${f(top(1.3))} L${f(px(WALL_L, 1.3))} ${f(top(1.3))} z`}
              fill={`url(#${id("ceil")})`}
            />
            <path
              d={`M${VP.x - 2} ${VP.y - 1} L${f(px(COL_L, 1.3))} ${f(top(1.3) - 78)} L${f(px(COL_L, 1.3))} ${f(top(1.3))} z`}
              fill="#ecebe5"
            />
            <path d={`M${VP.x - 2} ${VP.y - 1} L${f(px(COL_L, 1.3))} ${f(top(1.3))}`} stroke="#bfc1ba" strokeWidth="3" />
            {cols}
            <path d={arches} stroke="#cfd0c9" strokeWidth="4" fill="none" />

            {/* pavilion with glass facade (right) */}
            <path d="M1010 455 L1010 238 L1680 30 L1680 920 L1010 566 z" fill="#ebe8e0" />
            <path d="M1004 246 L1004 228 L1680 14 L1680 40 z" fill="#d9d7cf" />
            <path d="M1040 455 L1040 268 L1610 104 L1610 838 L1040 546 z" fill={`url(#${id("glass")})`} />
            {Array.from({ length: 9 }, (_, i) => {
              const tx = 1040 + i * 71;
              const tTop = 268 - (i * 164) / 8;
              const tBot = 546 + (i * 292) / 8;
              return <path key={i} d={`M${tx} ${f(tTop)} L${tx} ${f(tBot)}`} stroke="#e7eded" strokeWidth={1 + i * 0.3} opacity="0.8" />;
            })}
            <path d="M1040 372 L1610 322" stroke="#e7eded" strokeWidth="2" opacity="0.55" />
            {/* facade reflection on the paving */}
            <path d="M1010 566 L1680 920 L1680 960 L1010 600 z" fill="#9fb6b8" opacity="0.18" />
            {/* gallery entrance (route destination) */}
            <Entrance id={id} />
            {/* foreign-language wayfinding sign on the pavilion */}
            <g transform="translate(1310 300) skewY(-8)">
              <g transform={rtl ? "matrix(-1 0 0 1 150 0)" : undefined}>
                <rect width="150" height="58" rx="6" fill="#20302f" />
                <text x="75" y="26" textAnchor="middle" fill="#f3f1eb" fontSize="20" fontFamily="system-ui, sans-serif">
                  出口 · 3番線
                </text>
                <text x="75" y="46" textAnchor="middle" fill="#9fb9bc" fontSize="11" fontFamily="system-ui, sans-serif" letterSpacing="2">
                  ▶ ▶ ▶
                </text>
                {parall && (
                  // The whole sign treatment lives in the sign's own (skewed) plane, in its local
                  // 150 × 58 frame: tracking frame, label and translation share edges with the sign.
                  <g className="ar-sign">
                    <path className="ar-track ar-track--sign" data-link="sign" d={brackets(-10, -10, 160, 68, 13)} />
                    <foreignObject className="ar-tag-fo" x="-10" y="-44" width="260" height="28">
                      <div className="ar-tag ar-tag--plane">
                        {t.hud.trackSign} · {t.hud.xlate}
                      </div>
                    </foreignObject>
                    {/* opaque replacement, exactly over the original sign (same box, same radius) */}
                    <foreignObject className="ar-plate-fo" x="0" y="0" width="150" height="58">
                      <div className="ar-plate">
                        <strong>{t.hud.signText}</strong>
                        <span className="ar-plate__arrows" aria-hidden>
                          ▶ ▶ ▶
                        </span>
                      </div>
                    </foreignObject>
                  </g>
                )}
              </g>
            </g>
            {/* horizon haze for depth */}
            <rect x="-80" y="0" width="1760" height="900" fill={`url(#${id("haze")})`} />
          </g>

          {/* foreground planter */}
          <g className="ar-layer" data-depth="34">
            <ellipse cx="790" cy="930" rx="300" ry="34" fill="#8e978f" opacity="0.22" />
            <path d="M652 770 L928 770 L948 792 L632 792 z" fill="#f1efe8" />
            <rect x="632" y="792" width="316" height="150" fill="#e2dfd6" />
            <rect x="632" y="792" width="316" height="6" fill="#cfccc2" />
            <path d="M660 772 q34 -64 84 -30 q30 -74 88 -22 q46 -56 96 8 z" fill="#86a090" />
            <path d="M700 772 q30 -40 66 -18 q28 -46 64 -8 z" fill="#9cb5a5" />
          </g>

          {parall && (
            <g className="ar-overlay">
              <g className="ar-layer" data-depth="18">
                {/* spatial mesh on the walkable surface */}
                <g className="ar-mesh" mask={`url(#${id("mesh")})`}>
                  <path d={paving()} stroke="#8FE7FF" strokeWidth="1.2" fill="none" opacity="0.5" />
                </g>
                {/* route: soft glow, core, flowing dashes, chevrons, destination */}
                <path className="ar-route-glow" d={ROUTE} fill="none" stroke="#8FE7FF" strokeWidth="26" strokeLinecap="round" opacity="0.22" pathLength={1} />
                <path className="ar-route-core" d={ROUTE} fill="none" stroke="#8FE7FF" strokeWidth="7" strokeLinecap="round" pathLength={1} />
                <path className="ar-route-flow" d={ROUTE} fill="none" stroke="#0B0E14" strokeWidth="2.5" strokeDasharray="2 20" strokeLinecap="round" opacity="0.45" />
                {CHEVRONS.map((c, i) => (
                  <path
                    key={i}
                    className="ar-chev"
                    d="M-7 -9 L4 0 L-7 9"
                    transform={`translate(${f(c.x)} ${f(c.y)}) rotate(${f(c.a)}) scale(${f(c.s)})`}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                <g className="ar-dest" transform="translate(1236 566)">
                  <ellipse rx="46" ry="11" fill="none" stroke="#8FE7FF" strokeWidth="2.5" className="ar-pulse" />
                  <ellipse rx="26" ry="6" fill="#8FE7FF" opacity="0.55" />
                </g>

                {/* tracking brackets (recognised objects) */}
                <path className="ar-track ar-track--entrance" data-link="route" d={brackets(ENTRANCE_BOX.x0, ENTRANCE_BOX.y0, ENTRANCE_BOX.x1, ENTRANCE_BOX.y1)} />
                <path className="ar-track ar-track--arcade" data-link="arcade" d={brackets(498, 318, 622, 612)} />

                {/* leaders: card → object */}
                <path className="ar-leader" data-link="arcade" d="M500 500 H522" pathLength={1} />
                <circle className="ar-node" data-link="arcade" cx="522" cy="500" r="4" />
                <path className="ar-leader" data-link="route" d={`M890 592 L${f(ROUTE_ANCHOR.x)} ${f(ROUTE_ANCHOR.y)}`} pathLength={1} />
                <circle className="ar-node" data-link="route" cx={f(ROUTE_ANCHOR.x)} cy={f(ROUTE_ANCHOR.y)} r="4.5" />

                {/* object tags */}
                <foreignObject className="ar-tag-fo" x={ENTRANCE_BOX.x0} y={ENTRANCE_BOX.y1 + 10} width="220" height="30">
                  <div className="ar-tag">{t.hud.trackEntrance}</div>
                </foreignObject>
                <foreignObject className="ar-tag-fo" x="498" y="622" width="180" height="30">
                  <div className="ar-tag">{t.hud.trackArcade}</div>
                </foreignObject>
              </g>

              {/* scan sweep (moved by GSAP on reveal) */}
              <g className="ar-scan">
                <rect x="-260" y="-80" width="260" height="1060" fill={`url(#${id("scan")})`} />
                <rect x="-2" y="-80" width="2" height="1060" fill="#8FE7FF" opacity="0.85" />
              </g>

              {/* contextual cards — float a touch in front of the plaza */}
              <g className="ar-layer" data-depth="26">
                <g className="ar-fo--wide">
                  {/* positions clear the head (top-start) and controls (bottom-start) from 4:3 to 2.2:1 */}
                  <foreignObject x="250" y="440" width="250" height="132">
                    <div className="ar-card-wrap" data-link="arcade">
                      <div className="ar-card">
                        <Kicker icon="pin" label={t.hud.card} />
                        <strong>{t.hud.cardMeta}</strong>
                      </div>
                    </div>
                  </foreignObject>
                  <foreignObject x="770" y="470" width="240" height="122">
                    <div className="ar-card-wrap" data-link="route">
                      <div className="ar-card">
                        <Kicker icon="route" label={t.hud.route} />
                        <strong>{t.hud.routeMeta}</strong>
                        <span className="ar-card__meta">
                          <i className="ar-card__bar" aria-hidden />
                          {t.hud.time}
                        </span>
                      </div>
                    </div>
                  </foreignObject>
                </g>
                <g className="ar-fo--narrow">
                  <foreignObject className="ar-fo__ctx" x="612" y="330" width="250" height="132">
                    <div className="ar-card-wrap" data-link="arcade">
                      <div className="ar-card">
                        <Kicker icon="pin" label={t.hud.card} />
                        <strong>{t.hud.cardMeta}</strong>
                      </div>
                    </div>
                  </foreignObject>
                  <foreignObject className="ar-fo__route" x="612" y="478" width="250" height="122">
                    <div className="ar-card-wrap" data-link="route">
                      <div className="ar-card">
                        <Kicker icon="route" label={t.hud.route} />
                        <strong>{t.hud.routeMeta}</strong>
                        <span className="ar-card__meta">
                          <i className="ar-card__bar" aria-hidden />
                          {t.hud.time}
                        </span>
                      </div>
                    </div>
                  </foreignObject>
                </g>
              </g>
            </g>
          )}
        </g>
      </g>
    </svg>
  );
}

/** Memoised: pointer moves and slider drags never re-render the two plazas. */
export const ARWorld = memo(ARWorldBase);
