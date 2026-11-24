"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { measureShots, scrollState } from "./scrollState";

gsap.registerPlugin(ScrollTrigger);

declare global {
  interface Window {
    /** dev-only QA hook: jump the smooth-scroller to a position */
    __parallScrollTo?: (y: number) => void;
  }
}

/**
 * Lenis smooth scrolling synced to GSAP's ticker (single RAF), ScrollTrigger
 * refresh → re-measures the camera shot markers. Disabled for reduced motion.
 */
export function useScrollEngine(reduced: boolean): void {
  useEffect(() => {
    let lenis: Lenis | null = null;
    const tick = (time: number) => lenis?.raf(time * 1000);

    if (!reduced) {
      lenis = new Lenis({ lerp: 0.095, smoothWheel: true, wheelMultiplier: 0.95, touchMultiplier: 1.4 });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      scrollState.lenis = lenis;
    }

    if (process.env.NODE_ENV !== "production") {
      window.__parallScrollTo = (y: number) => {
        if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
      };
    }

    const onRefresh = () => measureShots();
    ScrollTrigger.addEventListener("refresh", onRefresh);
    measureShots();

    const ro = new ResizeObserver(() => ScrollTrigger.refresh());
    ro.observe(document.body);
    let fontsAlive = true;
    document.fonts?.ready.then(() => {
      if (fontsAlive) ScrollTrigger.refresh();
    });

    return () => {
      fontsAlive = false;
      ro.disconnect();
      ScrollTrigger.removeEventListener("refresh", onRefresh);
      gsap.ticker.remove(tick);
      lenis?.destroy();
      if (scrollState.lenis === lenis) scrollState.lenis = null;
    };
  }, [reduced]);
}

/** Section progress → `--p` custom property and discrete `data-step`. */
export function useSectionProgress(
  ref: React.RefObject<HTMLElement | null>,
  steps: number[],
  onStep?: (step: number) => void,
  /** when given, `--p` is NOT written to the section (avoids subtree style recalc on
   *  heavy sections); the callback applies progress to the few elements that need it */
  onProgress?: (p: number) => void,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = -1;
    const st = ScrollTrigger.create({
      trigger: el,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        const p = self.progress;
        if (onProgress) onProgress(p);
        else el.style.setProperty("--p", p.toFixed(4));
        let step = 0;
        for (let i = 0; i < steps.length; i++) if (p >= steps[i]) step = i + 1;
        if (step !== last) {
          last = step;
          el.dataset.step = String(step);
          onStep?.(step);
        }
      },
    });
    el.dataset.step = "0";
    if (onProgress) onProgress(0);
    else el.style.setProperty("--p", "0");
    return () => st.kill();
    // steps are static per section
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
}
