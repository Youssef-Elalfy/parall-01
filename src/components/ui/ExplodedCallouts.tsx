"use client";

import { useEffect, useRef } from "react";
import { productFrame, projected, type AnchorKey } from "../three/anchors";

/**
 * Exploded-view annotation system.
 *
 * Labels never sit on the product. Each frame (only while the section is on screen):
 *  1. read the product's projected screen bounds and each component's projected point;
 *  2. put every label in the gutter on its component's side of the product
 *     (language-agnostic geometry; text aligns toward the product, so Arabic and
 *     English both read cleanly) — leaders never cross the model;
 *  3. resolve vertical collisions inside each gutter (sorted by component height,
 *     pushed apart, kept between the nav and the bottom edge);
 *  4. draw an elbowed leader from the exact component point to the label.
 * Each label's opacity and leader draw-on follow the real explode amount of the 3D rig
 * (so they are in sync both ways). If neither gutter can hold a label (phones, narrow
 * tablets) the system switches to lettered pins on the model + a compact legend.
 */
export interface Callout {
  key: AnchorKey;
  index: string;
  title: string;
  note: string;
}

const GAP = 44; // product edge → label column
const PAD = 24; // viewport edge padding
const RAIL = 72; // desktop progress rail on the inline-end side
const MIN_SPACING = 18;
const THRESH = [0.3, 0.45, 0.6, 0.74];

export function ExplodedCallouts({ items, sectionRef }: { items: Callout[]; sectionRef: React.RefObject<HTMLElement | null> }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    const section = sectionRef.current;
    if (!el || !section) return;
    const boxes = Array.from(el.querySelectorAll<HTMLElement>(".callout"));
    const pins = Array.from(el.querySelectorAll<HTMLElement>(".callout-pin"));
    const paths = Array.from(el.querySelectorAll<SVGPathElement>(".callouts__lines path"));
    const svg = el.querySelector<SVGSVGElement>(".callouts__lines");
    const state = boxes.map(() => ({ x: 0, y: 0, init: false }));
    let raf = 0;
    let on = false;
    let last = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const r = productFrame.rect;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (!r) return;
      svg?.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
      const rtl = document.documentElement.dir === "rtl";
      const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 72;
      const rail = vw > 1100 ? RAIL : 0;
      const leftLimit = PAD + (rtl ? rail : 0);
      const rightLimit = vw - PAD - (rtl ? 0 : rail);
      const cx = (r.left + r.right) / 2;
      const ex = productFrame.explode;

      // 2. columns
      const sizes = boxes.map((b) => ({ w: b.offsetWidth, h: b.offsetHeight }));
      const maxW = Math.max(...sizes.map((s) => s.w));
      const roomL = r.left - GAP - leftLimit >= maxW;
      const roomR = rightLimit - (r.right + GAP) >= maxW;
      // a label is only ever placed on its own component's side: if that side is full,
      // the whole view switches to pins + legend (no leader may cross the product)
      const sides = items.map((it) => ((projected.get(it.key)?.x ?? cx) < cx ? "l" : "r"));
      const compact = (sides.includes("l") && !roomL) || (sides.includes("r") && !roomR);
      el.dataset.mode = compact ? "compact" : "gutter";

      const placed = items.map((it, i) => {
        const p = projected.get(it.key) ?? { x: cx, y: (r.top + r.bottom) / 2 };
        const side = sides[i] as "l" | "r";
        return { i, p, side, ...sizes[i] };
      });

      // 3. vertical layout per column
      const top = navH + 16;
      const bottom = vh - PAD;
      for (const side of ["l", "r"] as const) {
        const col = placed.filter((q) => q.side === side).sort((a, b) => a.p.y - b.p.y);
        const ys = col.map((q) => q.p.y - q.h / 2);
        for (let k = 0; k < col.length; k++) {
          const minY = k === 0 ? top : ys[k - 1] + col[k - 1].h + MIN_SPACING;
          ys[k] = Math.max(ys[k], minY);
        }
        for (let k = col.length - 1; k >= 0; k--) {
          const maxY = k === col.length - 1 ? bottom - col[k].h : ys[k + 1] - col[k].h - MIN_SPACING;
          ys[k] = Math.min(ys[k], maxY);
        }
        col.forEach((q, k) => {
          const x = side === "l" ? r.left - GAP - q.w : r.right + GAP;
          const s = state[q.i];
          if (!s.init) {
            s.x = x;
            s.y = ys[k];
            s.init = true;
          }
          const k2 = 1 - Math.exp(-dt * 14);
          s.x += (x - s.x) * k2;
          s.y += (ys[k] - s.y) * k2;
        });
      }

      // 4. write
      placed.forEach((q) => {
        const b = boxes[q.i];
        const s = state[q.i];
        const a = Math.max(0, Math.min(1, (ex - THRESH[q.i]) / 0.18));
        const pin = pins[q.i];
        pin.style.transform = `translate3d(${q.p.x.toFixed(1)}px, ${q.p.y.toFixed(1)}px, 0)`;
        pin.style.opacity = String(a);
        b.style.opacity = compact ? "0" : String(a);
        b.style.transform = `translate3d(${s.x.toFixed(1)}px, ${(s.y + (1 - a) * 10).toFixed(1)}px, 0)`;
        b.dataset.side = q.side;
        const path = paths[q.i];
        if (compact) {
          path.style.opacity = "0";
          return;
        }
        const ly = s.y + Math.min(q.h / 2, 22);
        const edge = q.side === "l" ? s.x + q.w + 8 : s.x - 8;
        const elbow = q.side === "l" ? edge + 18 : edge - 18;
        path.setAttribute("d", `M${q.p.x.toFixed(1)} ${q.p.y.toFixed(1)} L${elbow.toFixed(1)} ${ly.toFixed(1)} L${edge.toFixed(1)} ${ly.toFixed(1)}`);
        path.style.opacity = "1";
        path.style.strokeDashoffset = String(1 - a);
      });
    };

    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !on) {
          on = true;
          last = performance.now();
          raf = requestAnimationFrame(frame);
        } else if (!e.isIntersecting && on) {
          on = false;
          cancelAnimationFrame(raf);
        }
      },
      { threshold: 0 },
    );
    io.observe(section);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [items, sectionRef]);

  return (
    <div className="callouts step-show-1" ref={root} aria-hidden>
      <svg className="callouts__lines" preserveAspectRatio="none">
        {items.map((it) => (
          <path key={it.key} pathLength={1} />
        ))}
      </svg>
      {items.map((it) => (
        <span className="callout-pin" key={`pin-${it.key}`}>
          <span className="callout-pin__dot" />
          <span className="callout-pin__idx" translate="no">
            {it.index}
          </span>
        </span>
      ))}
      {items.map((it) => (
        <div className="callout" key={it.key}>
          <span className="callout__idx" translate="no">
            {it.index}
          </span>
          <strong className="callout__title">{it.title}</strong>
          <span className="callout__note">{it.note}</span>
        </div>
      ))}
      <ol className="callouts__legend">
        {items.map((it) => (
          <li key={it.key}>
            <span className="callout__idx" translate="no">
              {it.index}
            </span>
            <strong>{it.title}</strong>
            <span>{it.note}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
