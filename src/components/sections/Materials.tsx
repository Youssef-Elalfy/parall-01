"use client";

import { useCallback, useEffect, useRef } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { useSectionProgress } from "@/lib/animation/useScrollEngine";
import { MATERIAL_PART, MATERIAL_PART_RTL, type MaterialId } from "@/lib/animation/shots";
import { useExperience } from "@/state/store";
import { tick } from "@/lib/sound";
import { registerAnchor } from "../three/anchors";
import { SplitLines, Words } from "../ui/SplitLines";

const SWATCHES: { id: MaterialId; cls: string }[] = [
  { id: "titanium", cls: "swatch--titanium" },
  { id: "composite", cls: "swatch--composite" },
  { id: "glass", cls: "swatch--glass" },
  { id: "light", cls: "swatch--light" },
];

/** Pin that sits on the inspected component (projected from the 3D rig). */
function FocusPin({ id, rtl }: { id: MaterialId | null; rtl: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !id) return;
    return registerAnchor((rtl ? MATERIAL_PART_RTL : MATERIAL_PART)[id], el);
  }, [id, rtl]);
  return (
    <div className={`focus-pin ${id ? "is-on" : ""}`} ref={ref} aria-hidden>
      <i />
    </div>
  );
}

export function Materials() {
  const { t, dir } = useLocale();
  const ref = useRef<HTMLElement>(null);
  const focus = useExperience((s) => s.matFocus);
  const setFocus = useExperience((s) => s.setMatFocus);
  const onStep = useCallback((step: number) => {
    // samples live in the Finish step; leaving it hands the camera back to the scroll
    if (step !== 1 && useExperience.getState().matFocus) useExperience.getState().setMatFocus(null);
  }, []);
  useSectionProgress(ref, [0.34, 0.68], onStep);
  const m = t.materials;

  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocus(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, setFocus]);

  const choose = (id: MaterialId, i: number) => {
    setFocus(focus === id ? null : id);
    tick(0.9 + i * 0.1);
  };
  const sample = focus ? m.samples[focus] : null;

  return (
    <section
      ref={ref}
      id="design"
      tabIndex={-1}
      className="scene materials sticky-scene"
      data-scene
      data-bg="#F3F1EB"
      data-theme="light"
      data-focus={focus ?? undefined}
      aria-labelledby="materials-title"
    >
      <span className="shot" data-shot="materials-side" style={{ top: "15%" }} />
      <span className="shot" data-shot="materials-hinge" style={{ top: "50%" }} />
      <span className="shot" data-shot="materials-front" style={{ top: "85%" }} />
      <div className="stage">
        <FocusPin id={focus} rtl={dir === "rtl"} />
        <div className="wrap materials__layout">
          <header className="materials__head">
            <p className="eyebrow" data-motion="track">
              {m.eyebrow}
            </p>
            <SplitLines lines={m.title} id="materials-title" className="h2" motion="rise" />
            <Words text={m.body} className="lede" motion="words" />
            <p className="materials__trio" aria-hidden data-motion="track">
              {m.trio}
            </p>
          </header>

          <article className="mat-block mat-block--form step-only-0">
            <span className="mat-block__num" translate="no">
              01
            </span>
            <p className="eyebrow">{m.form.k}</p>
            <h3>{m.form.t}</h3>
            <p>{m.form.b}</p>
          </article>

          <article className="mat-block mat-block--finish step-only-1">
            <span className="mat-block__num" translate="no">
              02
            </span>
            <p className="eyebrow">{m.finish.k}</p>
            <h3>{m.finish.t}</h3>
            <p>{m.finish.b}</p>
            <div className="swatches" role="group" aria-label={m.explore}>
              {SWATCHES.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className="swatch-btn"
                  aria-pressed={focus === s.id}
                  onClick={() => choose(s.id, i)}
                >
                  <span className={`swatch ${s.cls}`} aria-hidden />
                  <span className="swatch-btn__text">
                    <span className="swatch-btn__name">{m.samples[s.id].name}</span>
                    <span className="swatch-btn__part">{m.samples[s.id].part}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="mat-focus" aria-live="polite">
              {sample ? (
                <div className="mat-focus__card" key={focus}>
                  <p className="mat-focus__detail">{sample.detail}</p>
                  <button type="button" className="mat-focus__back" onClick={() => setFocus(null)}>
                    <span aria-hidden>←</span> {m.back}
                  </button>
                </div>
              ) : (
                <p className="mat-focus__hint">{m.explore}</p>
              )}
            </div>
          </article>

          <article className="mat-block mat-block--feel step-only-2">
            <span className="mat-block__num" translate="no">
              03
            </span>
            <p className="eyebrow">{m.feel.k}</p>
            <h3>{m.feel.t}</h3>
            <p>{m.feel.b}</p>
            <p className="mat-block__detail">{m.detail}</p>
          </article>
        </div>
      </div>
    </section>
  );
}
