"use client";

import { useCallback, useEffect, useRef } from "react";
import gsap from "gsap";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { useSectionProgress } from "@/lib/animation/useScrollEngine";
import { useExperience } from "@/state/store";
import { SplitLines, Words } from "../ui/SplitLines";
import { ARWorld } from "./ARWorld";

/**
 * Through the lens — AR concept compare.
 *
 * Interaction model (why it feels immediate):
 * - The divider is written straight to the DOM (`--v`, range value) on every pointer
 *   move; React state is only committed when the gesture ends or when the
 *   Normal/PARALL boundary is crossed. The two SVG plazas are memoised.
 * - Parallax layers are moved by one rAF loop with a short exponential follow
 *   (~150 ms), no CSS transitions to fight against.
 * - The spatial layer is a GSAP timeline played when the iris has opened and
 *   reversed when scrolling back, so the scene state always matches the scroll.
 */
export function ARExperience() {
  const { t, dir } = useLocale();
  const ref = useRef<HTMLElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const valueTween = useRef<gsap.core.Tween | null>(null);
  const live = useRef({ v: useExperience.getState().arValue, touched: false, swept: false });
  const value = useExperience((s) => s.arValue);
  const setValue = useExperience((s) => s.setArValue);
  const dragging = useRef(false);
  const rtl = dir === "rtl";
  const rtlRef = useRef(rtl);

  /** write the compare position without a React render */
  const writeValue = useCallback(
    (v: number) => {
      const c = Math.max(0, Math.min(100, v));
      live.current.v = c;
      // direct writes on the two elements that move (an inherited --v would restyle
      // both full plazas every drag frame); --v is kept as a readable mirror on the world
      const world = worldRef.current;
      if (world) {
        world.dataset.v = c.toFixed(2);
        world.style.setProperty("--v", c.toFixed(2));
        const view = world.querySelector<HTMLElement>(".ar-view--parall");
        const div = world.querySelector<HTMLElement>(".ar-divider");
        const cut = `${(100 - c).toFixed(3)}%`;
        if (view) view.style.clipPath = rtlRef.current ? `inset(0 0 0 ${cut})` : `inset(0 ${cut} 0 0)`;
        if (div) {
          div.style.left = rtlRef.current ? "auto" : `${c.toFixed(3)}%`;
          div.style.right = rtlRef.current ? `${c.toFixed(3)}%` : "auto";
        }
      }
      const r = rangeRef.current;
      if (r) {
        r.value = String(Math.round(c));
        r.setAttribute("aria-valuetext", t.ar.valueText(Math.round(c)));
      }
      // keep the Normal / PARALL buttons honest without re-rendering every frame
      if (c >= 50 !== useExperience.getState().arValue >= 50) setValue(c);
    },
    [setValue, t.ar],
  );

  useEffect(() => {
    rtlRef.current = rtl;
    writeValue(live.current.v);
  }, [rtl, writeValue]);

  const animateTo = useCallback(
    (target: number, duration = 0.8) => {
      valueTween.current?.kill();
      const reduced = useExperience.getState().reducedMotion;
      if (reduced) {
        writeValue(target);
        setValue(target);
        return;
      }
      const proxy = { v: live.current.v };
      valueTween.current = gsap.to(proxy, {
        v: target,
        duration,
        ease: "power3.inOut",
        onUpdate: () => writeValue(proxy.v),
        onComplete: () => setValue(target),
      });
    },
    [setValue, writeValue],
  );

  // `--v` is owned imperatively (pointer precision). The store value is rounded, so it only
  // re-syncs the DOM when the change did not come from the live gesture (e.g. remount).
  useEffect(() => {
    if (dragging.current || valueTween.current?.isActive()) return;
    if (Math.abs(value - live.current.v) > 0.6 || !worldRef.current?.style.getPropertyValue("--v")) writeValue(value);
  }, [value, writeValue]);

  // ---- spatial layer timeline (built per locale; DOM text/positions differ) ----
  useEffect(() => {
    const root = worldRef.current;
    if (!root) return;
    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(root.querySelector(".ar-view--parall"));
      const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
      tl.fromTo(q(".ar-scan"), { x: 0, autoAlpha: 1 }, { x: 1900, duration: 1.5, ease: "power2.inOut" }, 0)
        .to(q(".ar-scan"), { autoAlpha: 0, duration: 0.3 }, 1.25)
        .fromTo(q(".ar-mesh"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 1 }, 0.25)
        .fromTo(q(".ar-track"), { autoAlpha: 0, scale: 1.18, transformOrigin: "50% 50%" }, { autoAlpha: 1, scale: 1, duration: 0.6, stagger: 0.14 }, 0.45)
        .fromTo(q(".ar-tag-fo"), { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.1 }, 0.7)
        .fromTo(q(".ar-route-glow, .ar-route-core"), { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.3, ease: "power2.inOut" }, 0.55)
        .fromTo(q(".ar-route-flow"), { autoAlpha: 0 }, { autoAlpha: 0.45, duration: 0.4 }, 1.6)
        .fromTo(q(".ar-chev"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, stagger: 0.12 }, 0.9)
        .fromTo(q(".ar-dest"), { autoAlpha: 0, scale: 0.4, transformOrigin: "50% 50%" }, { autoAlpha: 1, scale: 1, duration: 0.6, ease: "back.out(2)" }, 1.6)
        // destination ring pulses twice on arrival (finite: no idle repaint of the plaza)
        .fromTo(q(".ar-pulse"), { scale: 0.55, opacity: 0.9 }, { scale: 1.6, opacity: 0, duration: 1.2, ease: "power2.out", repeat: 1 }, 1.9)
        .fromTo(q(".ar-plate"), { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.7, ease: "power2.out" }, 1.0)
        .fromTo(q(".ar-leader"), { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5 }, 1.2)
        .fromTo(q(".ar-node"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 1.4)
        .fromTo(q(".ar-card-wrap"), { autoAlpha: 0, y: 18, clipPath: "inset(0 0 100% 0)" }, { autoAlpha: 1, y: 0, clipPath: "inset(0 0 0% 0)", duration: 0.75, stagger: 0.15 }, 1.15);
      const sec = ref.current;
      if (sec) {
        tl.fromTo(sec.querySelector(".ar__status-scan"), { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, 1.6).fromTo(
          sec.querySelector(".ar__status-done"),
          { autoAlpha: 0, y: 6 },
          { autoAlpha: 1, y: 0, duration: 0.4 },
          1.75,
        );
      }
      tlRef.current = tl;
      // resume in the state the scroll position calls for
      if (sec && Number(sec.dataset.step) >= 1) tl.progress(1);
    }, root);
    return () => {
      ctx.revert();
      tlRef.current = null;
    };
  }, [dir]);

  const onStep = useCallback(
    (step: number) => {
      document.documentElement.dataset.theme = step >= 1 ? "light" : "dark";
      const tl = tlRef.current;
      const reduced = useExperience.getState().reducedMotion;
      if (!tl) return;
      if (step >= 1) {
        if (reduced) tl.progress(1);
        else tl.timeScale(1).play();
        // first arrival: sweep the divider from full PARALL to its resting point
        if (!live.current.swept && !live.current.touched) {
          live.current.swept = true;
          writeValue(100);
          if (reduced) writeValue(useExperience.getState().arValue);
          else {
            valueTween.current?.kill();
            const proxy = { v: 100 };
            valueTween.current = gsap.to(proxy, {
              v: 68,
              delay: 1.9,
              duration: 1.3,
              ease: "power3.inOut",
              onUpdate: () => writeValue(proxy.v),
              onComplete: () => setValue(68),
            });
          }
        }
      } else {
        if (reduced) tl.progress(0);
        else tl.timeScale(2).reverse();
      }
    },
    [setValue, writeValue],
  );
  // progress → iris + camera push, written to just these elements (see useSectionProgress)
  const onProgress = useCallback((p: number) => {
    const world = worldRef.current;
    if (!world) return;
    const iris = Math.min(1, Math.max(0, (p - 0.04) / 0.26));
    world.style.clipPath = `circle(${(iris * 82).toFixed(3)}vmax at 50% 50%)`;
    const push = `scale(${(1.06 - p * 0.06).toFixed(4)})`;
    world.querySelectorAll<SVGSVGElement>(".ar-svg").forEach((svg) => (svg.style.transform = push));
  }, []);
  useSectionProgress(ref, [0.3], onStep, onProgress);

  // ---- parallax: one rAF loop, short exponential follow, imperative transforms ----
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let layers: { el: SVGGElement; depth: number }[] = [];
    const collect = () => {
      layers = Array.from(world.querySelectorAll<SVGGElement>("[data-depth]")).map((el) => ({ el, depth: Number(el.dataset.depth) || 0 }));
    };
    collect();
    let raf = 0;
    let last = performance.now();
    let active = false;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = 1 - Math.exp(-dt * 16); // ~95 % in ≈190 ms
      cur.x += (target.x - cur.x) * k;
      cur.y += (target.y - cur.y) * k;
      // the plaza is mirrored in RTL, so its x axis is too
      const sx = rtl ? -cur.x : cur.x;
      for (const l of layers) l.el.setAttribute("transform", `translate(${(-sx * l.depth).toFixed(2)} ${(-cur.y * l.depth * 0.45).toFixed(2)})`);
      if (Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) > 0.0005) raf = requestAnimationFrame(loop);
      else active = false;
    };
    const kick = () => {
      if (active) return;
      active = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const onMove = (e: PointerEvent) => {
      const reticle = reticleRef.current;
      if (e.pointerType !== "mouse") return;
      const r = world.getBoundingClientRect();
      if (reticle) {
        reticle.style.transform = `translate3d(${(e.clientX - r.left).toFixed(1)}px, ${(e.clientY - r.top).toFixed(1)}px, 0)`;
        reticle.dataset.on = "1";
      }
      if (useExperience.getState().reducedMotion) return;
      target.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      target.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      kick();
    };
    const onLeave = () => {
      target.x = 0;
      target.y = 0;
      if (reticleRef.current) reticleRef.current.dataset.on = "0";
      kick();
    };
    world.addEventListener("pointermove", onMove, { passive: true });
    world.addEventListener("pointerleave", onLeave);
    const mo = new MutationObserver(collect);
    mo.observe(world, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      world.removeEventListener("pointermove", onMove);
      world.removeEventListener("pointerleave", onLeave);
      mo.disconnect();
    };
  }, [rtl]);

  // ---- hover a card → highlight the object it describes ----
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const overlay = () => world.querySelector<SVGGElement>(".ar-view--parall .ar-overlay");
    const over = (e: PointerEvent) => {
      const link = (e.target as Element | null)?.closest?.("[data-link]")?.getAttribute("data-link");
      const o = overlay();
      if (o) {
        if (link) o.dataset.focus = link;
        else delete o.dataset.focus;
      }
    };
    world.addEventListener("pointerover", over);
    return () => world.removeEventListener("pointerover", over);
  }, []);

  // ---- divider drag: follows the pointer 1:1 ----
  const valueFromX = (clientX: number) => {
    const el = worldRef.current;
    if (!el) return live.current.v;
    const r = el.getBoundingClientRect();
    const frac = (clientX - r.left) / r.width;
    return (rtl ? 1 - frac : frac) * 100;
  };
  const onHandleDown = (e: React.PointerEvent<HTMLElement>) => {
    dragging.current = true;
    live.current.touched = true;
    valueTween.current?.kill();
    e.currentTarget.setPointerCapture(e.pointerId);
    writeValue(valueFromX(e.clientX));
  };
  const onHandleMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragging.current) return;
    writeValue(valueFromX(e.clientX));
  };
  const onHandleUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setValue(live.current.v);
  };

  return (
    <section
      ref={ref}
      id="experience"
      tabIndex={-1}
      className="scene ar sticky-scene"
      data-scene
      data-bg="#0B0E14"
      data-theme="dark"
      aria-labelledby="ar-title"
    >
      <span className="shot" data-shot="portal" style={{ top: "8%" }} />
      <span className="shot" data-shot="ar" style={{ top: "30%" }} />
      <span className="shot" data-shot="ar" style={{ top: "96%" }} />
      <div className="stage">
        <div ref={worldRef} className="ar-world">
          <div className="ar-view ar-view--normal">
            <ARWorld mode="normal" t={t.ar} rtl={rtl} />
          </div>
          <div className="ar-view ar-view--parall">
            <ARWorld mode="parall" t={t.ar} rtl={rtl} />
            <div className="ar-tint" aria-hidden />
            <div className="ar-reticle" ref={reticleRef} aria-hidden>
              <i />
            </div>
          </div>
          <div
            className="ar-divider"
            aria-hidden
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
          >
            <span className="ar-divider__line" />
            <span className="ar-divider__labels">
              <span className="ar-label ar-label--parall">{t.ar.parall}</span>
              <span className="ar-label ar-label--normal">{t.ar.normal}</span>
            </span>
            <span className="ar-handle">
              <span className="ar-handle__grip">
                <i />
                <i />
              </span>
            </span>
          </div>
        </div>

        <div className="ar__ui wrap">
          <header className="ar__head">
            <p className="eyebrow">
              {t.ar.eyebrow}
              <span className="concept-tag">{t.ar.conceptTag}</span>
            </p>
            <SplitLines lines={t.ar.title} id="ar-title" className="h2" motion="rise" />
            <Words text={t.ar.body} className="lede" motion="words" />
            <p className="ar__status" aria-hidden>
              <span className="ar__status-dot" />
              <span className="ar__status-text">
                <span className="ar__status-scan">{t.ar.scanning}</span>
                <span className="ar__status-done">{t.ar.found}</span>
              </span>
            </p>
          </header>
          <div className="ar__controls">
            <div className="segmented" role="group" aria-label={t.ar.slide}>
              <button
                type="button"
                aria-pressed={value < 50}
                onClick={() => {
                  live.current.touched = true;
                  animateTo(0);
                }}
              >
                {t.ar.normal}
              </button>
              <button
                type="button"
                aria-pressed={value >= 50}
                onClick={() => {
                  live.current.touched = true;
                  animateTo(100);
                }}
              >
                {t.ar.parall}
              </button>
            </div>
            <label className="range">
              <span className="range__label">{t.ar.slide}</span>
              <input
                ref={rangeRef}
                type="range"
                min={0}
                max={100}
                step={1}
                defaultValue={value}
                aria-label={t.ar.sliderLabel}
                aria-valuetext={t.ar.valueText(value)}
                onInput={(e) => {
                  live.current.touched = true;
                  valueTween.current?.kill();
                  writeValue(Number(e.currentTarget.value));
                }}
                onChange={(e) => setValue(Number(e.currentTarget.value))}
              />
            </label>
            <p className="ar__disclaimer">{t.ar.disclaimer}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
