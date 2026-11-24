import type Lenis from "lenis";
import type { ShotMark, ShotName } from "./shots";

/**
 * Mutable, non-reactive state shared between the DOM scroll layer and the
 * WebGL render loop. Written by scroll/pointer handlers, read in useFrame.
 */
export const scrollState: {
  marks: ShotMark[];
  lenis: Lenis | null;
  /** 0..1 intro reveal (loader -> hero), derived from introStart each frame */
  intro: number;
  /** performance.now() when the intro began; null = not started */
  introStart: number | null;
  /** user orbit in the configurator (radians) */
  user: { yaw: number; pitch: number };
  dragging: boolean;
} = {
  marks: [],
  lenis: null,
  intro: 0,
  introStart: null,
  user: { yaw: 0, pitch: 0 },
  dragging: false,
};

/** Layout signature the marks were measured against (see ensureMarks). */
let measuredSig = "";
function layoutSig(): string {
  const d = document.documentElement;
  return `${d.scrollHeight}|${window.innerWidth}|${window.innerHeight}|${d.lang}`;
}

/**
 * Re-measure the shot markers whenever the layout they were measured against
 * changed (fonts, locale switch, resize, HMR, late images). Called every frame
 * by the render loop: the check is a few property reads; the measurement only
 * runs when something actually moved. Without this, markers measured against
 * an older layout made the hero sample a later shot at scrollY = 0.
 */
export function ensureMarks(): void {
  if (typeof window === "undefined") return;
  if (scrollState.marks.length === 0 || layoutSig() !== measuredSig) measureShots();
}

export function measureShots(): void {
  if (typeof window === "undefined") return;
  measuredSig = layoutSig();
  const vh = window.innerHeight;
  const sy = window.scrollY;
  const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-shot]"));
  const marks: ShotMark[] = nodes.map((el) => ({
    y: el.getBoundingClientRect().top + sy - vh * 0.5,
    name: el.dataset.shot as ShotName,
  }));
  marks.sort((a, b) => a.y - b.y);
  scrollState.marks = marks;
}

export function scrollToTarget(target: string | number, immediate = false): void {
  const lenis = scrollState.lenis;
  if (typeof target === "string") {
    const el = document.querySelector<HTMLElement>(target);
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: 0, immediate, duration: 1.6 });
    else el.scrollIntoView({ behavior: immediate ? "auto" : "smooth", block: "start" });
    return;
  }
  if (lenis) lenis.scrollTo(target, { immediate, duration: 1.6 });
  else window.scrollTo({ top: target, behavior: immediate ? "auto" : "smooth" });
}
