"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { scrollState } from "@/lib/animation/scrollState";
import { FINISHES, FINISH_ORDER, TINTS, TINT_ORDER } from "@/data/product";
import { useExperience } from "@/state/store";
import { tick } from "@/lib/sound";
import { SplitLines, Words } from "../ui/SplitLines";

const YAW = 1.15;
const PITCH = 0.38;
const clamp = (v: number, a: number) => Math.max(-a, Math.min(a, v));

export function Configurator() {
  const { t } = useLocale();
  const c = t.configurator;
  const finish = useExperience((s) => s.finish);
  const tint = useExperience((s) => s.tint);
  const setFinish = useExperience((s) => s.setFinish);
  const setTint = useExperience((s) => s.setTint);
  const resetConfig = useExperience((s) => s.resetConfig);
  const [announce, setAnnounce] = useState("");
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // the stage tint feeds the backdrop wash (behind the canvas), not a layer over the model
  useEffect(() => {
    document.documentElement.style.setProperty("--stage", FINISHES[finish].stage);
  }, [finish]);

  const rotate = (dy: number, dp: number) => {
    const u = scrollState.user;
    u.yaw = clamp(u.yaw + dy, YAW);
    u.pitch = clamp(u.pitch + dp, PITCH);
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    scrollState.dragging = true;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    rotate(dx * 0.009, e.pointerType === "touch" ? 0 : dy * 0.005);
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    scrollState.dragging = false;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, [number, number]> = {
      ArrowLeft: [-0.16, 0],
      ArrowRight: [0.16, 0],
      ArrowUp: [0, -0.08],
      ArrowDown: [0, 0.08],
    };
    const v = map[e.key];
    if (!v) return;
    e.preventDefault();
    rotate(v[0], v[1]);
  };

  const chooseFinish = (id: (typeof FINISH_ORDER)[number], i: number) => {
    setFinish(id);
    setAnnounce(c.selectedFrame(c.finishes[id]));
    tick(1 + i * 0.1);
  };
  const chooseTint = (id: (typeof TINT_ORDER)[number], i: number) => {
    setTint(id);
    setAnnounce(c.selectedLens(c.tints[id]));
    tick(1.3 + i * 0.1);
  };
  const reset = () => {
    resetConfig();
    scrollState.user.yaw = 0;
    scrollState.user.pitch = 0;
    setAnnounce(c.resetDone);
    tick(0.8);
  };

  return (
    <section
      id="customize"
      tabIndex={-1}
      className="scene config"
      data-scene
      data-bg="#E7E9EC"
      data-theme="light"
      data-finish={finish}
      aria-labelledby="config-title"
    >
      {/* reached when the section top meets the viewport top (on phones the section is taller than the screen) */}
      <span className="shot" data-shot="config" style={{ top: "50svh" }} />
      <div className="wrap config__layout">
        <div className="config__panel">
          <p className="eyebrow" data-motion="track">{c.eyebrow}</p>
          <SplitLines lines={c.title} id="config-title" className="h2" motion="rise" />
          <Words text={c.body} className="lede" motion="words" />

          <fieldset className="options">
            <legend>{c.frame}</legend>
            <div className="options__row" data-motion="stagger">
              {FINISH_ORDER.map((id, i) => (
                <button
                  key={id}
                  type="button"
                  className={`option ${finish === id ? "is-selected" : ""}`}
                  aria-pressed={finish === id}
                  onClick={() => chooseFinish(id, i)}
                >
                  <span className="option__swatch" style={{ background: FINISHES[id].swatch }} aria-hidden />
                  <span className="option__text">
                    <strong>{c.finishes[id]}</strong>
                    <span>{c.finishNotes[id]}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="options">
            <legend>{c.lens}</legend>
            <div className="options__row" data-motion="stagger">
              {TINT_ORDER.map((id, i) => (
                <button
                  key={id}
                  type="button"
                  className={`option option--lens ${tint === id ? "is-selected" : ""}`}
                  aria-pressed={tint === id}
                  onClick={() => chooseTint(id, i)}
                >
                  <span className="option__swatch option__swatch--lens" style={{ background: TINTS[id].swatch }} aria-hidden />
                  <span className="option__text">
                    <strong>{c.tints[id]}</strong>
                    <span>{c.tintNotes[id]}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="config__actions" data-motion="stagger">
            <p className="config__summary">
              <span>{c.summary}</span>
              <strong>
                {c.finishes[finish]} · {c.tints[tint]}
              </strong>
            </p>
            <button type="button" className="btn btn--ghost" onClick={reset} aria-label={c.resetLabel}>
              {c.reset}
            </button>
          </div>
          <p className="sr-only" aria-live="polite">
            {announce}
          </p>
        </div>

        <div
          className={`config__stage ${isDragging ? "is-dragging" : ""}`}
          tabIndex={0}
          role="group"
          aria-roledescription="3D viewer"
          aria-label={c.rotateLabel}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
        >
          <div className="config__hint">
            <button type="button" className="icon-btn" aria-label={c.rotateLeft} onClick={() => rotate(-0.3, 0)} onPointerDown={(e) => e.stopPropagation()}>
              ‹
            </button>
            <span>{c.rotate}</span>
            <button type="button" className="icon-btn" aria-label={c.rotateRight} onClick={() => rotate(0.3, 0)} onPointerDown={(e) => e.stopPropagation()}>
              ›
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
