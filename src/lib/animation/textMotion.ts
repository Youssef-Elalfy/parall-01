"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Scroll typography director — one place that turns `data-motion` markup into
 * reversible GSAP ScrollTriggers.
 *
 * Reversibility contract:
 *  - "toggle" treatments use toggleActions "play none none reverse": they play when
 *    the trigger passes its start going down and reverse when you scroll back above it
 *    (mid-animation reversal is native to GSAP). Passing the end never hides content.
 *  - "scrub" treatments are pure functions of scroll position.
 * Every tween animates only the split spans / its own element, never a transform that
 * another system writes (sticky steps animate their containers, the 3D pose is the
 * canvas), so nothing fights. Rebuilt on locale change (the spans are new), killed on
 * unmount, disabled entirely for reduced motion (content stays in its final state).
 *
 * Treatments (value of data-motion):
 *  rise        masked line rise (heading lines)
 *  chars       line mask + per-character rise (EN display type; AR → words)
 *  words       word-by-word blur-to-sharp lift (short copy)
 *  read        scrubbed word brightening as you read (editorial ledes)
 *  track       letter-spacing settle + fade (eyebrows, labels)
 *  stagger     direct children cascade (groups of controls / lists)
 *  draw        horizontal rule draws in (start edge, RTL aware)
 *  finale      scrubbed closing statement: tracking tightens, blur clears, lines rise
 *  hero-out    scrubbed exit of the hero copy as the film moves on
 *
 * Optional: data-motion-trigger="scene" (use the enclosing [data-scene] instead of
 * the element — required inside sticky stages), data-motion-start="top 70%".
 */
const EASE = "expo.out";

function resolveTrigger(el: HTMLElement): { trigger: Element; start: string } {
  const useScene = el.dataset.motionTrigger === "scene" || !!el.closest(".sticky-scene .stage");
  const scene = useScene ? el.closest("[data-scene]") : null;
  const trigger = scene ?? el;
  const start = el.dataset.motionStart ?? (scene ? "top 62%" : "top 86%");
  return { trigger, start };
}

function build(el: HTMLElement, kind: string, rtl: boolean): void {
  const { trigger, start } = resolveTrigger(el);
  const toggle = (tl: gsap.core.Timeline) =>
    ScrollTrigger.create({ trigger, start, animation: tl, toggleActions: "play none none reverse" });

  switch (kind) {
    case "rise": {
      const inner = el.querySelectorAll(".split__inner");
      const tl = gsap.timeline({ paused: true });
      tl.fromTo(inner, { yPercent: 115, rotate: rtl ? -2.5 : 2.5 }, { yPercent: 0, rotate: 0, duration: 1.15, ease: EASE, stagger: 0.09 });
      toggle(tl);
      break;
    }
    case "chars": {
      const chars = el.querySelectorAll(".c");
      const targets = chars.length ? chars : el.querySelectorAll(".w");
      gsap.set(el.querySelectorAll(".split__inner"), { yPercent: 0, rotate: 0 });
      const tl = gsap.timeline({ paused: true });
      tl.fromTo(
        targets,
        { yPercent: 118, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 0.9, ease: EASE, stagger: { each: chars.length ? 0.022 : 0.06, from: rtl ? "end" : "start" } },
      );
      toggle(tl);
      break;
    }
    case "words": {
      const words = el.querySelectorAll(".w");
      const tl = gsap.timeline({ paused: true });
      tl.fromTo(
        words,
        { yPercent: 60, opacity: 0, filter: "blur(8px)" },
        { yPercent: 0, opacity: 1, filter: "blur(0px)", duration: 0.85, ease: "power3.out", stagger: 0.035, clearProps: "filter" },
      );
      toggle(tl);
      break;
    }
    case "read": {
      const words = el.querySelectorAll(".w");
      gsap.fromTo(
        words,
        { opacity: 0.14 },
        {
          opacity: 1,
          ease: "none",
          stagger: 0.12,
          scrollTrigger: { trigger, start, end: el.dataset.motionEnd ?? "top 30%", scrub: 0.6 },
        },
      );
      break;
    }
    case "track": {
      const tl = gsap.timeline({ paused: true });
      // settle to the designed values (eyebrows are intentionally not full opacity)
      const cs = getComputedStyle(el);
      tl.fromTo(el, { opacity: 0, letterSpacing: "0.6em" }, { opacity: +cs.opacity, letterSpacing: cs.letterSpacing, duration: 1.2, ease: "power3.out" });
      toggle(tl);
      break;
    }
    case "stagger": {
      const kids = Array.from(el.children);
      const tl = gsap.timeline({ paused: true });
      tl.fromTo(kids, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: "power3.out", stagger: 0.08 });
      toggle(tl);
      break;
    }
    case "draw": {
      const tl = gsap.timeline({ paused: true });
      tl.fromTo(el, { scaleX: 0, transformOrigin: rtl ? "100% 50%" : "0% 50%" }, { scaleX: 1, duration: 1.2, ease: "power3.inOut" });
      toggle(tl);
      break;
    }
    case "finale": {
      const lines = el.querySelectorAll(".split__inner");
      gsap.fromTo(
        lines,
        { yPercent: 70, opacity: 0, letterSpacing: "0.16em", filter: "blur(14px)" },
        {
          yPercent: 0,
          opacity: 1,
          letterSpacing: "-0.035em",
          filter: "blur(0px)",
          ease: "power2.out",
          stagger: 0.35,
          scrollTrigger: { trigger: el.closest("[data-scene]") ?? el, start: "top 80%", end: "top 12%", scrub: 0.8 },
        },
      );
      break;
    }
    case "hero-out": {
      gsap.fromTo(
        el,
        { yPercent: 0, opacity: 1 },
        {
          yPercent: -18,
          opacity: 0,
          ease: "none",
          scrollTrigger: { trigger: el.closest("[data-scene]") ?? el, start: "top top", end: "bottom 15%", scrub: 0.5 },
        },
      );
      break;
    }
  }
}

export function useTextMotion(locale: string, reduced: boolean, ready: boolean): void {
  useEffect(() => {
    if (reduced || !ready) return;
    const rtl = document.documentElement.dir === "rtl";
    const ctx = gsap.context(() => {
      document.querySelectorAll<HTMLElement>("[data-motion]").forEach((el) => {
        const kinds = (el.dataset.motion ?? "").split(" ").filter(Boolean);
        kinds.forEach((k) => build(el, k, rtl));
      });
    });
    // measure after the new spans and fonts are laid out
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => {
      cancelAnimationFrame(id);
      ctx.revert();
    };
  }, [locale, reduced, ready]);
}
